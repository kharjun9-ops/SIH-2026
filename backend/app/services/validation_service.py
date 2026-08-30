import math
import random
import numpy as np
from typing import Dict, Any, List, Tuple

from app.providers.elevation_manager import elevation_manager

class ValidationService:
    """
    Performs rigorous statistical accuracy validation comparing the generated 3D mesh
    against the underlying authoritative source DEM/LiDAR data across N sampled points.
    """

    @staticmethod
    def run_statistical_validation(
        elevation_grid: np.ndarray,
        bounds: Dict[str, float],
        sample_count: int = 100,
        source_name: str = "SRTM GL1 30m"
    ) -> Dict[str, Any]:
        """
        Samples N random coordinates, checks mesh interpolated elevation vs source DEM lookup,
        and computes MAE, RMSE, Max Error, Min Error, and Mean Bias.
        """
        rows, cols = elevation_grid.shape
        min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
        min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]

        random.seed(42)  # Deterministic seed for reproducible evaluation
        sample_points = []
        errors = []
        signed_errors = []

        for _ in range(sample_count):
            r_frac = random.uniform(0.05, 0.95) * (rows - 1)
            c_frac = random.uniform(0.05, 0.95) * (cols - 1)

            lat = max_lat - (r_frac / (rows - 1)) * (max_lat - min_lat)
            lon = min_lon + (c_frac / (cols - 1)) * (max_lon - min_lon)

            # Bilinear interpolation on mesh grid
            r0 = int(math.floor(r_frac))
            r1 = min(rows - 1, r0 + 1)
            c0 = int(math.floor(c_frac))
            c1 = min(cols - 1, c0 + 1)

            wr = r_frac - r0
            wc = c_frac - c0

            mesh_elev = float(
                elevation_grid[r0, c0] * (1 - wr) * (1 - wc) +
                elevation_grid[r0, c1] * (1 - wr) * wc +
                elevation_grid[r1, c0] * wr * (1 - wc) +
                elevation_grid[r1, c1] * wr * wc
            )

            # Query authoritative source
            raw_elev, _ = elevation_manager.get_point_elevation(lat, lon)
            diff = mesh_elev - raw_elev
            abs_diff = abs(diff)

            errors.append(abs_diff)
            signed_errors.append(diff)

            if len(sample_points) < 15:  # Keep 15 representative points for UI table
                sample_points.append({
                    "latitude": round(lat, 5),
                    "longitude": round(lon, 5),
                    "mesh_elevation_m": round(mesh_elev, 2),
                    "raw_dem_elevation_m": round(raw_elev, 2),
                    "error_m": round(abs_diff, 2),
                    "status": "Verified" if abs_diff <= 10.0 else "Deviation"
                })

        err_np = np.array(errors)
        signed_np = np.array(signed_errors)

        mae = float(np.mean(err_np))
        rmse = float(np.sqrt(np.mean(err_np ** 2)))
        max_err = float(np.max(err_np))
        min_err = float(np.min(err_np))
        mean_bias = float(np.mean(signed_np))

        return {
            "validation_type": "Mesh-to-Source DEM Preservation Validation",
            "source_dataset": source_name,
            "sample_count": sample_count,
            "mean_absolute_error_m": round(mae, 3),
            "root_mean_square_error_m": round(rmse, 3),
            "max_error_m": round(max_err, 3),
            "min_error_m": round(min_err, 3),
            "mean_bias_m": round(mean_bias, 3),
            "sample_points_table": sample_points,
            "fidelity_assessment": "Excellent Geometric Preservation (MAE < 1.0m)" if mae < 1.0 else "Standard Bilinear Resampling Fidelity",
            "accuracy_notice": "Validation measures fidelity of mesh reconstruction relative to the source DEM dataset. It does not replace on-the-ground geodetic survey validation."
        }

validation_service = ValidationService()
