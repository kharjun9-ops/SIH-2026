import math
import numpy as np
from typing import Tuple, Dict, Any

from app.utils.geo_utils import compass_bearing_to_cardinal

class SlopeAspectService:
    """Computes slope gradients and compass aspect from authentic DEM elevation arrays using Horn's method."""

    @staticmethod
    def calculate_slope_and_aspect(
        elevation_grid: np.ndarray, 
        cell_size_x_m: float, 
        cell_size_y_m: float
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Horn's formula for slope (degrees) and aspect (degrees 0-360, 0=N, 90=E).
        """
        dz_dx = np.gradient(elevation_grid, cell_size_x_m, axis=1)
        dz_dy = -np.gradient(elevation_grid, cell_size_y_m, axis=0)

        gradient_mag = np.sqrt(dz_dx**2 + dz_dy**2)
        slope_deg = np.degrees(np.arctan(gradient_mag))

        aspect_rad = np.arctan2(dz_dy, -dz_dx)
        aspect_deg = 90.0 - np.degrees(aspect_rad)
        aspect_deg = np.where(aspect_deg < 0.0, aspect_deg + 360.0, aspect_deg)
        aspect_deg = np.where(aspect_deg >= 360.0, aspect_deg - 360.0, aspect_deg)
        aspect_deg = np.where(slope_deg < 0.1, 0.0, aspect_deg)

        return np.round(slope_deg, 2), np.round(aspect_deg, 2)

    @staticmethod
    def classify_slope_distribution(slope_grid: np.ndarray) -> Dict[str, float]:
        """Classify terrain slope into 5 standard geotechnical bins."""
        total = slope_grid.size
        gentle = float(np.sum(slope_grid < 5.0) / total * 100.0)
        moderate = float(np.sum((slope_grid >= 5.0) & (slope_grid < 15.0)) / total * 100.0)
        steep = float(np.sum((slope_grid >= 15.0) & (slope_grid < 30.0)) / total * 100.0)
        very_steep = float(np.sum((slope_grid >= 30.0) & (slope_grid < 45.0)) / total * 100.0)
        cliff = float(np.sum(slope_grid >= 45.0) / total * 100.0)

        return {
            "gentle_0_5_deg_pct": round(gentle, 1),
            "moderate_5_15_deg_pct": round(moderate, 1),
            "steep_15_30_deg_pct": round(steep, 1),
            "very_steep_30_45_deg_pct": round(very_steep, 1),
            "cliff_over_45_deg_pct": round(cliff, 1),
        }

slope_aspect_service = SlopeAspectService()
