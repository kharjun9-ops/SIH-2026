"""
Depth Estimation Pipeline API — SIH26175 Core Requirement
==========================================================
Unified endpoint for both input modes:

    Mode 1: PNG/JPG/JPEG → Non-Georeferenced → Relative DSM (rDSM)
    Mode 2: GeoTIFF/TIFF → Georeferenced → Metric DSM (if calibration succeeds)

Pipeline:
    INPUT IMAGE → PREPROCESS → MONOCULAR DEPTH → RELATIVE DEPTH
    → DEPTH POST-PROCESSING → SCALE CALIBRATION → DSM
    → 3D SURFACE MESH → RGB TEXTURE → RESPONSE
"""

import os
import io
import re
import time
import uuid
import math
import logging
import numpy as np
from PIL import Image
from scipy.ndimage import zoom as scipy_zoom
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.config import settings
from app.models.schemas import (
    DepthPipelineResponse, DepthCalibrationInfo, GeoTIFFMetadata,
    LatLonBounds, MetricBounds
)
from app.services.depth_estimation_service import depth_estimation_service
from app.services.geotiff_service import geotiff_service
from app.services.slope_aspect_service import slope_aspect_service
from app.services.hillshade_service import hillshade_service
from app.services.contour_service import contour_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/depth", tags=["Monocular Depth Pipeline (SIH Core)"])

# Supported file extensions
NON_GEO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
GEO_EXTENSIONS = {".tif", ".tiff", ".geotiff"}
ALL_EXTENSIONS = NON_GEO_EXTENSIONS | GEO_EXTENSIONS
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB for GeoTIFFs

# Result cache
_pipeline_cache: dict = {}


@router.post("/process", response_model=DepthPipelineResponse)
async def process_depth_pipeline(
    file: UploadFile = File(...),
    grid_resolution: int = Form(256),
    calibration_mode: str = Form("auto"),
    depth_model: str = Form("auto"),
):
    """
    Unified Monocular Depth Estimation Pipeline.
    
    Automatically detects input mode based on file extension:
    - PNG/JPG/JPEG/WEBP → Mode 1: Non-Georeferenced → Relative DSM
    - TIFF/GeoTIFF → Mode 2: Georeferenced → Metric DSM (if calibration succeeds)
    
    Pipeline steps:
    1. Read input image (and spatial metadata if GeoTIFF)
    2. Preprocess RGB image
    3. Run monocular depth estimation (MiDaS or OpenCV)
    4. Post-process depth map
    5. Attempt scale calibration (Mode 2 only, with reference DEM)
    6. Generate terrain derivatives (slope, aspect, hillshade)
    7. Create 3D mesh assets and texture
    """
    t0 = time.time()
    pipeline_steps = []
    
    # ─── 0. Validate Input ────────────────────────────────────────────────
    
    ext = os.path.splitext(file.filename or "upload")[1].lower()
    if ext not in ALL_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file format '{ext}'. "
                f"Supported: PNG, JPG, JPEG, WEBP (Mode 1) or TIFF/GeoTIFF (Mode 2)."
            )
        )
    
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds maximum size of 50MB.")
    
    safe_filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', file.filename or "upload")
    job_id = uuid.uuid4().hex[:16]
    
    is_geotiff = ext in GEO_EXTENSIONS
    input_mode = "georeferenced" if is_geotiff else "non_georeferenced"
    pipeline_steps.append(f"Input detected: {input_mode} ({ext})")
    
    grid_resolution = max(64, min(512, grid_resolution))
    
    try:
        # ─── 1. Read Image & Metadata ─────────────────────────────────────
        
        geotiff_meta = None
        geo_bounds = None
        
        if is_geotiff:
            pipeline_steps.append("Reading GeoTIFF with spatial metadata extraction")
            img_rgb, geotiff_meta = geotiff_service.read_geotiff(contents)
            
            if geotiff_meta.has_georeference:
                geo_bounds = geotiff_service.extract_bounds(geotiff_meta)
                pipeline_steps.append(
                    f"Georeferenced: CRS={geotiff_meta.crs}, "
                    f"Pixel size={geotiff_meta.pixel_size_x}×{geotiff_meta.pixel_size_y} {geotiff_meta.pixel_size_unit}"
                )
            else:
                pipeline_steps.append("GeoTIFF lacks valid CRS — treating as non-georeferenced")
                input_mode = "non_georeferenced"
        else:
            pipeline_steps.append("Reading RGB image (non-georeferenced)")
            pil_img = Image.open(io.BytesIO(contents)).convert("RGB")
            img_rgb = np.array(pil_img)
        
        img_h, img_w = img_rgb.shape[:2]
        pipeline_steps.append(f"Image dimensions: {img_w}×{img_h} pixels")
        
        # ─── 2. Monocular Depth Estimation ────────────────────────────────
        
        pipeline_steps.append(f"Running monocular depth estimation (preference: {depth_model})")
        
        depth_map, model_name, depth_meta = depth_estimation_service.estimate_depth(
            img_rgb,
            model_preference=depth_model,
            target_resolution=grid_resolution
        )
        
        pipeline_steps.append(
            f"Depth estimation complete: {model_name} "
            f"({depth_meta['processing_time_ms']}ms, output {depth_map.shape[0]}×{depth_map.shape[1]})"
        )
        
        # ─── 3. Save Depth Visualizations ─────────────────────────────────
        
        depth_color_url, depth_raw_url = depth_estimation_service.save_depth_visualizations(
            depth_map, safe_filename
        )
        pipeline_steps.append("Depth visualizations saved (turbo colormap + grayscale)")
        
        # ─── 4. Scale Calibration ─────────────────────────────────────────
        
        if input_mode == "georeferenced" and geo_bounds and calibration_mode != "none":
            pipeline_steps.append("Attempting scale calibration against reference DEM")
            
            elevation_grid, calibration_info = geotiff_service.calibrate_depth_to_metric(
                depth_map, geo_bounds, calibration_mode
            )
            
            if calibration_info.is_metric:
                pipeline_steps.append(
                    f"Scale calibration SUCCEEDED: "
                    f"R²={calibration_info.calibration_r_squared}, "
                    f"RMSE={calibration_info.calibration_rmse}m"
                )
                dsm_type = "METRIC"
                dsm_label = "Metric Digital Surface Model (DSM)"
                elevation_unit = "meters"
            else:
                pipeline_steps.append(
                    f"Scale calibration insufficient — output remains RELATIVE. "
                    f"Reason: {calibration_info.calibration_notice}"
                )
                elevation_grid = depth_map.copy()
                dsm_type = "RELATIVE"
                dsm_label = "Relative Digital Surface Model (rDSM)"
                elevation_unit = "relative (0-1)"
        else:
            pipeline_steps.append("No scale calibration (non-georeferenced input or disabled)")
            elevation_grid = depth_map.copy()
            calibration_info = DepthCalibrationInfo(
                calibration_method="none",
                is_metric=False,
                confidence_level="low",
                calibration_notice=(
                    "Non-georeferenced input: no scale calibration applied. "
                    "Output represents RELATIVE depth/height only. "
                    "Values range from 0 (lowest) to 1 (highest) in arbitrary relative units."
                ),
            )
            dsm_type = "RELATIVE"
            dsm_label = "Relative Digital Surface Model (rDSM)"
            elevation_unit = "relative (0-1)"
        
        # ─── 5. Geographic Bounds ─────────────────────────────────────────
        
        if geo_bounds:
            bounds = geo_bounds
            from app.services.terrain_service import terrain_service
            metric_bounds = terrain_service.calculate_metric_bounds({
                "min_lat": bounds.min_lat,
                "max_lat": bounds.max_lat,
                "min_lon": bounds.min_lon,
                "max_lon": bounds.max_lon,
            })
        else:
            bounds = None
            side_m = float(grid_resolution) * 10.0
            metric_bounds = MetricBounds(
                width_m=side_m,
                height_m=side_m,
                min_x_m=-side_m / 2,
                max_x_m=side_m / 2,
                min_y_m=-side_m / 2,
                max_y_m=side_m / 2,
            )
        
        # ─── 6. Terrain Derivatives ───────────────────────────────────────
        
        rows, cols = elevation_grid.shape
        cell_x = metric_bounds.width_m / max(1, cols - 1)
        cell_y = metric_bounds.height_m / max(1, rows - 1)
        
        slope_grid, aspect_grid = slope_aspect_service.calculate_slope_and_aspect(
            elevation_grid, cell_x, cell_y
        )
        pipeline_steps.append("Terrain derivatives computed (slope, aspect)")
        
        # Hillshade
        hillshade_url = hillshade_service.generate_hillshade_texture(
            elevation_grid, cell_x, cell_y, 315.0, 45.0, 1.0
        )
        pipeline_steps.append("Hillshade texture generated")
        
        # Contour intervals
        e_min = float(np.min(elevation_grid))
        e_max = float(np.max(elevation_grid))
        if dsm_type == "METRIC":
            contour_intervals = contour_service.calculate_contour_levels(e_min, e_max, 20.0)
        else:
            contour_intervals = contour_service.calculate_contour_levels(e_min, e_max, 0.05)
        
        # ─── 7. Save Texture ──────────────────────────────────────────────
        
        pil_input = Image.fromarray(img_rgb)
        texture_url = depth_estimation_service.save_texture(pil_input, safe_filename)
        pipeline_steps.append("RGB texture saved for 3D mesh draping")
        
        # ─── 8. Mesh stats ────────────────────────────────────────────────
        
        vertex_count = rows * cols
        face_count = (rows - 1) * (cols - 1) * 2
        
        # ─── 9. Build Scientific Notice ───────────────────────────────────
        
        if dsm_type == "METRIC":
            scientific_notice = (
                f"This Digital Surface Model was generated from a single optical RGB image using "
                f"monocular depth estimation ({model_name}), then calibrated to metric elevation "
                f"using {calibration_info.reference_source or 'reference DEM'} data. "
                f"Calibration R²={calibration_info.calibration_r_squared}, "
                f"RMSE={calibration_info.calibration_rmse}m. "
                f"This is NOT equivalent to surveyed or LiDAR-derived elevation data. "
                f"Use with appropriate caution."
            )
        else:
            scientific_notice = (
                f"This Relative Digital Surface Model (rDSM) was generated from a single optical RGB image "
                f"using monocular depth estimation ({model_name}). "
                f"The depth values are RELATIVE only — they represent the predicted ordering of surface "
                f"heights, NOT calibrated metric elevations. Values range from 0 (lowest) to 1 (highest). "
                f"This cannot substitute for surveyed or LiDAR-derived terrain data."
            )
        
        elapsed_ms = int((time.time() - t0) * 1000)
        pipeline_steps.append(f"Pipeline complete in {elapsed_ms}ms")
        
        # ─── Build Response ───────────────────────────────────────────────
        
        response = DepthPipelineResponse(
            status="success",
            job_id=job_id,
            input_mode=input_mode,
            input_filename=file.filename or "upload",
            image_width=img_w,
            image_height=img_h,
            
            depth_model_used=model_name,
            depth_map_url=depth_color_url,
            raw_depth_url=depth_raw_url,
            depth_min=float(np.min(depth_map)),
            depth_max=float(np.max(depth_map)),
            depth_mean=float(np.mean(depth_map)),
            
            dsm_type=dsm_type,
            dsm_label=dsm_label,
            elevation_grid=np.round(elevation_grid, 4).tolist(),
            elevation_min=round(float(np.min(elevation_grid)), 4),
            elevation_max=round(float(np.max(elevation_grid)), 4),
            elevation_mean=round(float(np.mean(elevation_grid)), 4),
            elevation_unit=elevation_unit,
            
            slope_grid=np.round(slope_grid, 2).tolist(),
            aspect_grid=np.round(aspect_grid, 2).tolist(),
            grid_resolution=grid_resolution,
            
            calibration=calibration_info,
            geotiff_metadata=geotiff_meta,
            
            bounds=bounds if geo_bounds else None,
            metric_bounds=metric_bounds,
            
            texture_url=texture_url,
            hillshade_url=hillshade_url,
            mesh_vertex_count=vertex_count,
            mesh_face_count=face_count,
            
            contour_intervals=contour_intervals,
            processing_time_ms=elapsed_ms,
            pipeline_steps=pipeline_steps,
            scientific_notice=scientific_notice,
        )
        
        # Cache result
        _pipeline_cache[job_id] = response
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Depth pipeline failed: {str(e)}")


@router.get("/result/{job_id}", response_model=DepthPipelineResponse)
async def get_pipeline_result(job_id: str):
    """Retrieve a cached pipeline result by job ID."""
    if job_id in _pipeline_cache:
        return _pipeline_cache[job_id]
    raise HTTPException(status_code=404, detail=f"Pipeline result '{job_id}' not found or expired.")


@router.get("/capabilities")
async def get_pipeline_capabilities():
    """Return information about the depth pipeline capabilities."""
    from app.services.depth_estimation_service import _TORCH_AVAILABLE, _MIDAS_MODEL_TYPE
    
    return {
        "status": "online",
        "supported_inputs": {
            "mode_1_non_georeferenced": list(NON_GEO_EXTENSIONS),
            "mode_2_georeferenced": list(GEO_EXTENSIONS),
        },
        "depth_models": {
            "midas_available": _TORCH_AVAILABLE,
            "midas_model": _MIDAS_MODEL_TYPE or "not loaded",
            "opencv_fallback": "always available",
        },
        "calibration_methods": [
            "none (relative depth only)",
            "reference_dem (Copernicus GLO-30 / SRTM)",
            "auto (attempts calibration if georeferenced)",
        ],
        "output_formats": {
            "relative": "rDSM — Relative Digital Surface Model (0-1 range)",
            "metric": "DSM — Metric Digital Surface Model (meters, only if calibration succeeds)",
        },
        "max_grid_resolution": 512,
        "max_file_size_mb": MAX_FILE_SIZE // (1024 * 1024),
    }
