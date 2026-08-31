from fastapi import APIRouter, HTTPException, Response
from typing import List, Dict, Any
import numpy as np

from app.models.schemas import (
    TerrainReconstructRequest, TerrainReconstructResponse,
    PointInspectionRequest, PointInspection,
    TwoPointMeasurementRequest, TwoPointMeasurementResponse,
    PointValidationRequest, PointValidation
)
from app.services.reconstruction_service import reconstruction_service
from app.services.terrain_service import terrain_service
from app.providers.elevation_manager import elevation_manager
from app.utils.sample_data_generator import SAMPLE_REGIONS

router = APIRouter(prefix="/terrain", tags=["Terrain Reconstruction"])

@router.get("/samples")
def get_sample_regions():
    """Retrieve list of pre-configured sample regions."""
    return {"samples": SAMPLE_REGIONS}

@router.post("/reconstruct", response_model=TerrainReconstructResponse)
def reconstruct_terrain(request: TerrainReconstructRequest):
    """
    Generate authentic 3D terrain model in true metric units (meters) from DEM/LiDAR sources.
    """
    try:
        response = reconstruction_service.reconstruct_terrain(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terrain reconstruction failed: {str(e)}")

@router.post("/inspect_point", response_model=PointInspection)
def inspect_single_point(request: PointInspectionRequest):
    """
    Authoritative Point Inspection Pipeline.
    Retrieves source elevation (LiDAR DTM / Copernicus / SRTM) using continuous interpolation,
    calculates physical slope and aspect, and reports vertical datum and native resolution.
    """
    try:
        bounds_dict = request.grid_bounds.model_dump() if request.grid_bounds else None
        res = elevation_manager.inspect_point(
            lat=request.latitude,
            lon=request.longitude,
            bounds=bounds_dict,
            mesh_elevation_m=request.mesh_elevation_m
        )
        return PointInspection(**res)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Point inspection failed: {str(e)}")

@router.post("/validate_point", response_model=PointValidation)
def validate_point_elevation(request: PointValidationRequest):
    """
    Validates a single clicked terrain point against the underlying raw source DEM.
    """
    try:
        raw_elev, source = elevation_manager.get_point_elevation(request.latitude, request.longitude)
        discrepancy = round(abs(request.mesh_elevation_m - raw_elev), 2)
        is_valid = discrepancy <= 10.0

        return PointValidation(
            latitude=request.latitude,
            longitude=request.longitude,
            mesh_elevation_m=round(request.mesh_elevation_m, 2),
            raw_dem_elevation_m=round(raw_elev, 2),
            discrepancy_m=discrepancy,
            is_validated=is_valid,
            source_dem=source
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Point validation failed: {str(e)}")

@router.post("/measure", response_model=TwoPointMeasurementResponse)
def measure_two_points(request: TwoPointMeasurementRequest):
    """
    Calculate authoritative height difference, horizontal distance, 3D distance,
    slope gradient, grade percentage, and cross-section transect profile between Point A and Point B.
    """
    try:
        if request.bounds:
            bounds = request.bounds.model_dump()
        else:
            pad_lat = max(0.005, abs(request.lat_a - request.lat_b) * 0.2)
            pad_lon = max(0.005, abs(request.lon_a - request.lon_b) * 0.2)
            bounds = {
                "min_lat": min(request.lat_a, request.lat_b) - pad_lat,
                "max_lat": max(request.lat_a, request.lat_b) + pad_lat,
                "min_lon": min(request.lon_a, request.lon_b) - pad_lon,
                "max_lon": max(request.lon_a, request.lon_b) + pad_lon
            }

        elev_grid, meta = elevation_manager.get_elevation_grid(bounds, resolution=128, data_mode=request.data_mode or "real")
        metric_bounds = terrain_service.calculate_metric_bounds(bounds)
        cell_x = metric_bounds.width_m / 127.0
        cell_y = metric_bounds.height_m / 127.0

        from app.services.slope_aspect_service import slope_aspect_service
        slope_grid, aspect_grid = slope_aspect_service.calculate_slope_and_aspect(elev_grid, cell_x, cell_y)

        result = terrain_service.measure_two_points(
            request.lat_a, request.lon_a,
            request.lat_b, request.lon_b,
            elev_grid, slope_grid, aspect_grid, bounds,
            source_name=meta.get("source", "Copernicus DEM GLO-30")
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Measurement failed: {str(e)}")

@router.post("/export")
def export_terrain_model(request: TerrainReconstructRequest, format: str = "glb", exaggeration: float = 1.0):
    """
    Export reconstructed terrain as a 1:1 metric 3D asset (.glb or .obj).
    """
    try:
        res = reconstruction_service.reconstruct_terrain(request)
        elev_grid = np.array(res.elevation_grid, dtype=np.float32)
        bounds_dict = res.bounds.model_dump()

        file_bytes = terrain_service.export_mesh(elev_grid, bounds_dict, file_format=format, exaggeration=exaggeration)

        media_type = "model/gltf-binary" if format.lower() == "glb" else "text/plain"
        filename = f"terrain_model_{request.sample_id or 'custom'}.{format}"

        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"3D Export failed: {str(e)}")
