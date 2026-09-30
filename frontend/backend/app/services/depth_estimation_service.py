"""
Monocular Depth Estimation Service — SIH26175 Core Pipeline
============================================================
Implements the complete monocular depth estimation pipeline:

    RGB IMAGE → PREPROCESS → DEPTH MODEL → RELATIVE DEPTH → POST-PROCESSING

Supports two backends:
  1. MiDaS DPT (PyTorch/timm) — State-of-the-art neural depth estimation
  2. OpenCV Multi-Cue — Fallback when PyTorch is unavailable

The output is ALWAYS relative depth (0-1 range) at this stage.
Scale calibration to metric is handled separately.
"""

import os
import io
import uuid
import time
import logging
import numpy as np
import cv2
from PIL import Image
from typing import Tuple, Optional, Dict, Any
from scipy.ndimage import zoom as scipy_zoom

from app.config import settings

logger = logging.getLogger(__name__)

# ─── Lazy-load PyTorch / MiDaS ───────────────────────────────────────────────

_TORCH_AVAILABLE = False
_MIDAS_MODEL = None
_MIDAS_TRANSFORM = None
_MIDAS_DEVICE = None
_MIDAS_MODEL_TYPE = None

def _try_load_midas(model_type: str = "DPT_Hybrid") -> bool:
    """Attempt to load MiDaS model. Returns True if successful."""
    global _TORCH_AVAILABLE, _MIDAS_MODEL, _MIDAS_TRANSFORM, _MIDAS_DEVICE, _MIDAS_MODEL_TYPE
    
    if _MIDAS_MODEL is not None:
        return True
    
    try:
        import torch
        _TORCH_AVAILABLE = True
        
        _MIDAS_DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Try loading MiDaS via torch.hub
        _MIDAS_MODEL = torch.hub.load("intel-isl/MiDaS", model_type, trust_repo=True)
        _MIDAS_MODEL.to(_MIDAS_DEVICE)
        _MIDAS_MODEL.eval()
        
        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
        
        if model_type in ("DPT_Large", "DPT_Hybrid"):
            _MIDAS_TRANSFORM = midas_transforms.dpt_transform
        else:
            _MIDAS_TRANSFORM = midas_transforms.small_transform
        
        _MIDAS_MODEL_TYPE = model_type
        logger.info(f"MiDaS {model_type} loaded successfully on {_MIDAS_DEVICE}")
        return True
        
    except Exception as e:
        logger.warning(f"MiDaS model load failed: {e}. Will use OpenCV fallback.")
        _TORCH_AVAILABLE = False
        _MIDAS_MODEL = None
        return False


class DepthEstimationService:
    """
    Monocular Depth Estimation Engine.
    
    Produces relative depth maps from single RGB images.
    Does NOT perform scale calibration — that is a separate step.
    """
    
    # ─── Main Entry Point ─────────────────────────────────────────────────
    
    def estimate_depth(
        self,
        img_rgb: np.ndarray,
        model_preference: str = "auto",
        target_resolution: int = 256
    ) -> Tuple[np.ndarray, str, Dict[str, Any]]:
        """
        Estimate relative depth from an RGB image.
        
        Args:
            img_rgb: Input image as HxWx3 numpy array (RGB)
            model_preference: 'auto', 'midas', or 'opencv'
            target_resolution: Output depth map resolution (NxN)
            
        Returns:
            (depth_map, model_name, metadata_dict)
            depth_map: HxW float32 array normalized to [0.0, 1.0]
                       where 1.0 = closest/highest, 0.0 = farthest/lowest
        """
        t0 = time.time()
        
        # Preprocessing
        preprocessed = self._preprocess(img_rgb)
        
        # Model selection
        model_name = "OpenCV Multi-Cue"
        
        if model_preference in ("auto", "midas"):
            if _try_load_midas("DPT_Hybrid"):
                try:
                    depth_map = self._estimate_midas(preprocessed)
                    model_name = f"MiDaS {_MIDAS_MODEL_TYPE}"
                except Exception as e:
                    logger.warning(f"MiDaS inference failed: {e}, falling back to OpenCV")
                    depth_map = self._estimate_opencv_multicue(preprocessed)
            else:
                depth_map = self._estimate_opencv_multicue(preprocessed)
        else:
            depth_map = self._estimate_opencv_multicue(preprocessed)
        
        # Post-processing
        depth_map = self._postprocess(depth_map)
        
        # Resample to target resolution
        if depth_map.shape[0] != target_resolution or depth_map.shape[1] != target_resolution:
            zoom_y = target_resolution / depth_map.shape[0]
            zoom_x = target_resolution / depth_map.shape[1]
            depth_map = scipy_zoom(depth_map, (zoom_y, zoom_x), order=1)
        
        # Final normalization
        depth_map = np.nan_to_num(depth_map, nan=0.5)
        dmin, dmax = float(np.min(depth_map)), float(np.max(depth_map))
        if dmax - dmin > 1e-6:
            depth_map = (depth_map - dmin) / (dmax - dmin)
        
        elapsed_ms = int((time.time() - t0) * 1000)
        
        metadata = {
            "model": model_name,
            "input_shape": list(img_rgb.shape),
            "output_shape": list(depth_map.shape),
            "depth_min": float(np.min(depth_map)),
            "depth_max": float(np.max(depth_map)),
            "depth_mean": float(np.mean(depth_map)),
            "depth_std": float(np.std(depth_map)),
            "processing_time_ms": elapsed_ms,
        }
        
        return depth_map.astype(np.float32), model_name, metadata
    
    # ─── Preprocessing ────────────────────────────────────────────────────
    
    @staticmethod
    def _preprocess(img_rgb: np.ndarray) -> np.ndarray:
        """Normalize and prepare image for depth estimation."""
        h, w = img_rgb.shape[:2]
        
        # Limit very large images to prevent OOM
        max_dim = 1024
        if max(h, w) > max_dim:
            scale = max_dim / max(h, w)
            new_h, new_w = int(h * scale), int(w * scale)
            img_rgb = cv2.resize(img_rgb, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        return img_rgb
    
    # ─── MiDaS DPT Neural Depth ──────────────────────────────────────────
    
    @staticmethod
    def _estimate_midas(img_rgb: np.ndarray) -> np.ndarray:
        """Run MiDaS DPT depth estimation."""
        import torch
        
        input_batch = _MIDAS_TRANSFORM(img_rgb).to(_MIDAS_DEVICE)
        
        with torch.no_grad():
            prediction = _MIDAS_MODEL(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=img_rgb.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()
        
        depth = prediction.cpu().numpy()
        
        # MiDaS produces inverse depth (higher = closer)
        # Normalize to [0, 1] where 1.0 = closest/highest
        dmin, dmax = depth.min(), depth.max()
        if dmax - dmin > 1e-6:
            depth = (depth - dmin) / (dmax - dmin)
        
        return depth.astype(np.float32)
    
    # ─── OpenCV Multi-Cue Fallback (Enhanced) ─────────────────────────────
    
    @staticmethod
    def _estimate_opencv_multicue(img_rgb: np.ndarray) -> np.ndarray:
        """
        Enhanced multi-cue monocular depth estimation using OpenCV.
        
        Combines 7 complementary depth cues:
        1. Atmospheric perspective (dark channel / haze prior)
        2. Vertical position (linear perspective)
        3. Texture gradient (defocus / distance)
        4. Edge/shading gradient (shape-from-shading)
        5. Color saturation attenuation
        6. Multi-scale structure
        7. Local contrast energy
        """
        h, w = img_rgb.shape[:2]
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
        
        # 1. Atmospheric haze / dark channel prior
        dark_channel = np.min(img_rgb, axis=2).astype(np.float32) / 255.0
        haze_depth = cv2.boxFilter(dark_channel, -1, (15, 15))
        
        # 2. Vertical position perspective cue (objects higher in image are farther)
        y_coords = np.linspace(1.0, 0.0, h)[:, None]
        y_depth = np.broadcast_to(y_coords, (h, w)).copy()
        
        # 3. Texture gradient (blurrier = farther)
        laplacian = np.abs(cv2.Laplacian(
            (gray * 255).astype(np.uint8), cv2.CV_64F
        ))
        sharpness = cv2.GaussianBlur(laplacian, (21, 21), 0)
        sharpness_norm = sharpness / (np.max(sharpness) + 1e-6)
        
        # 4. Gradient magnitude (shape from shading)
        grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=5)
        grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=5)
        grad_mag = np.sqrt(grad_x**2 + grad_y**2)
        grad_smooth = cv2.GaussianBlur(grad_mag, (15, 15), 0)
        grad_norm = grad_smooth / (np.max(grad_smooth) + 1e-6)
        
        # 5. Color saturation attenuation (distant objects are less saturated)
        hsv = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
        saturation = hsv[:, :, 1] / 255.0
        sat_smooth = cv2.GaussianBlur(saturation, (21, 21), 0)
        sat_norm = sat_smooth / (np.max(sat_smooth) + 1e-6)
        
        # 6. Multi-scale structure (coarse depth from large-scale blurred luminance)
        coarse = cv2.GaussianBlur(gray, (51, 51), 0)
        fine = cv2.GaussianBlur(gray, (5, 5), 0)
        multiscale = np.abs(coarse - fine)
        ms_norm = multiscale / (np.max(multiscale) + 1e-6)
        
        # 7. Local contrast energy
        local_mean = cv2.boxFilter(gray, -1, (31, 31))
        local_var = cv2.boxFilter(gray**2, -1, (31, 31)) - local_mean**2
        local_var = np.clip(local_var, 0, None)
        contrast = np.sqrt(local_var)
        contrast_norm = contrast / (np.max(contrast) + 1e-6)
        
        # Weighted fusion (tuned for aerial/satellite/terrain imagery)
        raw_depth = (
            0.30 * (1.0 - y_depth) +           # vertical perspective
            0.20 * haze_depth +                  # atmospheric haze
            0.12 * (1.0 - sharpness_norm) +      # defocus
            0.15 * grad_norm +                    # shape from shading
            0.08 * sat_norm +                     # saturation
            0.08 * ms_norm +                      # multi-scale
            0.07 * contrast_norm                  # local contrast
        )
        
        return raw_depth.astype(np.float32)
    
    # ─── Post-processing ──────────────────────────────────────────────────
    
    @staticmethod
    def _postprocess(depth_map: np.ndarray) -> np.ndarray:
        """
        Post-process raw depth map:
        1. Edge-preserving bilateral filter
        2. Guided filter smoothing
        3. Hole filling
        4. Final normalization
        """
        depth = depth_map.astype(np.float32)
        
        # Bilateral filter preserves sharp elevation transitions (ridges, cliffs)
        depth = cv2.bilateralFilter(depth, d=9, sigmaColor=0.15, sigmaSpace=15)
        
        # Light Gaussian for noise
        depth = cv2.GaussianBlur(depth, (3, 3), 0.5)
        
        # Normalize
        dmin, dmax = np.min(depth), np.max(depth)
        if dmax - dmin > 1e-6:
            depth = (depth - dmin) / (dmax - dmin)
        
        return depth
    
    # ─── Visualization Helpers ────────────────────────────────────────────
    
    def save_depth_visualizations(
        self,
        depth_map: np.ndarray,
        filename_prefix: str
    ) -> Tuple[str, str]:
        """
        Save colorized and raw depth maps as images.
        
        Returns:
            (colorized_url, raw_url)
        """
        uid = uuid.uuid4().hex[:12]
        
        # Colorized depth (turbo heatmap)
        depth_u8 = (np.clip(depth_map, 0, 1) * 255).astype(np.uint8)
        depth_color = cv2.applyColorMap(depth_u8, cv2.COLORMAP_TURBO)
        depth_color_rgb = cv2.cvtColor(depth_color, cv2.COLOR_BGR2RGB)
        
        color_fname = f"depth_color_{uid}_{filename_prefix}.png"
        color_path = os.path.join(settings.UPLOAD_DIR, color_fname)
        Image.fromarray(depth_color_rgb).save(color_path, "PNG")
        
        # Raw grayscale depth
        raw_fname = f"depth_raw_{uid}_{filename_prefix}.png"
        raw_path = os.path.join(settings.UPLOAD_DIR, raw_fname)
        Image.fromarray(depth_u8).save(raw_path, "PNG")
        
        return f"/api/uploads/{color_fname}", f"/api/uploads/{raw_fname}"
    
    def save_texture(
        self,
        pil_img: Image.Image,
        filename_prefix: str,
        size: int = 1024
    ) -> str:
        """Resize and save the original RGB image as a texture for 3D rendering."""
        uid = uuid.uuid4().hex[:10]
        tex_fname = f"texture_{uid}_{filename_prefix}.jpg"
        tex_path = os.path.join(settings.UPLOAD_DIR, tex_fname)
        
        tex_img = pil_img.resize((size, size), Image.Resampling.LANCZOS)
        tex_img.save(tex_path, "JPEG", quality=92)
        
        return f"/api/uploads/{tex_fname}"


# Singleton
depth_estimation_service = DepthEstimationService()
