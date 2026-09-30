"""
Modular Building Provider and Deduplication Engine.
Supports multi-source building footprint ingestion (OSM ways, OSM multipolygon relations,
authoritative local GeoJSON datasets), spatial IoU deduplication, and independent
tracking of footprintSource and heightSource.
"""
import os
import json
import math
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Tuple
from shapely.geometry import Polygon, MultiPolygon, Point
from shapely.ops import unary_union

logger = logging.getLogger(__name__)


def _centroid(coords: List[List[float]]) -> Tuple[float, float]:
    """Calculate centroid [latitude, longitude] of a coordinate list."""
    if not coords:
        return 0.0, 0.0
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _polygon_area_sq_m(coords: List[List[float]]) -> float:
    """Calculate approximate area in square meters for a lat/lon polygon."""
    if len(coords) < 3:
        return 0.0
    mid_lat = sum(c[0] for c in coords) / len(coords)
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(mid_lat))

    mx = [c[1] * m_per_deg_lon for c in coords]
    my = [c[0] * m_per_deg_lat for c in coords]

    area = 0.0
    n = len(coords)
    for i in range(n):
        j = (i + 1) % n
        area += mx[i] * my[j]
        area -= mx[j] * my[i]
    return abs(area) / 2.0


class BaseBuildingProvider(ABC):
    """Abstract base class for building data providers."""

    @abstractmethod
    def get_buildings(self, bounds: Dict[str, float]) -> List[Dict[str, Any]]:
        """Retrieve building features within the given bounding box."""
        pass


class LocalBuildingProvider(BaseBuildingProvider):
    """
    Authoritative local survey / pre-cached GeoJSON building provider.
    Ingests local datasets without artificial feature caps.
    """

    def __init__(self, data_dir: Optional[str] = None):
        if data_dir is None:
            # Point to data/bengaluru/
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            self.data_dir = os.path.join(base_dir, "data", "bengaluru")
        else:
            self.data_dir = data_dir

    def get_buildings(self, bounds: Dict[str, float]) -> List[Dict[str, Any]]:
        south = bounds["min_lat"]
        north = bounds["max_lat"]
        west = bounds["min_lon"]
        east = bounds["max_lon"]

        buildings: List[Dict[str, Any]] = []

        # 1. Try buildings.geojson
        geojson_path = os.path.join(self.data_dir, "buildings.geojson")
        if os.path.exists(geojson_path):
            try:
                with open(geojson_path, "r", encoding="utf-8") as f:
                    gj = json.load(f)
                features = gj.get("features", [])
                for feat in features:
                    props = feat.get("properties", {})
                    geom = feat.get("geometry", {})
                    geom_type = geom.get("type")
                    raw_coords = geom.get("coordinates", [])

                    # Parse coordinates to [[lat, lon], ...]
                    footprint: List[List[float]] = []
                    if geom_type == "Polygon" and raw_coords:
                        # GeoJSON is [lon, lat]
                        footprint = [[pt[1], pt[0]] for pt in raw_coords[0]]
                    elif geom_type == "MultiPolygon" and raw_coords and raw_coords[0]:
                        footprint = [[pt[1], pt[0]] for pt in raw_coords[0][0]]

                    if len(footprint) >= 3:
                        clat, clon = _centroid(footprint)
                        if south <= clat <= north and west <= clon <= east:
                            area = _polygon_area_sq_m(footprint)
                            b_id = props.get("id") or f"local-bld-{len(buildings)+1}"
                            buildings.append({
                                "id": str(b_id),
                                "footprint": footprint,
                                "latitude": round(clat, 7),
                                "longitude": round(clon, 7),
                                "height": float(props.get("height", 8.0)),
                                "height_source": props.get("height_source", "ESTIMATED"),
                                "footprint_source": props.get("source", "Authoritative Local"),
                                "name": props.get("name"),
                                "building_type": props.get("building_type") or props.get("building") or "yes",
                                "roof_type": props.get("roof_type", "flat"),
                                "footprint_area_sq_m": round(area, 1),
                                "tags": props.get("tags", {}),
                                "source": props.get("source", "Authoritative Local"),
                                "levels": props.get("levels"),
                            })
                if buildings:
                    logger.info(f"LocalBuildingProvider loaded {len(buildings)} buildings from {geojson_path}")
                    return buildings
            except Exception as e:
                logger.warning(f"Failed to load {geojson_path}: {e}")

        # 2. Try bengaluru_pilot_raw.json fallback
        raw_path = os.path.join(self.data_dir, "bengaluru_pilot_raw.json")
        if os.path.exists(raw_path):
            try:
                with open(raw_path, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                for b in raw_data.get("buildings", []):
                    clat = b["latitude"]
                    clon = b["longitude"]
                    if south <= clat <= north and west <= clon <= east:
                        b_copy = dict(b)
                        b_copy["footprint_source"] = b.get("source", "OpenStreetMap")
                        buildings.append(b_copy)
                if buildings:
                    logger.info(f"LocalBuildingProvider loaded {len(buildings)} buildings from {raw_path}")
                    return buildings
            except Exception as e:
                logger.warning(f"Failed to load {raw_path}: {e}")

        return buildings


class BuildingDeduplicator:
    """
    High-performance 2D Spatial Deduplication and Merge Engine.
    Uses spatial grid bucketing and Shapely IoU (Intersection over Union) to merge
    multi-source building footprints, retaining the highest quality geometry and
    independent footprint/height metadata.
    """

    def __init__(self, iou_threshold: float = 0.35, centroid_dist_threshold_m: float = 7.0):
        self.iou_threshold = iou_threshold
        self.centroid_dist_threshold_m = centroid_dist_threshold_m

    def deduplicate(
        self,
        building_lists: List[List[Dict[str, Any]]],
        bounds: Dict[str, float]
    ) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        """
        Merge and deduplicate multiple building datasets.
        
        Priority:
        1. Authoritative Local Data / High-Detail Polygon
        2. OpenStreetMap Relations / Multipolygons
        3. OpenStreetMap Simple Ways
        4. Derived / Coarse Footprints
        
        Returns:
            (deduplicated_buildings, deduplication_stats)
        """
        all_buildings: List[Dict[str, Any]] = []
        for blist in building_lists:
            all_buildings.extend(blist)

        if not all_buildings:
            return [], {"total_input": 0, "merged_duplicates": 0, "final_count": 0}

        # Spatial grid setup for fast candidate lookup (grid cell ~ 50m)
        mid_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
        deg_per_50m_lat = 50.0 / 111320.0
        deg_per_50m_lon = 50.0 / (111320.0 * math.cos(math.radians(mid_lat)))

        grid: Dict[Tuple[int, int], List[int]] = {}
        polygons: List[Optional[Polygon]] = []

        for idx, b in enumerate(all_buildings):
            clat = b["latitude"]
            clon = b["longitude"]
            gx = int(math.floor(clon / deg_per_50m_lon))
            gy = int(math.floor(clat / deg_per_50m_lat))

            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    cell = (gx + dx, gy + dy)
                    grid.setdefault(cell, []).append(idx)

            # Build Shapely polygon
            footprint = b.get("footprint", [])
            if len(footprint) >= 3:
                try:
                    p = Polygon([(pt[1], pt[0]) for pt in footprint])
                    if not p.is_valid:
                        p = p.buffer(0)
                    polygons.append(p)
                except Exception:
                    polygons.append(None)
            else:
                polygons.append(None)

        merged_flags = [False] * len(all_buildings)
        final_buildings: List[Dict[str, Any]] = []
        duplicates_count = 0

        # Quality scoring function: prefer detailed vertices, mapped tags, and explicit heights
        def quality_score(b_item: Dict[str, Any]) -> float:
            score = 0.0
            score += len(b_item.get("footprint", [])) * 0.1
            if b_item.get("name"):
                score += 5.0
            if b_item.get("height_source") == "MAPPED":
                score += 10.0
            elif b_item.get("height_source") == "LIDAR":
                score += 8.0
            if "Authoritative" in b_item.get("source", "") or "Authoritative" in b_item.get("footprint_source", ""):
                score += 15.0
            return score

        for i, b in enumerate(all_buildings):
            if merged_flags[i]:
                continue

            p_i = polygons[i]
            if p_i is None or p_i.is_empty:
                merged_flags[i] = True
                continue

            clat_i = b["latitude"]
            clon_i = b["longitude"]
            gx_i = int(math.floor(clon_i / deg_per_50m_lon))
            gy_i = int(math.floor(clat_i / deg_per_50m_lat))

            cluster_indices = [i]
            candidate_indices = set(grid.get((gx_i, gy_i), []))

            for j in candidate_indices:
                if j <= i or merged_flags[j]:
                    continue
                p_j = polygons[j]
                if p_j is None or p_j.is_empty:
                    continue

                # Quick centroid distance check
                clat_j = all_buildings[j]["latitude"]
                clon_j = all_buildings[j]["longitude"]
                d_lat_m = (clat_i - clat_j) * 111320.0
                d_lon_m = (clon_i - clon_j) * 111320.0 * math.cos(math.radians(mid_lat))
                dist_m = math.sqrt(d_lat_m * d_lat_m + d_lon_m * d_lon_m)

                if dist_m < self.centroid_dist_threshold_m:
                    # Check IoU
                    try:
                        inter_area = p_i.intersection(p_j).area
                        union_area = p_i.union(p_j).area
                        iou = inter_area / union_area if union_area > 0 else 0.0
                        if iou >= self.iou_threshold or inter_area / p_j.area > 0.65 or inter_area / p_i.area > 0.65:
                            cluster_indices.append(j)
                            merged_flags[j] = True
                    except Exception:
                        pass

            # Merge cluster features into best composite building object
            best_idx = max(cluster_indices, key=lambda idx: quality_score(all_buildings[idx]))
            master_building = dict(all_buildings[best_idx])

            # Consolidate attributes
            for c_idx in cluster_indices:
                other_b = all_buildings[c_idx]
                if not master_building.get("name") and other_b.get("name"):
                    master_building["name"] = other_b["name"]
                if master_building.get("height_source") == "ESTIMATED" and other_b.get("height_source") in ["MAPPED", "LIDAR"]:
                    master_building["height"] = other_b["height"]
                    master_building["height_source"] = other_b["height_source"]
                if not master_building.get("levels") and other_b.get("levels"):
                    master_building["levels"] = other_b["levels"]

            if len(cluster_indices) > 1:
                duplicates_count += (len(cluster_indices) - 1)

            final_buildings.append(master_building)
            merged_flags[i] = True

        stats = {
            "total_input": len(all_buildings),
            "merged_duplicates": duplicates_count,
            "final_count": len(final_buildings),
        }
        logger.info(f"Building deduplication: {len(all_buildings)} input -> {len(final_buildings)} final ({duplicates_count} duplicates merged)")
        return final_buildings, stats


# Global Singleton Instances
local_building_provider = LocalBuildingProvider()
building_deduplicator = BuildingDeduplicator()
