"""
Room 3D Reconstruction API Router
=================================
Endpoints for 360° mobile camera room scanning, spatial dimensioning,
interactive 3D room generation, and preset demos.
"""

import os
import io
import cv2
import logging
from typing import List, Optional
from PIL import Image
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import PlainTextResponse

from app.models.schemas import RoomReconstructResponse
from app.services.room_reconstruction_service import room_reconstruction_service, ROOM_PRESETS
from app.services.frame_quality_service import frame_quality_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/room", tags=["360 Room Scanner & 3D Spatial Reconstruction"])


@router.get("/demo/{room_type}", response_model=RoomReconstructResponse)
async def get_room_demo(room_type: str = "bedroom"):
    """
    Returns an instant calibrated 3D room reconstruction model with complete
    height, length, width, area, volume, and wall measurements.
    """
    valid_types = list(ROOM_PRESETS.keys())
    if room_type not in valid_types:
        room_type = "bedroom"
    
    return room_reconstruction_service.get_preset_room(room_type)


@router.post("/reconstruct", response_model=RoomReconstructResponse)
async def reconstruct_room(
    files: List[UploadFile] = File(...),
    room_name: str = Form("My Scanned Room"),
    calibration_mode: str = Form("auto"),
    reference_height_m: Optional[float] = Form(None)
):
    """
    Ingests 360° sweep frames or panoramic imagery from phone camera,
    estimates depth, segments boundaries, and computes exact room dimensions.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No camera frames or video provided.")

    images: List[Image.Image] = []
    video_extensions = {".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"}

    for f in files:
        filename = (f.filename or "").lower()
        ext = os.path.splitext(filename)[1]
        content_type = getattr(f, "content_type", "") or ""
        try:
            content = await f.read()
            if ext in video_extensions or content_type.startswith("video/"):
                # Video file: demux and extract quality frames
                extracted_rgbs, stats = frame_quality_service.extract_from_video(content, target_fps=2.0, max_frames=80)
                logger.info(f"Decoded video {f.filename}: {stats}")
                for rgb in extracted_rgbs:
                    images.append(Image.fromarray(rgb))
            else:
                # Image file: assess quality
                pil_img = Image.open(io.BytesIO(content)).convert("RGB")
                if pil_img.width > 1280 or pil_img.height > 1280:
                    pil_img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                
                # Verify frame quality
                bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
                quality = frame_quality_service.assess_frame(bgr)
                if quality.is_accepted:
                    images.append(pil_img)
                else:
                    logger.warning(f"Frame {f.filename} rejected: {quality.rejection_reason}")
        except Exception as e:
            logger.warning(f"Error reading upload {f.filename}: {e}")

    if len(images) < 3:
        raise HTTPException(
            status_code=422,
            detail=(
                "Insufficient valid camera frames captured (minimum 3 required, 30-80 recommended). "
                "Frames may be heavily motion-blurred, underexposed, or lack camera motion. "
                "Please walk slowly around the room with good lighting and steady camera."
            )
        )

    try:
        response = room_reconstruction_service.reconstruct_from_frames(
            images=images,
            room_name=room_name,
            calibration_mode=calibration_mode,
            reference_height_m=reference_height_m
        )
        return response
    except Exception as e:
        logger.error(f"Room reconstruction failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Reconstruction failed: {str(e)}. Ensure overlapping views while walking around the room."
        )


@router.post("/export-obj")
async def export_room_obj(
    length_m: float = Form(5.18),
    width_m: float = Form(3.82),
    height_m: float = Form(2.84),
    room_name: str = Form("room_model")
):
    """
    Generates a standard 3D Wavefront .OBJ file of the room geometry
    scaled in real-world metric meters (1 unit = 1 meter).
    """
    hw = width_m / 2.0
    hl = length_m / 2.0
    h = height_m

    lines = [
        f"# SIH26175 Room 3D Reconstruction: {room_name}",
        f"# Dimensions: Length={length_m:.2f}m, Width={width_m:.2f}m, Height={height_m:.2f}m",
        f"# Scale: 1 unit = 1 real-world meter",
        "",
        # Vertices
        f"v {-hw:.4f} {-hl:.4f} 0.0000",
        f"v {hw:.4f} {-hl:.4f} 0.0000",
        f"v {hw:.4f} {-hl:.4f} {h:.4f}",
        f"v {-hw:.4f} {-hl:.4f} {h:.4f}",
        f"v {-hw:.4f} {hl:.4f} 0.0000",
        f"v {hw:.4f} {hl:.4f} 0.0000",
        f"v {hw:.4f} {hl:.4f} {h:.4f}",
        f"v {-hw:.4f} {hl:.4f} {h:.4f}",
        "",
        # UVs
        "vt 0.0 0.0",
        "vt 1.0 0.0",
        "vt 1.0 1.0",
        "vt 0.0 1.0",
        "",
        # Normals
        "vn 0.0 -1.0 0.0",
        "vn 0.0 1.0 0.0",
        "vn -1.0 0.0 0.0",
        "vn 1.0 0.0 0.0",
        "vn 0.0 0.0 1.0",
        "vn 0.0 0.0 -1.0",
        "",
        # Faces
        "g SouthWall",
        "f 1/1/1 2/2/1 3/3/1",
        "f 1/1/1 3/3/1 4/4/1",
        "g NorthWall",
        "f 6/1/2 5/2/2 8/3/2",
        "f 6/1/2 8/3/2 7/4/2",
        "g WestWall",
        "f 5/1/3 1/2/3 4/3/3",
        "f 5/1/3 4/3/3 8/4/3",
        "g EastWall",
        "f 2/1/4 6/2/4 7/3/4",
        "f 2/1/4 7/3/4 3/4/4",
        "g Floor",
        "f 5/1/5 6/2/5 2/3/5",
        "f 5/1/5 2/3/5 1/4/5",
        "g Ceiling",
        "f 4/1/6 3/2/6 7/3/6",
        "f 4/1/6 7/3/6 8/4/6",
    ]

    content = "\n".join(lines)
    return PlainTextResponse(
        content=content,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={room_name}.obj"}
    )
