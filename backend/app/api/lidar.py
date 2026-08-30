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
        bounds_obj = LatLonBounds(**res["bounds"])
        return LiDARProcessResponse(
            status=res["status"],
            file_name=res["file_name"],
            saved_file=res["saved_file"],
            point_count=res["point_count"],
            bounds=bounds_obj,
            elevation_stats=res["elevation_stats"],
            elevation_grid=res["elevation_grid"],
            metadata=res["metadata"],
            point_cloud_sample=res["point_cloud_sample"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LiDAR processing failed: {str(e)}")
