from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional

from app.models.schemas import LiDARProcessResponse, LatLonBounds
from app.services.lidar_service import lidar_service

router = APIRouter(prefix="/lidar", tags=["LiDAR & High-Resolution Point Cloud"])

@router.post("/process", response_model=LiDARProcessResponse)
async def process_lidar_file(
    file: UploadFile = File(...),
    mode: str = Form("dtm"),
    resolution: int = Form(128)
):
    """
    Upload and process an airborne/terrestrial LiDAR point cloud (.las, .laz, .tif).
    mode: 'dtm' (Bare-Earth ASPRS Class 2 Ground Points) or 'dsm' (Surface including canopy).
    """
    if not (file.filename.endswith('.las') or file.filename.endswith('.laz') or file.filename.endswith('.tif')):
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .las, .laz, or .tif")

    contents = await file.read()
    if len(contents) > 100 * 1024 * 1024:  # 100 MB max
        raise HTTPException(status_code=400, detail="File too large (max 100MB)")

    try:
        res = lidar_service.process_uploaded_las(contents, file.filename, mode=mode, resolution=resolution)
        
        point_count = int(res.get("point_count", 0))
        point_density = float(res.get("point_density_sq_m", 0.0))
        point_spacing = float(res.get("point_spacing_m", 1.0))
        has_ground = bool(res.get("has_ground_classification", False))
        accuracy_stmt = str(res.get("accuracy_statement", "Source accuracy specification unavailable; reported values are derived from the uploaded LiDAR dataset."))

        print("\n=== LiDAR RESPONSE DEBUG ===", flush=True)
        print(f"status: {res.get('status')}", flush=True)
        print(f"point_count: {point_count}", flush=True)
        print(f"point_density_sq_m: {point_density}", flush=True)
        print(f"point_spacing_m: {point_spacing}", flush=True)
        print(f"has_ground_classification: {has_ground}", flush=True)
        print(f"accuracy_statement: {accuracy_stmt}", flush=True)
        print("============================\n", flush=True)

        bounds_obj = LatLonBounds(**res["bounds"])
        return LiDARProcessResponse(
            status=str(res.get("status", "success")),
            file_name=str(res.get("file_name", file.filename)),
            saved_file=str(res.get("saved_file", "")),
            point_count=point_count,
            point_density_sq_m=point_density,
            point_spacing_m=point_spacing,
            has_ground_classification=has_ground,
            accuracy_statement=accuracy_stmt,
            bounds=bounds_obj,
            elevation_stats=res.get("elevation_stats", {}),
            elevation_grid=res.get("elevation_grid", []),
            metadata=res.get("metadata", {}),
            point_cloud_sample=res.get("point_cloud_sample", [])
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"LiDAR processing failed: {str(e)}")
