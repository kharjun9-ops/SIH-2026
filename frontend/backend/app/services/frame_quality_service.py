"""
Frame Quality Assessment and Video Demuxing Service
===================================================
Filters and verifies real camera frames and video captures for 3D reconstruction:
- Rejects heavily blurred frames via Laplacian variance.
- Rejects underexposed (dark) or overexposed (blown-out) frames.
- Rejects redundant frames with near-zero baseline parallax (near-identical frames).
- Extracts and samples frames from video uploads (MP4, MOV, WEBM, etc.).
- Computes real frame quality indicators.
"""

import os
import tempfile
import logging
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional, Union
import numpy as np
import cv2

logger = logging.getLogger(__name__)


@dataclass
class FrameQualityResult:
    is_accepted: bool
    blur_score: float
    is_blurred: bool
    exposure_score: float
    exposure_status: str           # "optimal", "underexposed", "overexposed"
    overlap_ratio: float           # Estimated visual overlap with previous frame (0.0 to 1.0)
    rejection_reason: Optional[str] = None


class FrameQualityService:
    """Evaluates individual frames and extracts quality keyframes from video streams."""

    def __init__(
        self,
        blur_threshold: float = 45.0,
        min_luminance: float = 25.0,
        max_luminance: float = 235.0,
        min_overlap: float = 0.35,
        max_overlap: float = 0.95
    ):
        self.blur_threshold = blur_threshold
        self.min_luminance = min_luminance
        self.max_luminance = max_luminance
        self.min_overlap = min_overlap
        self.max_overlap = max_overlap

    def compute_blur_score(self, img_gray: np.ndarray) -> float:
        """
        Computes sharpness using the variance of the Laplacian:
        sigma^2(Laplacian(I)). High variance indicates sharp edges; low indicates blur.
        """
        if img_gray.size == 0:
            return 0.0
        lap = cv2.Laplacian(img_gray, cv2.CV_64F)
        score = float(lap.var())
        return round(score, 2)

    def compute_exposure_status(self, img_gray: np.ndarray) -> Tuple[float, str]:
        """
        Computes mean luminance and determines if the frame is under/overexposed.
        """
        if img_gray.size == 0:
            return 0.0, "underexposed"
        mean_lum = float(np.mean(img_gray))
        norm_score = round(mean_lum / 255.0, 3)

        if mean_lum < self.min_luminance:
            return norm_score, "underexposed"
        elif mean_lum > self.max_luminance:
            return norm_score, "overexposed"
        else:
            return norm_score, "optimal"

    def estimate_overlap_ratio(self, prev_gray: np.ndarray, curr_gray: np.ndarray) -> float:
        """
        Estimates visual overlap between two sequential frames using template correlation
        and structural difference. Returns a float between 0.0 and 1.0.
        """
        if prev_gray is None or curr_gray is None:
            return 1.0

        # Downsample for fast correlation
        h, w = curr_gray.shape[:2]
        small_prev = cv2.resize(prev_gray, (160, 120), interpolation=cv2.INTER_AREA)
        small_curr = cv2.resize(curr_gray, (160, 120), interpolation=cv2.INTER_AREA)

        # Match template over central region
        margin_y = 15
        margin_x = 20
        crop = small_prev[margin_y:120 - margin_y, margin_x:160 - margin_x]
        res = cv2.matchTemplate(small_curr, crop, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, _ = cv2.minMaxLoc(res)

        # High correlation indicates high visual overlap
        overlap = max(0.0, min(1.0, float(max_val)))
        return round(overlap, 3)

    def assess_frame(
        self,
        img_bgr: np.ndarray,
        prev_bgr: Optional[np.ndarray] = None
    ) -> FrameQualityResult:
        """
        Runs quality checks on a single frame.
        """
        if img_bgr is None or img_bgr.size == 0:
            return FrameQualityResult(
                is_accepted=False,
                blur_score=0.0,
                is_blurred=True,
                exposure_score=0.0,
                exposure_status="underexposed",
                overlap_ratio=0.0,
                rejection_reason="Corrupted or empty image frame"
            )

        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if len(img_bgr.shape) == 3 else img_bgr
        prev_gray = None
        if prev_bgr is not None:
            prev_gray = cv2.cvtColor(prev_bgr, cv2.COLOR_BGR2GRAY) if len(prev_bgr.shape) == 3 else prev_bgr

        # 1. Blur Check
        blur_score = self.compute_blur_score(gray)
        is_blurred = blur_score < self.blur_threshold

        # 2. Exposure Check
        exposure_score, exposure_status = self.compute_exposure_status(gray)

        # 3. Overlap Check with previous frame
        overlap = self.estimate_overlap_ratio(prev_gray, gray) if prev_gray is not None else 0.75

        # Decision Logic
        if is_blurred:
            return FrameQualityResult(
                is_accepted=False,
                blur_score=blur_score,
                is_blurred=True,
                exposure_score=exposure_score,
                exposure_status=exposure_status,
                overlap_ratio=overlap,
                rejection_reason=f"Motion blur detected (Laplacian score {blur_score:.1f} < threshold {self.blur_threshold})"
            )

        if exposure_status != "optimal":
            return FrameQualityResult(
                is_accepted=False,
                blur_score=blur_score,
                is_blurred=False,
                exposure_score=exposure_score,
                exposure_status=exposure_status,
                overlap_ratio=overlap,
                rejection_reason=f"Frame is {exposure_status} (Mean luminance: {exposure_score * 255:.1f})"
            )

        if prev_gray is not None and overlap > self.max_overlap:
            return FrameQualityResult(
                is_accepted=False,
                blur_score=blur_score,
                is_blurred=False,
                exposure_score=exposure_score,
                exposure_status=exposure_status,
                overlap_ratio=overlap,
                rejection_reason=f"Near-duplicate frame with zero camera motion (Overlap {overlap*100:.1f}%)"
            )

        if prev_gray is not None and overlap < self.min_overlap:
            # Camera moved too rapidly, but keep if no alternative
            logger.warning(f"Low overlap between sequential frames: {overlap*100:.1f}%")

        return FrameQualityResult(
            is_accepted=True,
            blur_score=blur_score,
            is_blurred=False,
            exposure_score=exposure_score,
            exposure_status=exposure_status,
            overlap_ratio=overlap,
            rejection_reason=None
        )

    def extract_from_video(
        self,
        video_input: Union[bytes, str],
        target_fps: float = 2.0,
        max_frames: int = 80
    ) -> Tuple[List[np.ndarray], Dict[str, Any]]:
        """
        Decodes a video file or byte buffer into quality-checked RGB frames for SfM.
        """
        temp_path = None
        if isinstance(video_input, bytes):
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
                f.write(video_input)
                temp_path = f.name
            video_path = temp_path
        else:
            video_path = video_input

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            raise ValueError(f"Could not open video source at {video_path}")

        video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        step = max(1, int(round(video_fps / max(0.5, target_fps))))

        accepted_frames_rgb: List[np.ndarray] = []
        blur_rejected = 0
        exposure_rejected = 0
        duplicate_rejected = 0
        frame_idx = 0
        prev_bgr: Optional[np.ndarray] = None

        while True:
            ret, bgr = cap.read()
            if not ret or bgr is None:
                break

            if frame_idx % step == 0:
                # Resize if high resolution (e.g. 4K to 1280px width) for SfM speed
                h, w = bgr.shape[:2]
                if w > 1280:
                    scale = 1280.0 / w
                    bgr = cv2.resize(bgr, (1280, int(h * scale)), interpolation=cv2.INTER_AREA)

                quality = self.assess_frame(bgr, prev_bgr)
                if quality.is_accepted:
                    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                    accepted_frames_rgb.append(rgb)
                    prev_bgr = bgr

                    if len(accepted_frames_rgb) >= max_frames:
                        break
                else:
                    if quality.is_blurred:
                        blur_rejected += 1
                    elif quality.exposure_status != "optimal":
                        exposure_rejected += 1
                    elif quality.overlap_ratio > self.max_overlap:
                        duplicate_rejected += 1

            frame_idx += 1

        cap.release()
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

        stats = {
            "total_video_frames": total_frames,
            "processed_samples": frame_idx // step,
            "accepted_frames": len(accepted_frames_rgb),
            "rejected_blur": blur_rejected,
            "rejected_exposure": exposure_rejected,
            "rejected_duplicates": duplicate_rejected,
            "sampling_step": step,
            "video_fps": round(video_fps, 1)
        }

        return accepted_frames_rgb, stats


frame_quality_service = FrameQualityService()
