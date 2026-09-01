import os
import glob
import math
import numpy as np
from typing import Dict, Any, Tuple, Optional, List
from scipy.interpolate import griddata
from scipy.ndimage import zoom

from app.config import settings
from app.providers.base_provider import ElevationProvider

LIDAR_DATA_DIR = os.path.join(settings.DATA_DIR, "lidar")
os.makedirs(LIDAR_DATA_DIR, exist_ok=True)

class LiDARProvider(ElevationProvider):
    """
    Authoritative Airborne / Terrestrial LiDAR Point Cloud & DTM Provider.
    Parses LAS / LAZ / GeoTIFF high-resolution point clouds and rasterizes bare-earth DTMs.
    """

    def __init__(self, lidar_dir: str = LIDAR_DATA_DIR):
        self.lidar_dir = lidar_dir
        self.files_cache = []
        self._scan_files()

    def _scan_files(self):
        if os.path.exists(self.lidar_dir):
            self.files_cache = (
                glob.glob(os.path.join(self.lidar_dir, "*.las")) +
                glob.glob(os.path.join(self.lidar_dir, "*.laz")) +
                glob.glob(os.path.join(self.lidar_dir, "*.tif"))
            )

    def get_source_name(self) -> str:
        return "Airborne LiDAR Survey (High Precision Point Cloud)"

    def get_resolution(self) -> str:
        return "0.5m – 1.0m (High-Density LiDAR)"

    def get_vertical_datum(self) -> str:
        return "NAVD88 / EGM96 Orthometric (Meters)"

    def get_elevation_type(self) -> str:
        return "Bare-Earth DTM (Class 2 Ground Filtered)"

    def is_available(self, bounds: Dict[str, float]) -> bool:
        self._scan_files()
        # Returns True if any LiDAR dataset covers the requested bounds
        for fpath in self.files_cache:
            if fpath.endswith(('.las', '.laz')):
                meta = self.get_las_metadata(fpath)
                if meta and "bounds" in meta:
                    b = meta["bounds"]
                    if (b["min_lat"] <= bounds["max_lat"] and b["max_lat"] >= bounds["min_lat"] and
                        b["min_lon"] <= bounds["max_lon"] and b["max_lon"] >= bounds["min_lon"]):
                        return True
        return False

    @staticmethod
    def get_las_metadata(file_path: str) -> Optional[Dict[str, Any]]:
        """Extract metadata from LAS/LAZ point cloud file."""
        try:
            import laspy
            with laspy.open(file_path) as fh:
                hdr = fh.header
                return {
                    "file_name": os.path.basename(file_path),
                    "point_count": hdr.point_count,
                    "min_x": hdr.mins[0],
                    "max_x": hdr.maxs[0],
                    "min_y": hdr.mins[1],
                    "max_y": hdr.maxs[1],
                    "min_z": hdr.mins[2],
                    "max_z": hdr.maxs[2],
                    "scales": list(hdr.scales),
                    "offsets": list(hdr.offsets),
                    "bounds": {
                        "min_lat": hdr.mins[1],
                        "max_lat": hdr.maxs[1],
                        "min_lon": hdr.mins[0],
                        "max_lon": hdr.maxs[0],
                    }
                }
        except Exception as e:
            print(f"[LiDARProvider] Metadata extraction error for {file_path}: {e}")
            return None

    def rasterize_point_cloud(
        self, 
        x_coords: np.ndarray, 
        y_coords: np.ndarray, 
        z_coords: np.ndarray, 
        classifications: Optional[np.ndarray] = None,
        resolution: int = 128,
        mode: str = "dtm"
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Rasterize unstructured LiDAR point cloud into a regular metric elevation grid.
        mode: 'dtm' (Bare-Earth ground points ASPRS Class 2) or 'dsm' (Surface including canopy/buildings).
        """
        # Ground classification filter for DTM
        if mode == "dtm" and classifications is not None:
            # ASPRS standard: 2 = Ground
            ground_mask = (classifications == 2)
            if np.sum(ground_mask) > 100:
                x_coords = x_coords[ground_mask]
                y_coords = y_coords[ground_mask]
                z_coords = z_coords[ground_mask]

        min_x, max_x = np.min(x_coords), np.max(x_coords)
        min_y, max_y = np.min(y_coords), np.max(y_coords)

        # Target grid points
        grid_x, grid_y = np.mgrid[min_x:max_x:complex(0, resolution), max_y:min_y:complex(0, resolution)]

        # 2D Linear grid interpolation
        points = np.column_stack((x_coords, y_coords))
        grid_z = griddata(points, z_coords, (grid_x, grid_y), method='linear')

        # Nearest neighbor for any boundary NaN holes
        if np.isnan(grid_z).any():
            nan_mask = np.isnan(grid_z)
            grid_z_near = griddata(points, z_coords, (grid_x, grid_y), method='nearest')
            grid_z[nan_mask] = grid_z_near[nan_mask]

        # Compute real covered area in meters
        if (max_x - min_x) < 5.0:  # Geographic coordinates (degrees)
            mid_lat = float((min_y + max_y) / 2.0)
            dx_m = max(1.0, float((max_x - min_x) * 111320.0 * math.cos(math.radians(mid_lat))))
            dy_m = max(1.0, float((max_y - min_y) * 111320.0))
        else:  # Projected metric coordinates (meters)
            dx_m = max(1.0, float(max_x - min_x))
            dy_m = max(1.0, float(max_y - min_y))

        area_sq_m = max(1.0, dx_m * dy_m)
        point_count = len(z_coords)
        point_density = point_count / area_sq_m
        est_spacing_m = math.sqrt(1.0 / max(1e-6, point_density))
        has_ground_class = (classifications is not None) and bool(np.any(classifications == 2))

        accuracy_stmt = "Source accuracy specification unavailable; reported values are derived from the uploaded LiDAR dataset."

        meta = {
            "source": self.get_source_name(),
            "data_status": "REAL DATA",
            "dataset_category": "DTM (Bare-Earth)" if mode == "dtm" else "DSM (Surface)",
            "native_resolution": f"{est_spacing_m:.2f}m (Point Spacing)",
            "horizontal_resolution": self.get_resolution(),
            "source_crs": "Projected UTM / WGS84",
            "projected_crs": "Local Metric Coordinate Space (Meters)",
            "vertical_datum": self.get_vertical_datum(),
            "source_vertical_datum": "NAVD88 / EGM96 Orthometric",
            "output_vertical_datum": "Orthometric Meters above Geoid",
            "elevation_type": "Bare-Earth DTM (Class 2 Ground Filtered)" if mode == "dtm" else "Digital Surface Model (DSM)",
            "vertical_accuracy": "Survey Grade (Accuracy depends on source LiDAR survey specifications and sensor calibration)",
            "point_count": point_count,
            "covered_area_sq_m": round(area_sq_m, 2),
            "point_density_sq_m": round(point_density, 4),
            "point_spacing_m": round(est_spacing_m, 3),
            "has_ground_classification": bool(has_ground_class),
            "accuracy_statement": accuracy_stmt,
            "interpolation_method": "TIN / Delaunay Linear Triangulation Resampling",
            "resolution_transparency_note": f"Rasterized at {resolution}x{resolution} grid spacing from {point_count:,} LiDAR pulses."
        }
        return grid_z.astype(np.float32).T, meta

    def get_elevation(self, lat: float, lon: float) -> Optional[Tuple[float, int]]:
        """Query precise LiDAR elevation at a single coordinate from point cloud with IDW interpolation."""
        self._scan_files()
        for fpath in self.files_cache:
            if fpath.endswith(('.las', '.laz')):
                try:
                    import laspy
                    with laspy.open(fpath) as fh:
                        hdr = fh.header
                        if not (hdr.mins[1] <= lat <= hdr.maxs[1] and hdr.mins[0] <= lon <= hdr.maxs[0]):
                            continue
                    las = laspy.read(fpath)
                    # Search within ~50m radius
                    dlat = 50.0 / 111320.0
                    dlon = 50.0 / (111320.0 * max(0.1, math.cos(math.radians(lat))))
                    mask = (
                        (las.x >= lon - dlon) & (las.x <= lon + dlon) &
                        (las.y >= lat - dlat) & (las.y <= lat + dlat)
                    )
                    if np.sum(mask) == 0:
                        continue

                    xs = np.array(las.x)[mask]
                    ys = np.array(las.y)[mask]
                    zs = np.array(las.z)[mask]

                    # Filter ground if available
                    class_arr = getattr(las, 'classification', None)
                    if class_arr is not None:
                        cl = np.array(class_arr)[mask]
                        if np.any(cl == 2):
                            g_mask = (cl == 2)
                            xs, ys, zs = xs[g_mask], ys[g_mask], zs[g_mask]

                    # Metric distances
                    dx_m = (xs - lon) * (111320.0 * math.cos(math.radians(lat)))
                    dy_m = (ys - lat) * 111320.0
                    dists = np.sqrt(dx_m**2 + dy_m**2)

                    weights = 1.0 / np.maximum(0.2, dists**2)
                    weighted_z = float(np.sum(weights * zs) / np.sum(weights))
                    return float(round(weighted_z, 2)), len(zs)
                except Exception as e:
                    print(f"[LiDARProvider] Point lookup error in {fpath}: {e}")
                    continue
        return None

    def get_elevation_grid(self, bounds: Dict[str, float], resolution: int = 128) -> Optional[Tuple[np.ndarray, Dict[str, Any]]]:
        self._scan_files()
        for fpath in self.files_cache:
            if fpath.endswith(('.las', '.laz')):
                try:
                    import laspy
                    las = laspy.read(fpath)
                    # Filter points within bounds
                    mask = (
                        (las.x >= bounds["min_lon"]) & (las.x <= bounds["max_lon"]) &
                        (las.y >= bounds["min_lat"]) & (las.y <= bounds["max_lat"])
                    )
                    if np.sum(mask) > 100:
                        class_arr = getattr(las, 'classification', None)
                        if class_arr is not None:
                            class_arr = np.array(class_arr)[mask]
                        return self.rasterize_point_cloud(
                            np.array(las.x)[mask],
                            np.array(las.y)[mask],
                            np.array(las.z)[mask],
                            classifications=class_arr,
                            resolution=resolution,
                            mode="dtm"
                        )
                except Exception as e:
                    print(f"[LiDARProvider] Failed reading {fpath}: {e}")
                    continue
        return None
