import os
import uuid
import math
import numpy as np
from PIL import Image, ExifTags
import cv2
from typing import Dict, Any, Tuple, Optional

from app.config import settings
from app.models.schemas import ImageAnalysisResponse, LatLonBounds

class ImageService:
    """Processes uploaded terrain imagery with OpenCV feature detection and monocular relative depth estimation."""
    
    @staticmethod
    def _extract_exif_gps(image: Image.Image) -> Tuple[Optional[float], Optional[float], Optional[float]]:
        """Extract GPS latitude, longitude, altitude from image EXIF metadata if present."""
        try:
            exif = image._getexif()
            if not exif:
                return None, None, None
                
            gps_info = {}
            for key, val in exif.items():
                tag_name = ExifTags.TAGS.get(key, key)
                if tag_name == "GPSInfo":
                    for t, value in val.items():
                        sub_tag = ExifTags.GPSTAGS.get(t, t)
                        gps_info[sub_tag] = value
                        
            if not gps_info:
                return None, None, None
                
            def dms_to_dd(dms, ref):
                degrees = float(dms[0])
                minutes = float(dms[1])
                seconds = float(dms[2])
                dd = degrees + minutes / 60.0 + seconds / 3600.0
                if ref in ['S', 'W']:
                    dd = -dd
                return dd

            lat = None
            lon = None
            alt = None
            
            if "GPSLatitude" in gps_info and "GPSLatitudeRef" in gps_info:
                lat = round(dms_to_dd(gps_info["GPSLatitude"], gps_info["GPSLatitudeRef"]), 6)
                
            if "GPSLongitude" in gps_info and "GPSLongitudeRef" in gps_info:
                lon = round(dms_to_dd(gps_info["GPSLongitude"], gps_info["GPSLongitudeRef"]), 6)
                
            if "GPSAltitude" in gps_info:
                alt = round(float(gps_info["GPSAltitude"]), 1)
                
            return lat, lon, alt
        except Exception:
            return None, None, None

    @staticmethod
    def estimate_monocular_relative_depth(img_rgb: np.ndarray) -> np.ndarray:
        """
        Estimate relative depth map [0.0 (near) to 1.0 (far)] from a monocular terrain photograph.
        Uses depth-from-focus, atmospheric haze gradient, and multi-scale Laplacian cues.
        """
        h, w, _ = img_rgb.shape
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        
        # 1. Atmospheric Perspective / Haze Cue (distant terrain looks lighter / lower contrast)
        dark_channel = np.min(img_rgb, axis=2)
        haze_depth = cv2.boxFilter(dark_channel, -1, (15, 15)) / 255.0
        
        # 2. Vertical position cue (in terrestrial landscape photos, horizon is near top-half, ground near bottom)
        y_coords = np.linspace(1.0, 0.0, h)[:, None] # 1.0 at bottom (close), 0.0 at top (distant)
        y_depth = np.repeat(y_coords, w, axis=1)
        
        # 3. High-frequency texture / edge sharpness cue (closer objects have sharper high frequencies)
        laplacian = np.abs(cv2.Laplacian(gray, cv2.CV_64F))
        sharpness = cv2.GaussianBlur(laplacian, (21, 21), 0)
        norm_sharpness = (sharpness - np.min(sharpness)) / (np.max(sharpness) - np.min(sharpness) + 1e-6)
        
        # Combine cues for relative depth estimation
        raw_depth = 0.5 * (1.0 - y_depth) + 0.3 * haze_depth + 0.2 * (1.0 - norm_sharpness)
        raw_depth = cv2.bilateralFilter(raw_depth.astype(np.float32), d=9, sigmaColor=75, sigmaSpace=75)
        
        # Normalize strictly to [0.0, 1.0]
        norm_depth = (raw_depth - np.min(raw_depth)) / (np.max(raw_depth) - np.min(raw_depth) + 1e-6)
        return norm_depth

    @staticmethod
    def detect_features_and_horizon(img_rgb: np.ndarray) -> Tuple[np.ndarray, int, bool, Optional[float]]:
        """
        Detect ORB keypoints, Canny edges, and estimate dominant horizon line.
        Returns: (annotated_image, keypoint_count, horizon_detected, horizon_y_norm)
        """
        h, w, _ = img_rgb.shape
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        annotated = img_rgb.copy()
        
        # 1. ORB Keypoint detection
        orb = cv2.ORB_create(nfeatures=500)
        keypoints, _ = orb.detectAndCompute(gray, None)
        
        # Draw glowing green keypoints
        for kp in keypoints:
            x, y = int(kp.pt[0]), int(kp.pt[1])
            cv2.circle(annotated, (x, y), 3, (0, 255, 128), -1)
            
        # 2. Canny Edge Detection & Horizon line detection
        edges = cv2.Canny(gray, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=int(w * 0.25), maxLineGap=20)
        
        horizon_found = False
        horizon_y = None
        
        if lines is not None:
            horizontal_lines = []
            for line in lines:
                x1, y1, x2, y2 = line[0]
                dx = x2 - x1
                dy = y2 - y1
                angle = abs(math.degrees(math.atan2(dy, dx)))
                # Horizon lines are mostly horizontal (angle < 15 deg) and in top 70% of image
                if angle < 15 and max(y1, y2) < h * 0.75:
                    horizontal_lines.append((y1 + y2) / 2.0)
                    
            if horizontal_lines:
                horizon_found = True
                avg_y = float(np.mean(horizontal_lines))
                horizon_y = round(avg_y / h, 3)
                # Draw cyan horizon line
                cv2.line(annotated, (0, int(avg_y)), (w, int(avg_y)), (0, 230, 255), 2, cv2.LINE_AA)
                
        return annotated, len(keypoints), horizon_found, horizon_y

    @staticmethod
    def process_image(file_bytes: bytes, filename: str) -> ImageAnalysisResponse:
        """Process an uploaded image through EXIF parsing, feature detection, and monocular relative depth estimation."""
        # Load with PIL
        pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        w, h = pil_img.size
        
        # Extract GPS
        exif_lat, exif_lon, exif_alt = ImageService._extract_exif_gps(pil_img)
        has_gps = (exif_lat is not None and exif_lon is not None)
        
        # Convert to OpenCV RGB array
        img_np = np.array(pil_img)
        
        # Feature detection
        annotated_img, num_kps, has_horizon, horizon_y = ImageService.detect_features_and_horizon(img_np)
        
        # Relative depth estimation
        depth_map = ImageService.estimate_monocular_relative_depth(img_np)
        
        # Colorize depth map with Viridis / Turbo heatmap for visual display
        depth_u8 = (depth_map * 255).astype(np.uint8)
        depth_color = cv2.applyColorMap(depth_u8, cv2.COLORMAP_TURBO)
        depth_color_rgb = cv2.cvtColor(depth_color, cv2.COLOR_BGR2RGB)
        
        # Save output images to upload dir
        import re
        safe_fname = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
        uid = uuid.uuid4().hex[:12]
        depth_fname = f"depth_{uid}_{safe_fname}.png"
        feat_fname = f"feat_{uid}_{safe_fname}.png"
        
        depth_save_path = os.path.join(settings.UPLOAD_DIR, depth_fname)
        feat_save_path = os.path.join(settings.UPLOAD_DIR, feat_fname)
        
        Image.fromarray(depth_color_rgb).save(depth_save_path, "PNG")
        Image.fromarray(annotated_img).save(feat_save_path, "PNG")
        
        depth_url = f"/api/uploads/{depth_fname}"
        feat_url = f"/api/uploads/{feat_fname}"
        
        rec_bounds = None
        if has_gps:
            rec_bounds = LatLonBounds(
                min_lat=exif_lat - 0.02,
                max_lat=exif_lat + 0.02,
                min_lon=exif_lon - 0.02,
                max_lon=exif_lon + 0.02,
                center_lat=exif_lat,
                center_lon=exif_lon,
                radius_meters=2500.0
            )
            
        return ImageAnalysisResponse(
            status="success",
            file_name=filename,
            width=w,
            height=h,
            has_exif_gps=has_gps,
            exif_lat=exif_lat,
            exif_lon=exif_lon,
            exif_altitude=exif_alt,
            keypoints_detected=num_kps,
            horizon_detected=has_horizon,
            horizon_y_norm=horizon_y,
            depth_map_url=depth_url,
            features_preview_url=feat_url,
            depth_notice="AI-estimated relative depth (relative scale only, not calibrated absolute meters)",
            recommended_bounds=rec_bounds
        )

import io
image_service = ImageService()
