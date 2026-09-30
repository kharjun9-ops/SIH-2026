import os
import glob
import numpy as np
from typing import Dict, Any, Tuple, Optional
from scipy.ndimage import zoom
import rasterio
from rasterio.windows import from_bounds

from app.config import settings
from app.providers.base_provider import ElevationProvider

class LocalDEMProvider(ElevationProvider):
    """
    Authoritative Local GeoTIFF Elevation Provider.
    Reads high-precision local rasters from data/dem/.
    """

    def __init__(self, dem_dir: str = settings.DEM_DIR):
        self.dem_dir = dem_dir
        self.files_cache = []
        self._scan_files()

    def _scan_files(self):
        if os.path.exists(self.dem_dir):
            self.files_cache = glob.glob(os.path.join(self.dem_dir, "*.tif")) + glob.glob(os.path.join(self.dem_dir, "*.tiff"))

    def get_source_name(self) -> str:
        return "Authoritative Local GeoTIFF DEM"

    def get_resolution(self) -> str:
        return "High-Resolution Raster Grid"

    def get_vertical_datum(self) -> str:
        return "EGM96 / Orthometric Height (Meters)"

    def get_elevation_type(self) -> str:
        return "Bare-Earth DTM (Local Survey)"

    def is_available(self, bounds: Dict[str, float]) -> bool:
        self._scan_files()
        mid_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
        mid_lon = (bounds["min_lon"] + bounds["max_lon"]) / 2.0
        return self._find_matching_geotiff(mid_lat, mid_lon) is not None

    def _find_matching_geotiff(self, lat: float, lon: float) -> Optional[str]:
        self._scan_files()
        for tif_path in self.files_cache:
            try:
                with rasterio.open(tif_path) as src:
                    b = src.bounds
                    if b.bottom <= lat <= b.top and b.left <= lon <= b.right:
                        return tif_path
            except Exception:
                continue
        return None

    def get_elevation(self, lat: float, lon: float) -> Optional[float]:
        tif_path = self._find_matching_geotiff(lat, lon)
        if not tif_path:
            return None
        try:
            with rasterio.open(tif_path) as src:
                row, col = src.index(lon, lat)
                data = src.read(1)
                if 0 <= row < data.shape[0] and 0 <= col < data.shape[1]:
                    val = float(data[row, col])
                    if val != src.nodata and not np.isnan(val) and val > -500:
                        return round(val, 2)
        except Exception:
            return None
        return None

    def get_elevation_grid(self, bounds: Dict[str, float], resolution: int = 128) -> Optional[Tuple[np.ndarray, Dict[str, Any]]]:
        mid_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
        mid_lon = (bounds["min_lon"] + bounds["max_lon"]) / 2.0

        tif_path = self._find_matching_geotiff(mid_lat, mid_lon)
        if not tif_path:
            return None

        try:
            with rasterio.open(tif_path) as src:
                window = from_bounds(bounds["min_lon"], bounds["min_lat"], bounds["max_lon"], bounds["max_lat"], src.transform)
                data = src.read(1, window=window, boundless=True, fill_value=src.nodata or -9999.0)

                nodata = src.nodata if src.nodata is not None else -9999.0
                mask = (data == nodata) | np.isnan(data) | (data < -500.0)
                if np.all(mask):
                    return None

                if np.any(mask):
                    valid_mean = np.mean(data[~mask])
                    data[mask] = valid_mean

                if data.shape[0] != resolution or data.shape[1] != resolution:
                    zoom_factors = (resolution / data.shape[0], resolution / data.shape[1])
                    data = zoom(data, zoom_factors, order=1)

                fname = os.path.basename(tif_path)
                is_demo_preset = fname in [
                    "mount_fuji.tif", "grand_canyon.tif", "mount_everest.tif", "nandi_hills.tif", "western_ghats.tif"
                ]

                meta = {
                    "source": f"Synthetic Demo GeoTIFF ({fname})" if is_demo_preset else f"Authoritative Local GeoTIFF ({fname})",
                    "data_status": "SYNTHETIC DEMO DATA" if is_demo_preset else "REAL DATA",
                    "dataset_category": "DEMO / Synthetic DTM" if is_demo_preset else "Bare-Earth DTM (Local Survey)",
                    "native_resolution": "256x256 Raster Matrix",
                    "horizontal_resolution": self.get_resolution(),
                    "source_crs": "EPSG:4326 (WGS84 Lat/Lon)",
                    "projected_crs": "Local Transverse Equirectangular Metric Plane",
                    "vertical_datum": self.get_vertical_datum(),
                    "source_vertical_datum": "EGM96 / Synthetic Geoid",
                    "output_vertical_datum": "Meters above Base",
                    "elevation_type": "Synthetic Model" if is_demo_preset else "Bare-Earth DTM",
                    "vertical_accuracy": "Mathematical Model (Synthetic)" if is_demo_preset else "Calibrated Survey Precision",
                    "data_voids": int(np.sum(mask)),
                    "interpolation_method": "Bilinear Resampling",
                    "resolution_transparency_note": "DEMO MODE: Synthetic geomorphology used for offline exploration." if is_demo_preset else "Resampled from local survey raster."
                }
                return data.astype(np.float32), meta
        except Exception as e:
            print(f"[LocalDEMProvider] Error: {e}")
            return None
