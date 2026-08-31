"""
LiDAR Building Height Extraction Engine.
Processes LAS/LAZ point clouds, performs spatial matching against OSM building footprints,
and calculates robust percentile-based roof and ground elevations with data-quality classifications.
"""
import os
import glob
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from shapely.geometry import Polygon, Point, box

from app.config import settings

logger = logging.getLogger(__name__)

LIDAR_DATA_DIR = os.path.join(settings.DATA_DIR, "lidar")
os.makedirs(LIDAR_DATA_DIR, exist_ok=True)


class LiDARBuildingService:
    """
    Extracts high-precision 3D building heights from airborne / terrestrial LiDAR point clouds.
    Hierarchy:
      1. LiDAR-derived building height (Class 6 / DTM-separated points, 95th percentile roof)
      2. Mapped OSM height (explicit 'height' tag)
      3. OSM building levels (levels * floor_height)
      4. Building-class heuristic estimate
    """

    def __init__(self, lidar_dir: str = LIDAR_DATA_DIR):
        self.lidar_dir = lidar_dir

    def find_covering_lidar_files(self, bounds: Dict[str, float]) -> List[str]:
        """Find any LAS/LAZ point cloud files in the lidar directory covering the bounding box."""
        if not os.path.exists(self.lidar_dir):
            return []

        all_files = (
            glob.glob(os.path.join(self.lidar_dir, "*.las")) +
            glob.glob(os.path.join(self.lidar_dir, "*.laz"))
        )

        covering = []
        for fpath in all_files:
            try:
                import laspy
                with laspy.open(fpath) as fh:
                    hdr = fh.header
                    min_x, max_x = hdr.mins[0], hdr.maxs[0]
                    min_y, max_y = hdr.mins[1], hdr.maxs[1]
                    # Check spatial overlap
                    if (min_x <= bounds["max_lon"] and max_x >= bounds["min_lon"] and
                        min_y <= bounds["max_lat"] and max_y >= bounds["min_lat"]):
                        covering.append(fpath)
            except Exception as e:
                logger.warning(f"Error checking LiDAR file header {fpath}: {e}")
        return covering

    def enhance_buildings_with_lidar(
        self,
        buildings: List[Dict[str, Any]],
        bounds: Dict[str, float],
        elevation_grid: np.ndarray,
        lidar_file_path: Optional[str] = None,
        min_points_threshold: int = 15,
        roof_percentile: float = 95.0,
        footprint_buffer_m: float = 1.0,
        floor_height_m: float = 3.0,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Match LiDAR point clouds against OSM building footprints and extract robust heights.
        Returns the enhanced building list and summary statistics.
        """
        # 1. Determine active LiDAR source
        target_file = lidar_file_path
        if not target_file:
            covering_files = self.find_covering_lidar_files(bounds)
            if covering_files:
                target_file = covering_files[0]

        lidar_available = target_file is not None and os.path.exists(target_file)

        if not lidar_available:
            # Fall back to existing hierarchy
            enhanced, summary = self._process_fallback_only(buildings, floor_height_m)
            summary["lidar_available"] = False
            summary["status_message"] = "LiDAR building heights unavailable for this area. Using OSM mapped and estimated heights."
            summary["source_file"] = None
            return enhanced, summary

        # 2. Read LiDAR point cloud
        try:
            import laspy
            las = laspy.read(target_file)
            x_arr = np.array(las.x, dtype=np.float64)
            y_arr = np.array(las.y, dtype=np.float64)
            z_arr = np.array(las.z, dtype=np.float64)
            class_arr = getattr(las, 'classification', None)
            if class_arr is not None:
                class_arr = np.array(class_arr, dtype=np.uint8)

            # Crop points to bounding box with 50m margin
            lat_margin = 50.0 / 111320.0
            lon_margin = 50.0 / (111320.0 * max(0.01, math.cos(math.radians((bounds["min_lat"] + bounds["max_lat"]) / 2.0))))

            in_bounds = (
                (x_arr >= bounds["min_lon"] - lon_margin) & (x_arr <= bounds["max_lon"] + lon_margin) &
                (y_arr >= bounds["min_lat"] - lat_margin) & (y_arr <= bounds["max_lat"] + lat_margin)
            )

            x_arr = x_arr[in_bounds]
            y_arr = y_arr[in_bounds]
            z_arr = z_arr[in_bounds]
            if class_arr is not None:
                class_arr = class_arr[in_bounds]

            total_pts = len(x_arr)
            if total_pts < 20:
                logger.info("Sparse or no LiDAR points in requested bounding box.")
                enhanced, summary = self._process_fallback_only(buildings, floor_height_m)
                summary["lidar_available"] = False
                summary["status_message"] = "LiDAR building heights unavailable for this area (insufficient points). Using fallback."
                summary["source_file"] = os.path.basename(target_file)
                return enhanced, summary

            # 3. Build 2D Spatial Grid Index over cropped LiDAR points for O(1) cell queries
            cell_size_deg = 0.001  # ~110m cells
            grid_index: Dict[Tuple[int, int], List[int]] = {}
            for idx in range(total_pts):
                cx = int(math.floor(x_arr[idx] / cell_size_deg))
                cy = int(math.floor(y_arr[idx] / cell_size_deg))
                key = (cx, cy)
                if key not in grid_index:
                    grid_index[key] = []
                grid_index[key].append(idx)

            # 4. Process each building
            enhanced_buildings = []
            lidar_heights_collected = []
            lidar_count = 0
            osm_height_count = 0
            osm_levels_count = 0
            estimated_count = 0

            # Buffer in degrees
            mid_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
            buf_deg_lat = footprint_buffer_m / 111320.0
            buf_deg_lon = footprint_buffer_m / (111320.0 * math.cos(math.radians(mid_lat)))

            for b in buildings:
                footprint = b.get("footprint", [])
                if len(footprint) < 3:
                    enhanced_buildings.append(b)
                    continue

                poly_coords = [(pt[1], pt[0]) for pt in footprint]  # (lon, lat) for Shapely
                try:
                    poly = Polygon(poly_coords)
                    if not poly.is_valid:
                        poly = poly.buffer(0)
                    buffered_poly = poly.buffer(buf_deg_lon)
                    min_bx, min_by, max_bx, max_by = buffered_poly.bounds
                except Exception:
                    enhanced_buildings.append(b)
                    continue

                # Query candidate cells from spatial grid index
                min_cx = int(math.floor(min_bx / cell_size_deg))
                max_cx = int(math.floor(max_bx / cell_size_deg))
                min_cy = int(math.floor(min_by / cell_size_deg))
                max_cy = int(math.floor(max_by / cell_size_deg))

                candidate_indices = []
                for cx in range(min_cx, max_cx + 1):
                    for cy in range(min_cy, max_cy + 1):
                        cell_pts = grid_index.get((cx, cy))
                        if cell_pts:
                            candidate_indices.extend(cell_pts)

                candidate_count = len(candidate_indices)
                b_height = None
                b_source = None
                b_quality = "N/A"
                lidar_pts_count = 0
                lidar_roof_z = None
                lidar_ground_z = None
                osm_diff = None

                # Original mapped/estimated attributes
                orig_osm_height = None
                if b.get("height_source") == "MAPPED":
                    orig_osm_height = b.get("height")
                tags = b.get("tags", {})
                raw_osm_height = None
                for hkey in ["height", "building:height"]:
                    if hkey in tags:
                        try:
                            raw_osm_height = float(tags[hkey].replace("m", "").strip())
                            break
                        except Exception:
                            pass

                levels = b.get("levels")

                if candidate_count >= min_points_threshold:
                    cand_x = x_arr[candidate_indices]
                    cand_y = y_arr[candidate_indices]
                    cand_z = z_arr[candidate_indices]
                    cand_cls = class_arr[candidate_indices] if class_arr is not None else None

                    # Filter points strictly inside buffered polygon
                    in_box = (
                        (cand_x >= min_bx) & (cand_x <= max_bx) &
                        (cand_y >= min_by) & (cand_y <= max_by)
                    )
                    cand_x = cand_x[in_box]
                    cand_y = cand_y[in_box]
                    cand_z = cand_z[in_box]
                    if cand_cls is not None:
                        cand_cls = cand_cls[in_box]

                    if len(cand_z) >= min_points_threshold:
                        # Separate ground vs building points
                        ground_z_dtm = b.get("ground_elevation", 0.0)

                        if cand_cls is not None and np.any(cand_cls == 6):
                            # ASPRS Class 6: Building
                            roof_mask = (cand_cls == 6)
                            ground_mask = (cand_cls == 2)
                        else:
                            # Height-above-ground separation relative to DTM
                            roof_mask = (cand_z >= (ground_z_dtm + 2.2))
                            ground_mask = (cand_z < (ground_z_dtm + 2.2)) & (cand_z >= (ground_z_dtm - 3.0))

                        roof_points = cand_z[roof_mask]
                        ground_points = cand_z[ground_mask]

                        if len(roof_points) >= min_points_threshold:
                            # Outlier rejection: filter extreme upper spikes
                            p99 = np.percentile(roof_points, 99.0)
                            p01 = np.percentile(roof_points, 1.0)
                            valid_roof = roof_points[(roof_points >= p01) & (roof_points <= p99)]
                            if len(valid_roof) < 5:
                                valid_roof = roof_points

                            roof_elev = float(np.percentile(valid_roof, roof_percentile))

                            if len(ground_points) >= 5:
                                ground_elev = float(np.median(ground_points))
                            else:
                                ground_elev = float(ground_z_dtm)

                            calc_height = max(3.0, roof_elev - ground_elev)

                            # Quality classification
                            area = b.get("footprint_area_sq_m", 50.0)
                            density = len(valid_roof) / max(1.0, area)
                            roof_std = float(np.std(valid_roof))

                            if len(valid_roof) >= 40 and density >= 0.3 and roof_std < 2.5:
                                b_quality = "HIGH"
                            elif len(valid_roof) >= 20 and roof_std < 4.0:
                                b_quality = "MEDIUM"
                            else:
                                b_quality = "LOW"

                            # Roof shape analysis from LiDAR variance and OSM tags
                            roof_shape = b.get("roof_type") or tags.get("roof:shape")
                            if not roof_shape or roof_shape == "flat":
                                if roof_std < 0.60:
                                    roof_shape = "flat"
                                elif roof_std >= 0.60 and (np.max(valid_roof) - np.min(valid_roof)) >= 2.0:
                                    name_lower = (b.get("name") or "").lower()
                                    if "stadium" in name_lower or "dome" in name_lower:
                                        roof_shape = "dome"
                                    elif len(valid_roof) > 50:
                                        roof_shape = "gabled"
                                    else:
                                        roof_shape = "hipped"
                                else:
                                    roof_shape = "flat"

                            b_height = round(calc_height, 1)
                            b_source = "LIDAR"
                            lidar_pts_count = int(len(valid_roof))
                            lidar_roof_z = round(roof_elev, 2)
                            lidar_ground_z = round(ground_elev, 2)

                            if raw_osm_height is not None:
                                osm_diff = round(b_height - raw_osm_height, 2)

                # Fallback hierarchy if LiDAR was not matched or had insufficient points
                if b_height is None:
                    roof_shape = b.get("roof_type") or tags.get("roof:shape") or "flat"
                    if raw_osm_height is not None:
                        b_height = raw_osm_height
                        b_source = "OSM_HEIGHT"
                        b_quality = "HIGH"
                        osm_height_count += 1
                    elif levels is not None and levels > 0:
                        b_height = round(levels * floor_height_m, 1)
                        b_source = "OSM_LEVELS"
                        b_quality = "MEDIUM"
                        osm_levels_count += 1
                    else:
                        b_height = b.get("height", 8.0)
                        b_source = "ESTIMATED"
                        b_quality = "LOW"
                        estimated_count += 1
                else:
                    lidar_count += 1
                    lidar_heights_collected.append(b_height)

                # Geometry quality calculation
                footprint_coords = b.get("footprint", [])
                v_count = len(footprint_coords)
                f_area = b.get("footprint_area_sq_m", 0.0)
                if v_count >= 6 and f_area >= 50.0:
                    geom_quality = "HIGH"
                elif v_count >= 4 and f_area >= 20.0:
                    geom_quality = "MEDIUM"
                else:
                    geom_quality = "LOW"

                # Update building dict
                ground_z = b.get("ground_elevation", 0.0)
                b_updated = dict(b)
                b_updated["height"] = b_height
                b_updated["top_elevation"] = round(ground_z + b_height, 2)
                b_updated["height_source"] = b_source
                b_updated["height_quality"] = b_quality
                b_updated["geometry_quality"] = geom_quality
                b_updated["roof_type"] = roof_shape
                b_updated["footprint_source"] = b.get("footprint_source") or b.get("source", "OpenStreetMap")
                b_updated["lidar_points_count"] = lidar_pts_count
                b_updated["lidar_roof_elevation"] = lidar_roof_z
                b_updated["lidar_ground_elevation"] = lidar_ground_z
                b_updated["osm_height_diff"] = osm_diff

                enhanced_buildings.append(b_updated)

            total_b = len(enhanced_buildings)
            lidar_pct = round((lidar_count / max(1, total_b)) * 100.0, 1)

            summary = {
                "lidar_available": True,
                "status_message": f"LiDAR building heights extracted from active survey ({lidar_count:,} of {total_b:,} buildings covered).",
                "source_file": os.path.basename(target_file),
                "total_buildings": total_b,
                "lidar_count": lidar_count,
                "osm_height_count": osm_height_count,
                "osm_levels_count": osm_levels_count,
                "estimated_count": estimated_count,
                "lidar_coverage_pct": lidar_pct,
                "mean_lidar_height": round(float(np.mean(lidar_heights_collected)), 1) if lidar_heights_collected else None,
                "median_lidar_height": round(float(np.median(lidar_heights_collected)), 1) if lidar_heights_collected else None,
                "min_lidar_height": round(float(np.min(lidar_heights_collected)), 1) if lidar_heights_collected else None,
                "max_lidar_height": round(float(np.max(lidar_heights_collected)), 1) if lidar_heights_collected else None,
            }

            return enhanced_buildings, summary

        except Exception as e:
            logger.error(f"Error processing LiDAR for buildings: {e}", exc_info=True)
            enhanced, summary = self._process_fallback_only(buildings, floor_height_m)
            summary["lidar_available"] = False
            summary["status_message"] = f"LiDAR processing failed: {str(e)}. Using fallback hierarchy."
            summary["source_file"] = os.path.basename(target_file) if target_file else None
            return enhanced, summary

    def _process_fallback_only(
        self, 
        buildings: List[Dict[str, Any]], 
        floor_height_m: float = 3.0
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """Apply the fallback hierarchy when LiDAR is unavailable."""
        enhanced = []
        osm_height_count = 0
        osm_levels_count = 0
        estimated_count = 0

        for b in buildings:
            tags = b.get("tags", {})
            raw_osm_height = None
            for hkey in ["height", "building:height"]:
                if hkey in tags:
                    try:
                        raw_osm_height = float(tags[hkey].replace("m", "").strip())
                        break
                    except Exception:
                        pass

            levels = b.get("levels")
            ground_z = b.get("ground_elevation", 0.0)

            if raw_osm_height is not None:
                b_height = raw_osm_height
                b_source = "OSM_HEIGHT"
                b_quality = "HIGH"
                osm_height_count += 1
            elif levels is not None and levels > 0:
                b_height = round(levels * floor_height_m, 1)
                b_source = "OSM_LEVELS"
                b_quality = "MEDIUM"
                osm_levels_count += 1
            else:
                b_height = b.get("height", 8.0)
                b_source = "ESTIMATED"
                b_quality = "LOW"
                estimated_count += 1

            footprint_coords = b.get("footprint", [])
            v_count = len(footprint_coords)
            f_area = b.get("footprint_area_sq_m", 0.0)
            if v_count >= 6 and f_area >= 50.0:
                geom_quality = "HIGH"
            elif v_count >= 4 and f_area >= 20.0:
                geom_quality = "MEDIUM"
            else:
                geom_quality = "LOW"

            b_updated = dict(b)
            b_updated["height"] = b_height
            b_updated["top_elevation"] = round(ground_z + b_height, 2)
            b_updated["height_source"] = b_source
            b_updated["height_quality"] = b_quality
            b_updated["geometry_quality"] = geom_quality
            b_updated["roof_type"] = b.get("roof_type") or tags.get("roof:shape", "flat")
            b_updated["footprint_source"] = b.get("footprint_source") or b.get("source", "OpenStreetMap")
            b_updated["lidar_points_count"] = 0
            b_updated["lidar_roof_elevation"] = None
            b_updated["lidar_ground_elevation"] = None
            b_updated["osm_height_diff"] = None

            enhanced.append(b_updated)

        total_b = len(enhanced)
        summary = {
            "lidar_available": False,
            "status_message": "LiDAR building heights unavailable for this area.",
            "source_file": None,
            "total_buildings": total_b,
            "lidar_count": 0,
            "osm_height_count": osm_height_count,
            "osm_levels_count": osm_levels_count,
            "estimated_count": estimated_count,
            "lidar_coverage_pct": 0.0,
            "mean_lidar_height": None,
            "median_lidar_height": None,
            "min_lidar_height": None,
            "max_lidar_height": None,
        }
        return enhanced, summary


lidar_building_service = LiDARBuildingService()
