import uuid
import time
from typing import Dict, Any, Optional
import numpy as np

from app.models.schemas import (
    TerrainReconstructRequest, TerrainReconstructResponse,
    LatLonBounds, MetricBounds, GISMetadata, TerrainStats,
    SlopeDistribution
)
from app.providers.elevation_manager import elevation_manager
from app.services.terrain_service import terrain_service
from app.services.hillshade_service import hillshade_service
from app.services.contour_service import contour_service
from app.services.slope_aspect_service import slope_aspect_service
from app.utils.geo_utils import bounds_from_center_radius

class ReconstructionService:
    """Manages 3D terrain reconstruction jobs using modular DEM/LiDAR providers and GIS processing."""

    def __init__(self):
        self.jobs_cache: Dict[str, Dict[str, Any]] = {}

    def reconstruct_terrain(self, request: TerrainReconstructRequest) -> TerrainReconstructResponse:
        """
        Executes full authoritative terrain reconstruction pipeline:
        1. Resolve geographic bounds
        2. Query elevation manager (LiDAR -> Local GeoTIFF -> Copernicus -> SRTM)
        3. Convert bounds to local metric coordinate system (meters)
        4. Compute Horn's slope, aspect, and slope distribution
        5. Generate hillshade relief texture
        6. Calculate contour intervals
        7. Assemble GIS metadata and 3D response
        """
        if request.bounds is not None:
            bounds_dict = request.bounds.model_dump()
        elif request.latitude is not None and request.longitude is not None:
            radius = request.radius if request.radius is not None else 2500.0
            bounds_dict = bounds_from_center_radius(request.latitude, request.longitude, radius)
        elif request.sample_id:
            from app.utils.sample_data_generator import SAMPLE_REGIONS
            matching = next((r for r in SAMPLE_REGIONS if r["id"] == request.sample_id), None)
            if matching:
                bounds_dict = bounds_from_center_radius(
                    matching["center_lat"], matching["center_lon"], matching["radius_meters"]
                )
            else:
                bounds_dict = bounds_from_center_radius(35.3606, 138.7274, 6000.0)
        else:
            bounds_dict = bounds_from_center_radius(35.3606, 138.7274, 6000.0)

        resolution = request.grid_resolution or 128
        provider_pref = request.provider or "auto"

        # 1. Retrieve authoritative elevation grid via ElevationManager
        elevation_grid, dem_meta = elevation_manager.get_elevation_grid(
            bounds_dict, 
            resolution=resolution, 
            provider_preference=provider_pref, 
            sample_id=request.sample_id
        )

        # 2. Local Metric Bounds (meters East/West and North/South)
        metric_bounds = terrain_service.calculate_metric_bounds(bounds_dict)
        rows, cols = elevation_grid.shape
        cell_x_m = metric_bounds.width_m / max(1, cols - 1)
        cell_y_m = metric_bounds.height_m / max(1, rows - 1)

        # 3. Compute Slope, Aspect, and Slope Distribution
        slope_grid, aspect_grid = slope_aspect_service.calculate_slope_and_aspect(elevation_grid, cell_x_m, cell_y_m)
        slope_dist_dict = slope_aspect_service.classify_slope_distribution(slope_grid)
        slope_distribution = SlopeDistribution(**slope_dist_dict)

        # 4. Calculate Elevation Statistics
        stats = terrain_service.calculate_statistics(elevation_grid, slope_grid, aspect_grid, bounds_dict)

        # 5. Generate Real Contour Intervals
        interval_m = request.contour_interval_m or 20.0
        contour_intervals = contour_service.calculate_contour_levels(stats.min_elevation, stats.max_elevation, interval_m)

        # 6. Hillshade Texture Generation
        hillshade_url = None
        if request.include_hillshade:
            try:
                sun_az = request.sun_azimuth if request.sun_azimuth is not None else 315.0
                sun_alt = request.sun_altitude if request.sun_altitude is not None else 45.0
                hillshade_url = hillshade_service.generate_hillshade_texture(
                    elevation_grid, cell_x_m, cell_y_m, azimuth_deg=sun_az, altitude_deg=sun_alt
                )
            except Exception as e:
                print(f"[ReconstructionService] Hillshade skipped: {e}")

        # 7. Satellite Texture Generation
        texture_url = None
        if request.include_satellite_texture:
            try:
                texture_url = elevation_manager.get_satellite_texture(bounds_dict)
            except Exception as e:
                print(f"[ReconstructionService] Satellite texture skipped: {e}")

        vertex_count = rows * cols
        face_count = (rows - 1) * (cols - 1) * 2

        gis_meta = GISMetadata(
            source=dem_meta.get("source", "SRTM GL1 30m / Copernicus DEM"),
            horizontal_resolution=dem_meta.get("horizontal_resolution", "~30m (1 arc-sec)"),
            vertical_datum=dem_meta.get("vertical_datum", "EGM96 Geoid / MSL (Meters)"),
            vertical_accuracy=dem_meta.get("vertical_accuracy", "±16m (90% linear error)"),
            elevation_type=dem_meta.get("elevation_type", "DEM-derived"),
            projection="Local Transverse Mercator (WGS84 Equirectangular Cos-Corrected)",
            grid_spacing_x_m=round(cell_x_m, 2),
            grid_spacing_y_m=round(cell_y_m, 2),
            data_voids_count=dem_meta.get("data_voids", 0),
            interpolation_method=dem_meta.get("interpolation_method", "Bilinear Resampling")
        )

        job_id = uuid.uuid4().hex[:10]
        bounds_obj = LatLonBounds(**bounds_dict)

        self.jobs_cache[job_id] = {
            "id": job_id,
            "timestamp": time.time(),
            "bounds": bounds_dict,
            "metric_bounds": metric_bounds.model_dump(),
            "elevation_grid": elevation_grid,
            "slope_grid": slope_grid,
            "aspect_grid": aspect_grid,
            "stats": stats,
            "gis_meta": gis_meta.model_dump(),
            "texture_url": texture_url,
            "hillshade_url": hillshade_url
        }

        return TerrainReconstructResponse(
            status="success",
            region_name=request.sample_id,
            provider_used=dem_meta.get("source", "SRTM GL1 30m"),
            fallback_notice=dem_meta.get("fallback_notice"),
            grid_resolution=resolution,
            bounds=bounds_obj,
            metric_bounds=metric_bounds,
            gis_metadata=gis_meta,
            stats=stats,
            slope_distribution=slope_distribution,
            elevation_grid=elevation_grid.tolist(),
            slope_grid=slope_grid.tolist(),
            aspect_grid=aspect_grid.tolist(),
            contour_intervals=contour_intervals,
            vertex_count=vertex_count,
            face_count=face_count,
            texture_url=texture_url,
            hillshade_url=hillshade_url,
            source_info=f"Elevation data from {dem_meta.get('source')} at {resolution}x{resolution} grid (~{cell_x_m:.1f}m spacing)."
        )

reconstruction_service = ReconstructionService()
