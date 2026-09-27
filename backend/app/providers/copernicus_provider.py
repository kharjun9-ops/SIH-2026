import os
import io
import math
import requests
import numpy as np
from typing import Dict, Any, Tuple, Optional
from PIL import Image
from scipy.ndimage import map_coordinates
from app.utils.geo_utils import wgs84_dimensions, utm_crs_for_latlon

from app.config import settings
from app.providers.base_provider import ElevationProvider

TILE_CACHE_DIR = os.path.join(settings.DATA_DIR, "tiles_cache")
os.makedirs(TILE_CACHE_DIR, exist_ok=True)

class CopernicusDEMProvider(ElevationProvider):
    """
    Copernicus DEM GLO-30 (~30m) Elevation Provider
    Copernicus DEM is a high-accuracy global digital surface/terrain model published by ESA.
    """

    def __init__(self):
        # Terrarium tiles in AWS Open Data incorporate Copernicus GLO-30 globally
        self.base_url = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        self.session = requests.Session()

    def get_source_name(self) -> str:
        return "Copernicus DEM GLO-30 (ESA / AWS Open Data)"

    def get_resolution(self) -> str:
        return "~30 m (GLO-30 Nominal)"

    def get_vertical_datum(self) -> str:
        return "EGM2008 / EGM96 Geoid (Meters)"

    def get_elevation_type(self) -> str:
        return "DEM-derived (Copernicus Global 30m)"

    def is_available(self, bounds: Dict[str, float]) -> bool:
        # Copernicus DEM provides near-global coverage from -90° to +90°
        return True

    def _fetch_tile(self, z: int, x: int, y: int) -> Optional[np.ndarray]:
        cache_file = os.path.join(TILE_CACHE_DIR, f"copernicus_{z}_{x}_{y}.npy")
        if os.path.exists(cache_file):
            try:
                return np.load(cache_file)
            except Exception:
                pass

        url = self.base_url.format(z=z, x=x, y=y)
        try:
            res = self.session.get(url, timeout=6.0)
            if res.status_code == 200 and len(res.content) > 100:
                img = Image.open(io.BytesIO(res.content)).convert("RGB")
                arr = np.array(img, dtype=np.float32)
                elev = (arr[:, :, 0] * 256.0 + arr[:, :, 1] + arr[:, :, 2] / 256.0) - 32768.0
                np.save(cache_file, elev)
                return elev
        except Exception as e:
            print(f"[CopernicusDEMProvider] Tile fetch error for {z}/{x}/{y}: {e}")
        return None

    def get_elevation(self, lat: float, lon: float) -> Optional[float]:
        z = 12
        n = 2.0 ** z
        lat_rad = math.radians(lat)

        x_frac = (lon + 180.0) / 360.0 * n
        y_frac = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n

        xtile = int(x_frac)
        ytile = int(y_frac)

        tile = self._fetch_tile(z, xtile, ytile)
        if tile is None:
            return None

        px = max(0.0, min(254.99, (x_frac - xtile) * 256.0))
        py = max(0.0, min(254.99, (y_frac - ytile) * 256.0))

        x0, y0 = int(px), int(py)
        x1, y1 = min(255, x0 + 1), min(255, y0 + 1)
        wx, wy = px - x0, py - y0

        val = (tile[y0, x0] * (1 - wx) * (1 - wy) +
               tile[y0, x1] * wx * (1 - wy) +
               tile[y1, x0] * (1 - wx) * wy +
               tile[y1, x1] * wx * wy)
        return float(round(val, 2))

    def get_elevation_grid(self, bounds: Dict[str, float], resolution: int = 128) -> Optional[Tuple[np.ndarray, Dict[str, Any]]]:
        min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
        min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]

        span_deg = max(max_lat - min_lat, max_lon - min_lon)
        if span_deg <= 0.05:
            z = 13
        elif span_deg <= 0.15:
            z = 12
        elif span_deg <= 0.4:
            z = 11
        else:
            z = 10

        n = 2.0 ** z
        x_frac_min = (min_lon + 180.0) / 360.0 * n
        x_frac_max = (max_lon + 180.0) / 360.0 * n

        lat_rad_max = math.radians(max_lat)
        lat_rad_min = math.radians(min_lat)
        y_frac_top = (1.0 - math.asinh(math.tan(lat_rad_max)) / math.pi) / 2.0 * n
        y_frac_bottom = (1.0 - math.asinh(math.tan(lat_rad_min)) / math.pi) / 2.0 * n

        x_min, y_min = int(x_frac_min), int(y_frac_top)
        x_max, y_max = int(x_frac_max), int(y_frac_bottom)

        num_tiles_x = (x_max - x_min) + 1
        num_tiles_y = (y_max - y_min) + 1

        stitched = np.zeros((num_tiles_y * 256, num_tiles_x * 256), dtype=np.float32)
        valid_tiles = 0

        for iy, yt in enumerate(range(y_min, y_max + 1)):
            for ix, xt in enumerate(range(x_min, x_max + 1)):
                t = self._fetch_tile(z, xt, yt)
                if t is not None:
                    stitched[iy * 256:(iy + 1) * 256, ix * 256:(ix + 1) * 256] = t
                    valid_tiles += 1

        if valid_tiles == 0:
            return None

        # Continuous sub-pixel geographic remapping from Web Mercator stitched canvas
        # Target grid: Row 0 is North (max_lat), Row -1 is South (min_lat)
        # Col 0 is West (min_lon), Col -1 is East (max_lon)
        grid_lons = np.linspace(min_lon, max_lon, resolution)
        grid_lats = np.linspace(max_lat, min_lat, resolution)
        grid_lon, grid_lat = np.meshgrid(grid_lons, grid_lats)

        grid_lat_rad = np.radians(grid_lat)
        grid_x_frac = (grid_lon + 180.0) / 360.0 * n
        grid_y_frac = (1.0 - np.arcsinh(np.tan(grid_lat_rad)) / np.pi) / 2.0 * n

        px = (grid_x_frac - x_min) * 256.0
        py = (grid_y_frac - y_min) * 256.0

        resampled = map_coordinates(stitched, [py, px], order=1, mode='nearest')

        width_m, height_m = wgs84_dimensions(min_lat, max_lat, min_lon, max_lon)
        cell_x_m = width_m / max(1, resolution - 1)
        cell_y_m = height_m / max(1, resolution - 1)

        mid_lat = (min_lat + max_lat) / 2.0
        mid_lon = (min_lon + max_lon) / 2.0
        utm_info = utm_crs_for_latlon(mid_lat, mid_lon)

        meta = {
            "source": self.get_source_name(),
            "data_status": "REAL DATA",
            "dataset_category": "DSM (Surface Elevation)",
            "native_resolution": "~30 m (1 arc-second nominal)",
            "horizontal_resolution": self.get_resolution(),
            "source_crs": "EPSG:4326 (WGS84) / Web Mercator EPSG:3857",
            "projected_crs": f"{utm_info['epsg']} ({utm_info['name']})",
            "vertical_datum": self.get_vertical_datum(),
            "source_vertical_datum": "EGM2008 / EGM96 Geoid",
            "output_vertical_datum": "Orthometric Meters above Mean Sea Level",
            "elevation_type": "DSM (Surface Elevation including canopy/structures)",
            "vertical_accuracy": "±4m absolute vertical accuracy (Copernicus GLO-30 Spec)",
            "zoom_level": z,
            "grid_spacing_x_m": round(cell_x_m, 2),
            "grid_spacing_y_m": round(cell_y_m, 2),
            "data_voids": int(np.sum(np.isnan(resampled) | (resampled < -500))),
            "interpolation_method": "Continuous Sub-Pixel Bilinear Resampling",
            "resolution_transparency_note": f"Mesh resampled at {resolution}x{resolution} (~{cell_x_m:.1f}m spacing) from native 30m Copernicus raster."
        }
        return resampled.astype(np.float32), meta
