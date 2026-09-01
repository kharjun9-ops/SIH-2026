from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import os

from app.models.schemas import ImageAnalysisResponse, TerrainReconstructResponse
from app.services.image_service import image_service

router = APIRouter(prefix="/image", tags=["Image Computer Vision"])

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB

@router.post("/analyze", response_model=ImageAnalysisResponse)
async def analyze_terrain_image(file: UploadFile = File(...)):
    """
    Upload and analyze a terrain image:
    1. Validates format (JPG, PNG, WEBP) and size
    2. Parses EXIF geolocation & camera metadata
    3. Detects ORB terrain feature keypoints and horizon line
    4. Computes monocular relative depth estimation
    """
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format '{ext}'. Allowed formats: JPG, JPEG, PNG, WEBP."
        )
        
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds maximum limit of 20MB."
        )
        
    try:
        result = image_service.process_image(contents, file.filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")

@router.post("/reconstruct-3d", response_model=TerrainReconstructResponse)
async def reconstruct_terrain_from_image(
    file: UploadFile = File(...),
    grid_resolution: int = Form(128)
):
    """
    Direct Photogrammetric 3D Terrain Model Generation from a single photograph.
    Computes metric height field, surface normals, draped photo texture, and topographic analysis.
    """
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format '{ext}'. Allowed formats: JPG, JPEG, PNG, WEBP."
        )
        
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File size exceeds maximum limit of 20MB."
        )
        
    try:
        result = image_service.reconstruct_terrain_from_image(contents, file.filename, grid_resolution=grid_resolution)
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Image 3D reconstruction failed: {str(e)}")
