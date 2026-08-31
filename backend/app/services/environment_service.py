"""
Environment reconstruction service.
Orchestrates multi-source building footprint ingestion (OSM ways, relations, authoritative local data),
spatial IoU deduplication, bilinear terrain elevation sampling, LiDAR height extraction, planar shoreline
water leveling, and coordinate transformation to 1:1 metric space.
"""
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

from app.providers.osm_provider import environment_data_provider
from app.providers.building_provider import local_building_provider, building_deduplicator
from app.services.lidar_building_service import lidar_building_service

logger = logging.getLogger(__name__)


def _latlon_to_metric(lat: float, lon: float, bounds: Dict[str, float]) -> Tuple[float, float]:
    """
    Convert WGS84 (lat, lon) to local metric coordinate space (X, Z) in meters,
    matching the exact Three.js coordinate convention of TerrainMesh.tsx:
    
    - X axis: West (-halfW) to East (+halfW)
    - Z axis: North (-halfH) to South (+halfH)
    - Origin (0, 0): Center of geographic bounding box
    """
    min_lat = bounds["min_lat"]
    max_lat = bounds["max_lat"]
    min_lon = bounds["min_lon"]
    max_lon = bounds["max_lon"]
    mid_lat = (min_lat + max_lat) / 2.0

    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(mid_lat))

    width_m = (max_lon - min_lon) * m_per_deg_lon
    height_m = (max_lat - min_lat) * m_per_deg_lat

    frac_x = (lon - min_lon) / max(1e-9, max_lon - min_lon)
    frac_z = (max_lat - lat) / max(1e-9, max_lat - min_lat)

    x = (frac_x - 0.5) * width_m
    z = (frac_z - 0.5) * height_m

    return (round(x, 2), round(z, 2))


def _sample_terrain_z(
    lat: float, lon: float,
    elevation_grid: np.ndarray,
    bounds: Dict[str, float]
) -> float:
    """
    Bilinear interpolation of terrain elevation at geographic point (lat, lon).
    Grid rows: 0 (North, max_lat) to rows-1 (South, min_lat).
    Grid cols: 0 (West, min_lon) to cols-1 (East, max_lon).
    """
    rows, cols = elevation_grid.shape

    row_frac = (bounds["max_lat"] - lat) / max(1e-9, bounds["max_lat"] - bounds["min_lat"])
    col_frac = (lon - bounds["min_lon"]) / max(1e-9, bounds["max_lon"] - bounds["min_lon"])

    row_f = max(0.0, min(float(rows - 1), row_frac * (rows - 1)))
    col_f = max(0.0, min(float(cols - 1), col_frac * (cols - 1)))

    r0 = int(math.floor(row_f))
    c0 = int(math.floor(col_f))
    r1 = min(r0 + 1, rows - 1)
    c1 = min(c0 + 1, cols - 1)

    dr = row_f - r0
    dc = col_f - c0

    z = (
        elevation_grid[r0, c0] * (1 - dr) * (1 - dc) +
        elevation_grid[r0, c1] * (1 - dr) * dc +
        elevation_grid[r1, c0] * dr * (1 - dc) +
        elevation_grid[r1, c1] * dr * dc
    )

    return float(z)


def get_environment_layers(
    bounds: Dict[str, float],
    elevation_grid: np.ndarray,
    layers_requested: Optional[List[str]] = None,
    data_mode: str = "real",
    min_elevation: float = 0.0,
    max_buildings: int = 6000,
    max_roads: int = 6000,
    max_water: int = 1000,
    max_landmarks: int = 400,
) -> Dict[str, Any]:
    """
    Fetch environment vector features for the given geographic bounding box,
    merge multi-source building datasets with spatial IoU deduplication, sample
    ground elevations on the DEM grid, and convert coordinates to local metric space.
    """
    if layers_requested is None:
        layers_requested = ["buildings", "roads", "water", "landmarks"]

    if data_mode == "demo":
        return {
            "status": "notice",
            "message": "Environment layers disabled in demo mode (no geographic reference)",
            "source": "Demo Mode",
            "buildings": [],
            "roads": [],
            "water": [],
            "landmarks": [],
            "layer_metadata": {
                "buildings": {"source": "Demo Mode", "count": 0, "data_status": "UNAVAILABLE"},
                "roads": {"source": "Demo Mode", "count": 0, "data_status": "UNAVAILABLE"},
                "water": {"source": "Demo Mode", "count": 0, "data_status": "UNAVAILABLE"},
            },
            "counts": {"buildings": 0, "roads": 0, "water": 0, "landmarks": 0},
            "coverage_summary": {
                "buildings": {"detected": 0, "reconstructed": 0, "failed": 0},
                "roads": {"detected": 0, "reconstructed": 0, "failed": 0},
                "water": {"detected": 0, "reconstructed": 0, "failed": 0},
            },
            "progress": ["Demo mode active — vector queries bypassed"]
        }

    # 1. Fetch raw vector data from EnvironmentDataProvider
    osm_resp = environment_data_provider.fetch_features(
        bounds=bounds,
        layers=layers_requested,
        max_buildings=max_buildings,
        max_roads=max_roads,
        max_water=max_water,
        max_landmarks=max_landmarks
    )

    if osm_resp.get("status") == "error":
        return {
            "status": "error",
            "message": osm_resp.get("message", "OpenStreetMap feature query failed."),
            "provider_status": "FAILED",
            "source": "OpenStreetMap",
            "buildings": [],
            "roads": [],
            "water": [],
            "landmarks": [],
            "layer_metadata": {},
            "counts": {"buildings": 0, "roads": 0, "water": 0, "landmarks": 0},
            "coverage_summary": {
                "buildings": {"detected": 0, "reconstructed": 0, "failed": 0},
                "roads": {"detected": 0, "reconstructed": 0, "failed": 0},
                "water": {"detected": 0, "reconstructed": 0, "failed": 0},
            },
            "progress": ["Failed to retrieve vector data from OpenStreetMap"]
        }

    # 2. Multi-Source Building Ingestion & Spatial Deduplication
    bld_failures: Dict[str, int] = {
        "DEGENERATE_POLYGON": 0,
        "OUT_OF_BOUNDS": 0,
        "INVALID_GEOMETRY": 0,
        "DUPLICATE": 0,
    }
    total_detected_buildings = 0
    buildings_out = []

    if "buildings" in layers_requested:
        osm_buildings = osm_resp.get("buildings", [])
        local_buildings = local_building_provider.get_buildings(bounds)
        total_detected_buildings = len(osm_buildings) + len(local_buildings)

        # Merge and deduplicate using spatial IoU
        merged_buildings, dedup_stats = building_deduplicator.deduplicate(
            building_lists=[local_buildings, osm_buildings],
            bounds=bounds
        )
        bld_failures["DUPLICATE"] = dedup_stats.get("merged_duplicates", 0)

        for b in merged_buildings:
            footprint = b.get("footprint", [])
            if len(footprint) < 3:
                bld_failures["DEGENERATE_POLYGON"] += 1
                continue

            clat, clon = b["latitude"], b["longitude"]
            if not (bounds["min_lat"] <= clat <= bounds["max_lat"] and bounds["min_lon"] <= clon <= bounds["max_lon"]):
                bld_failures["OUT_OF_BOUNDS"] += 1
                continue

            ground_z = _sample_terrain_z(clat, clon, elevation_grid, bounds)
            mx, mz = _latlon_to_metric(clat, clon, bounds)

            # Convert 2D footprint to metric
            footprint_metric = []
            valid_polygon = True
            for coord in footprint:
                if len(coord) < 2 or math.isnan(coord[0]) or math.isnan(coord[1]):
                    valid_polygon = False
                    break
                fx, fz = _latlon_to_metric(coord[0], coord[1], bounds)
                footprint_metric.append([fx, fz])

            if not valid_polygon:
                bld_failures["INVALID_GEOMETRY"] += 1
                continue

            height = float(b.get("height", 8.0))

            buildings_out.append({
                "id": b["id"],
                "footprint": footprint,
                "footprint_metric": footprint_metric,
                "latitude": clat,
                "longitude": clon,
                "x_metric": mx,
                "z_metric": mz,
                "ground_elevation": round(ground_z, 2),
                "relative_elevation": round(ground_z - min_elevation, 2),
                "height": height,
                "top_elevation": round(ground_z + height, 2),
                "height_source": b.get("height_source", "ESTIMATED"),
                "footprint_source": b.get("footprint_source") or b.get("source", "OpenStreetMap"),
                "roof_type": b.get("roof_type", "flat"),
                "footprint_area_sq_m": b.get("footprint_area_sq_m", 0.0),
                "name": b.get("name"),
                "building_type": b.get("building_type", "yes"),
                "source": b.get("source", "OpenStreetMap"),
                "tags": b.get("tags", {}),
                "levels": b.get("levels"),
            })

        # Apply LiDAR Building Height Enhancement Engine (with roof shape & geometry quality)
        buildings_out, height_summary = lidar_building_service.enhance_buildings_with_lidar(
            buildings=buildings_out,
            bounds=bounds,
            elevation_grid=elevation_grid,
            min_points_threshold=15,
            roof_percentile=95.0,
            footprint_buffer_m=1.0,
            floor_height_m=3.0,
        )
    else:
        height_summary = {
            "lidar_available": False,
            "status_message": "Building layer not requested.",
            "source_file": None,
            "total_buildings": 0,
            "lidar_count": 0,
            "osm_height_count": 0,
            "osm_levels_count": 0,
            "estimated_count": 0,
            "lidar_coverage_pct": 0.0,
            "mean_lidar_height": None,
            "median_lidar_height": None,
            "min_lidar_height": None,
            "max_lidar_height": None,
        }

    # 3. Process Roads
    roads_out = []
    total_detected_roads = len(osm_resp.get("roads", []))
    mapped_roads_count = 0
    default_roads_count = 0
    failed_roads_count = 0

    if "roads" in layers_requested:
        for r in osm_resp.get("roads", []):
            coords = r.get("coords", [])
            if len(coords) < 2:
                failed_roads_count += 1
                continue

            coords_with_elevation = []
            coords_metric = []

            for coord in coords:
                lat, lon = coord[0], coord[1]
                z = _sample_terrain_z(lat, lon, elevation_grid, bounds)
                mx, mz = _latlon_to_metric(lat, lon, bounds)
                coords_with_elevation.append([lat, lon, round(z, 2)])
                coords_metric.append([mx, mz, round(z, 2)])

            w_source = r.get("width_source", "DEFAULT")
            if w_source == "MAPPED":
                mapped_roads_count += 1
            else:
                default_roads_count += 1

            roads_out.append({
                "id": r["id"],
                "coords": coords_with_elevation,
                "coords_metric": coords_metric,
                "road_type": r["road_type"],
                "width": r["width"],
                "width_source": w_source,
                "name": r.get("name"),
                "surface": r.get("surface"),
                "source": "OpenStreetMap",
            })

    # 4. Process Water Bodies with Planar Shoreline Elevation Leveling
    water_out = []
    total_detected_water = len(osm_resp.get("water", []))
    failed_water_count = 0

    if "water" in layers_requested:
        for w in osm_resp.get("water", []):
            polygon = w.get("polygon", [])
            if len(polygon) < 3:
                failed_water_count += 1
                continue

            clat, clon = w["latitude"], w["longitude"]
            
            # Compute shoreline perimeter elevations and use median for consistent water plane
            shoreline_elevs = [_sample_terrain_z(pt[0], pt[1], elevation_grid, bounds) for pt in polygon]
            shoreline_elevs.append(_sample_terrain_z(clat, clon, elevation_grid, bounds))
            surface_z = float(np.median(shoreline_elevs))

            polygon_metric = []
            for coord in polygon:
                mx, mz = _latlon_to_metric(coord[0], coord[1], bounds)
                polygon_metric.append([mx, mz])

            water_out.append({
                "id": w["id"],
                "polygon": polygon,
                "polygon_metric": polygon_metric,
                "water_type": w["water_type"],
                "latitude": clat,
                "longitude": clon,
                "elevation": round(surface_z, 2),
                "relative_elevation": round(surface_z - min_elevation, 2),
                "name": w.get("name"),
                "elevation_source": "TERRAIN_SHORELINE_MEDIAN",
                "source": "OpenStreetMap",
            })

    # 5. Process Landmarks
    landmarks_out = []
    if "landmarks" in layers_requested:
        for lm in osm_resp.get("landmarks", []):
            lat, lon = lm["latitude"], lm["longitude"]
            z = _sample_terrain_z(lat, lon, elevation_grid, bounds)
            mx, mz = _latlon_to_metric(lat, lon, bounds)

            landmarks_out.append({
                "id": lm["id"],
                "latitude": lat,
                "longitude": lon,
                "x_metric": mx,
                "z_metric": mz,
                "elevation": round(z, 2),
                "relative_elevation": round(z - min_elevation, 2),
                "name": lm.get("name"),
                "category": lm["category"],
                "source": "OpenStreetMap",
            })

    counts = {
        "buildings": len(buildings_out),
        "roads": len(roads_out),
        "water": len(water_out),
        "landmarks": len(landmarks_out)
    }

    # Aggregate footprint sources & geometry qualities
    footprint_sources_count: Dict[str, int] = {}
    geom_qualities_count: Dict[str, int] = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for b in buildings_out:
        f_src = b.get("footprint_source", "OpenStreetMap")
        footprint_sources_count[f_src] = footprint_sources_count.get(f_src, 0) + 1
        g_q = b.get("geometry_quality", "MEDIUM")
        geom_qualities_count[g_q] = geom_qualities_count.get(g_q, 0) + 1

    failed_buildings_total = sum(bld_failures.values())

    coverage_summary = {
        "buildings": {
            "detected": total_detected_buildings if total_detected_buildings > 0 else len(buildings_out),
            "reconstructed": len(buildings_out),
            "failed": failed_buildings_total,
            "failure_breakdown": bld_failures,
            "lidar_heights": height_summary.get("lidar_count", 0),
            "mapped_heights": height_summary.get("osm_height_count", 0),
            "osm_levels_heights": height_summary.get("osm_levels_count", 0),
            "estimated_heights": height_summary.get("estimated_count", 0),
            "lidar_coverage_pct": height_summary.get("lidar_coverage_pct", 0.0),
            "footprint_sources": footprint_sources_count,
            "geometry_qualities": geom_qualities_count,
        },
        "roads": {
            "detected": total_detected_roads,
            "reconstructed": len(roads_out),
            "failed": failed_roads_count,
            "mapped_widths": mapped_roads_count,
            "default_widths": default_roads_count,
        },
        "water": {
            "detected": total_detected_water,
            "reconstructed": len(water_out),
            "failed": failed_water_count,
        }
    }

    bld_source = "OpenStreetMap / Authoritative Local"
    if height_summary.get("lidar_count", 0) > 0:
        bld_source = f"OSM / Local Footprints + LiDAR Survey ({height_summary.get('source_file')})"

    layer_meta = {
        "buildings": {
            "source": bld_source,
            "count": len(buildings_out),
            "lidar_heights": height_summary.get("lidar_count", 0),
            "mapped_heights": height_summary.get("osm_height_count", 0),
            "estimated_heights": height_summary.get("estimated_count", 0) + height_summary.get("osm_levels_count", 0),
            "data_status": "LIDAR-ENHANCED" if height_summary.get("lidar_count", 0) > 0 else "MAPPED",
            "lidar_coverage_pct": height_summary.get("lidar_coverage_pct", 0.0),
        },
        "roads": {
            "source": osm_resp.get("source", "OpenStreetMap"),
            "count": len(roads_out),
            "data_status": "MAPPED",
        },
        "water": {
            "source": osm_resp.get("source", "OpenStreetMap"),
            "count": len(water_out),
            "data_status": "MAPPED",
        },
        "landmarks": {
            "source": osm_resp.get("source", "OpenStreetMap"),
            "count": len(landmarks_out),
            "data_status": "MAPPED",
        }
    }

    return {
        "status": "success",
        "source": osm_resp.get("source", "OpenStreetMap"),
        "buildings": buildings_out,
        "roads": roads_out,
        "water": water_out,
        "landmarks": landmarks_out,
        "layer_metadata": layer_meta,
        "building_height_summary": height_summary,
        "coverage_summary": coverage_summary,
        "counts": counts,
        "progress": [
            f"Retrieved and reconstructed {len(buildings_out)} buildings, {len(roads_out)} roads, {len(water_out)} water bodies",
            height_summary.get("status_message", "Building heights calculated.")
        ]
    }
