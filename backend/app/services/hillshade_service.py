import os
import uuid
import math
import numpy as np
from PIL import Image
from typing import Dict, Any, Tuple, Optional

from app.config import settings

class HillshadeService:
    """
    Computes analytical Hillshade (shaded relief) using Horn's algorithm:
    Hillshade = 255 * ( (cos(Zenith) * cos(Slope)) + (sin(Zenith) * sin(Slope) * cos(Azimuth - Aspect)) )
    """

    @staticmethod
    def compute_hillshade(
        elevation_grid: np.ndarray,
        cell_size_x_m: float,
        cell_size_y_m: float,
        azimuth_deg: float = 315.0,
        altitude_deg: float = 45.0,
        z_factor: float = 1.0
    ) -> np.ndarray:
        """
        Calculate 0-255 hillshade illumination array.
        azimuth_deg: Sun direction (0-360°, default 315° NW)
        altitude_deg: Sun angle above horizon (0-90°, default 45°)
        """
        # Convert illumination angles to radians
        zenith_rad = math.radians(90.0 - altitude_deg)
        azimuth_rad = math.radians(360.0 - azimuth_deg + 90.0)

        # Gradients in meters
        dz_dx = np.gradient(elevation_grid, cell_size_x_m, axis=1) * z_factor
        dz_dy = -np.gradient(elevation_grid, cell_size_y_m, axis=0) * z_factor

        # Slope & Aspect in radians
        slope_rad = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
        aspect_rad = np.arctan2(dz_dy, -dz_dx)
        aspect_rad = np.where(aspect_rad < 0, aspect_rad + 2 * np.pi, aspect_rad)

        # Hillshade equation
        shaded = (
            (np.cos(zenith_rad) * np.cos(slope_rad)) +
            (np.sin(zenith_rad) * np.sin(slope_rad) * np.cos(azimuth_rad - aspect_rad))
        )
        shaded = np.clip(shaded, 0.0, 1.0)
        hillshade_u8 = (shaded * 255.0).astype(np.uint8)
        return hillshade_u8

    @staticmethod
    def generate_hillshade_texture(
        elevation_grid: np.ndarray,
        cell_size_x_m: float,
        cell_size_y_m: float,
        azimuth_deg: float = 315.0,
        altitude_deg: float = 45.0,
        intensity: float = 1.0
    ) -> str:
        """Generates PNG texture of the hillshade relief with controllable relief intensity."""
        hs_arr = HillshadeService.compute_hillshade(
            elevation_grid, cell_size_x_m, cell_size_y_m, azimuth_deg, altitude_deg, z_factor=intensity
        )
        img = Image.fromarray(hs_arr, mode='L')
        fname = f"hillshade_{uuid.uuid4().hex[:10]}.png"
        fpath = os.path.join(settings.UPLOAD_DIR, fname)
        img.save(fpath, "PNG")
        return f"/api/uploads/{fname}"

hillshade_service = HillshadeService()
