import os
import uuid
import numpy as np
from typing import Dict, Any, Tuple, Optional, List

from app.config import settings
from app.providers.lidar_provider import LiDARProvider, LIDAR_DATA_DIR

class LiDARService:
    """Processes LiDAR LAS/LAZ files, manages ground classifications, and generates bare-earth DTMs."""

    def __init__(self):
        self.provider = LiDARProvider()

    def process_uploaded_las(self, file_bytes: bytes, filename: str, mode: str = "dtm", resolution: int = 128) -> Dict[str, Any]:
        """Save uploaded LAS/LAZ file, extract header info, points, and rasterize DTM."""
        uid = uuid.uuid4().hex[:8]
        safe_name = f"lidar_{uid}_{filename}"
        save_path = os.path.join(LIDAR_DATA_DIR, safe_name)

        with open(save_path, "wb") as f:
            f.write(file_bytes)

        import laspy
        las = laspy.read(save_path)

        point_count = len(las.x)
        x_pts = np.array(las.x, dtype=np.float64)
        y_pts = np.array(las.y, dtype=np.float64)
        z_pts = np.array(las.z, dtype=np.float64)
        classes = getattr(las, 'classification', None)
        if classes is not None:
            classes = np.array(classes)

        # Rasterize
        grid_z, meta = self.provider.rasterize_point_cloud(
            x_pts, y_pts, z_pts, classifications=classes, resolution=resolution, mode=mode
        )

        min_x, max_x = float(np.min(x_pts)), float(np.max(x_pts))
        min_y, max_y = float(np.min(y_pts)), float(np.max(y_pts))
        min_z, max_z = float(np.min(z_pts)), float(np.max(z_pts))

        # Sample 5,000 points for 3D browser point-cloud visualization
        sample_step = max(1, point_count // 5000)
        sample_cloud = []
        for i in range(0, point_count, sample_step):
            sample_cloud.append([
                round(float(x_pts[i]), 2),
                round(float(z_pts[i]), 2),
                round(float(-y_pts[i]), 2)
            ])

        return {
            "status": "success",
            "file_name": filename,
            "saved_file": safe_name,
            "point_count": point_count,
            "point_density_sq_m": float(meta.get("point_density_sq_m", 0.0)),
            "point_spacing_m": float(meta.get("point_spacing_m", 1.0)),
            "has_ground_classification": bool(meta.get("has_ground_classification", False)),
            "accuracy_statement": str(meta.get("accuracy_statement", "Source accuracy specification unavailable; reported values are derived from the uploaded LiDAR dataset.")),
            "bounds": {
                "min_lat": min_y,
                "max_lat": max_y,
                "min_lon": min_x,
                "max_lon": max_x,
            },
            "elevation_stats": {
                "min_z": round(min_z, 2),
                "max_z": round(max_z, 2),
                "range_z": round(max_z - min_z, 2)
            },
            "elevation_grid": grid_z.tolist(),
            "metadata": meta,
            "point_cloud_sample": sample_cloud[:5000]
        }

lidar_service = LiDARService()
