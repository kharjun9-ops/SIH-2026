import os
import io
import math
import uuid
import requests
import numpy as np
from typing import Dict, Any, Tuple, Optional, List
from PIL import Image

from app.config import settings
from app.providers.base_provider import ElevationProvider
from app.providers.srtm_provider import SRTMProvider
from app.providers.copernicus_provider import CopernicusDEMProvider
from app.providers.local_dem_provider import LocalDEMProvider
from app.providers.lidar_provider import LiDARProvider
from app.utils.geo_utils import (
    wgs84_meridional_radius, wgs84_prime_vertical_radius,
    utm_crs_for_latlon
)

def lat_lon_to_tile(lat: float, lon: float, zoom_level: int) -> Tuple[int, int]:
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom_level
    xtile = int((lon + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return xtile, ytile

def lat_lon_to_subtile(lat: float, lon: float, zoom_level: int) -> Tuple[float, float]:
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom_level
    xtile = (lon + 180.0) / 360.0 * n
    ytile = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
    return xtile, ytile

class SatelliteTextureProvider:
    """
    Fetches real satellite imagery tiles (Esri World Imagery) and stitches them to bounds
    with sub-pixel fractional cropping so texture bounds match DEM terrain bounds exactly.
    """

    def __init__(self):
        self.base_url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        self.osm_fallback_url = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "SIH26175-TerrainReconstruction/1.0 (GIS Research Platform)"
        })

    def generate_satellite_texture(self, bounds: Dict[str, float], target_size: int = 1024) -> Optional[str]:
        min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
        min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]

        span_deg = max(max_lat - min_lat, max_lon - min_lon)
        if span_deg <= 0.03:
            z = 15
        elif span_deg <= 0.08:
            z = 14
        elif span_deg <= 0.2:
            z = 13
        elif span_deg <= 0.5:
            z = 12
        else:
            z = 11

        x_left_sub, y_top_sub = lat_lon_to_subtile(max_lat, min_lon, z)
        x_right_sub, y_bottom_sub = lat_lon_to_subtile(min_lat, max_lon, z)

        x_min = int(math.floor(x_left_sub))
        x_max = int(math.floor(x_right_sub))
        y_min = int(math.floor(y_top_sub))
        y_max = int(math.floor(y_bottom_sub))

        num_tiles_x = min(8, max(1, (x_max - x_min) + 1))
        num_tiles_y = min(8, max(1, (y_max - y_min) + 1))

        stitched = Image.new("RGB", (num_tiles_x * 256, num_tiles_y * 256), color=(20, 30, 40))
        tiles_loaded = 0

        for iy, yt in enumerate(range(y_min, y_min + num_tiles_y)):
            for ix, xt in enumerate(range(x_min, x_min + num_tiles_x)):
                url = self.base_url.format(z=z, x=xt, y=yt)
                tile_loaded = False
                try:
                    res = self.session.get(url, timeout=4.0)
                    if res.status_code == 200 and len(res.content) > 500:
                        tile_img = Image.open(io.BytesIO(res.content)).convert("RGB")
                        stitched.paste(tile_img, (ix * 256, iy * 256))
                        tiles_loaded += 1
                        tile_loaded = True
                except Exception:
                    pass

                # Fallback to OSM tile if primary failed
                if not tile_loaded:
                    try:
                        fallback_url = self.osm_fallback_url.format(z=z, x=xt, y=yt)
                        res = self.session.get(fallback_url, timeout=3.0)
                        if res.status_code == 200 and len(res.content) > 500:
                            tile_img = Image.open(io.BytesIO(res.content)).convert("RGB")
                            stitched.paste(tile_img, (ix * 256, iy * 256))
                            tiles_loaded += 1
                    except Exception:
                        pass

        if tiles_loaded == 0:
            return None

        # Exact sub-pixel geographic crop within the stitched tile mosaic
        crop_left = max(0.0, (x_left_sub - x_min) * 256.0)
        crop_top = max(0.0, (y_top_sub - y_min) * 256.0)
        crop_right = min(float(stitched.width), (x_right_sub - x_min) * 256.0)
        crop_bottom = min(float(stitched.height), (y_bottom_sub - y_min) * 256.0)

        if crop_right > crop_left + 4 and crop_bottom > crop_top + 4:
            cropped = stitched.crop((int(crop_left), int(crop_top), int(crop_right), int(crop_bottom)))
        else:
            cropped = stitched

        resized = cropped.resize((target_size, target_size), Image.Resampling.LANCZOS)
        fname = f"sat_texture_{uuid.uuid4().hex[:10]}.jpg"
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        fpath = os.path.join(settings.UPLOAD_DIR, fname)
        resized.save(fpath, "JPEG", quality=90)
        return f"/api/uploads/{fname}"


class ElevationManager:
    """
    Automated Priority Cascade Elevation Manager.
    Automatically identifies and chooses the highest quality available source for any region.
    """

    def __init__(self):
        self.lidar_provider = LiDARProvider()
        self.local_provider = LocalDEMProvider()
        self.copernicus_provider = CopernicusDEMProvider()
        self.srtm_provider = SRTMProvider()
        self.satellite_provider = SatelliteTextureProvider()

    def get_elevation_grid(
        self,
        bounds: Dict[str, float],
        resolution: int = 128,
        provider_preference: str = "auto",
        sample_id: Optional[str] = None,
        data_mode: str = "real"
    ) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Authoritative Priority-Cascade Selection:
        In REAL DATA MODE:
          1. Airborne LiDAR Survey (LAS / LAZ DTM)
          2. Authoritative Local Survey GeoTIFF (Non-synthetic)
          3. Copernicus DEM GLO-30 (~30m DSM)
          4. SRTM GL1 30m (NASA/USGS)
        In DEMO MODE:
          - Allows synthetic sample GeoTIFF presets with explicit 'SYNTHETIC DEMO DATA' badge.
        """
        # 1. LiDAR Provider (Tier 1)
        if provider_preference in ["auto", "lidar"] and self.lidar_provider.is_available(bounds):
            res = self.lidar_provider.get_elevation_grid(bounds, resolution)
            if res is not None:
                res[1]["fallback_notice"] = "Active dataset: High-Resolution Airborne LiDAR Survey"
                return res

        # 2. Local Demo GeoTIFF (Only if DEMO MODE or Explicit Local Preference)
        if data_mode == "demo" and (sample_id or provider_preference == "local-geotiff") and self.local_provider.is_available(bounds):
            res = self.local_provider.get_elevation_grid(bounds, resolution)
            if res is not None:
                res[1]["fallback_notice"] = "Active dataset: Synthetic Geomorphology Model (Demo Mode)"
                return res

        # In REAL MODE: check if non-synthetic local GeoTIFF is available
        if data_mode == "real" and provider_preference in ["auto", "local-geotiff"] and self.local_provider.is_available(bounds):
            res = self.local_provider.get_elevation_grid(bounds, resolution)
            if res is not None and res[1].get("data_status") == "REAL DATA":
                res[1]["fallback_notice"] = "Active dataset: Authoritative Local GeoTIFF Survey"
                return res

        # 3. Copernicus DEM GLO-30 (Tier 2 Global Primary)
        if provider_preference in ["auto", "copernicus"]:
            res = self.copernicus_provider.get_elevation_grid(bounds, resolution)
            if res is not None:
                if provider_preference == "lidar":
                    res[1]["fallback_notice"] = "Airborne LiDAR unavailable for this region — fell back to Copernicus GLO-30 DEM (~30m DSM)."
                else:
                    res[1]["fallback_notice"] = "High-resolution LiDAR unavailable for this region — using Copernicus GLO-30 DEM (~30m DSM)."
                return res

        # 4. SRTM GL1 30m (Tier 3 Global Fallback)
        res = self.srtm_provider.get_elevation_grid(bounds, resolution)
        if res is not None:
            res[1]["fallback_notice"] = "Copernicus/LiDAR unavailable — fell back to SRTM ~30m DEM (NASA/USGS)."
            return res

        # If all providers fail in real mode, raise explicit exception
        if data_mode == "real":
            raise RuntimeError(
                f"Elevation data is unavailable for the requested bounding box "
                f"[{bounds.get('min_lat')}, {bounds.get('min_lon')}] to [{bounds.get('max_lat')}, {bounds.get('max_lon')}]. "
                "No LiDAR, Local GeoTIFF, Copernicus GLO-30, or SRTM GL1 coverage available."
            )

        # In demo mode, fallback flat DEM with explicit synthetic status
        flat = np.full((resolution, resolution), 500.0, dtype=np.float32)
        meta = {
            "source": "Synthetic Base Fallback (Demo Mode)",
            "data_status": "SYNTHETIC DEMO DATA",
            "dataset_category": "DEMO / Synthetic Array",
            "native_resolution": "~30 m",
            "horizontal_resolution": "~30 m",
            "source_crs": "EPSG:4326 (WGS84)",
            "projected_crs": "Local Metric Equirectangular Plane",
            "vertical_datum": "EGM96 (Meters)",
            "source_vertical_datum": "EGM96 Geoid / MSL",
            "output_vertical_datum": "Meters above Base",
            "elevation_type": "Synthetic Model",
            "vertical_accuracy": "Mathematical Constant (Demo)",
            "data_voids": 0,
            "interpolation_method": "Constant Base",
            "fallback_notice": "Real-time elevation unavailable. Loaded offline demo baseline.",
            "resolution_transparency_note": "Offline demo array for interface testing."
        }
        return flat, meta

    def get_point_elevation(self, lat: float, lon: float) -> Tuple[float, str]:
        """Query authoritative elevation at a single geographic coordinate with LiDAR priority."""
        # 1. LiDAR Provider (Tier 1 Priority)
        lidar_res = self.lidar_provider.get_elevation(lat, lon)
        if lidar_res is not None:
            return lidar_res[0], self.lidar_provider.get_source_name()

        # 2. Local Survey
        val = self.local_provider.get_elevation(lat, lon)
        if val is not None:
            return val, self.local_provider.get_source_name()

        # 3. Copernicus DEM GLO-30 (Tier 2 Global Primary)
        val = self.copernicus_provider.get_elevation(lat, lon)
        if val is not None:
            return val, self.copernicus_provider.get_source_name()

        # 4. SRTM GL1 30m
        val = self.srtm_provider.get_elevation(lat, lon)
        if val is not None:
            return val, self.srtm_provider.get_source_name()

        return 0.0, "Unavailable"

    def inspect_point(
        self,
        lat: float,
        lon: float,
        bounds: Optional[Dict[str, float]] = None,
        mesh_elevation_m: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        High-precision Authoritative Point Inspection Pipeline.
        Retrieves continuous source elevation, calculates physical metric slope and aspect,
        records vertical datum, native resolution, and cross-checks against mesh intersection Z.
        """
        elev = 0.0
        source = "Copernicus DEM GLO-30"
        source_type = "DSM (Digital Surface Model)"
        native_res = "~30 m (1 arc-second nominal)"
        vertical_datum = "EGM2008 / EGM96 Geoid (MSL)"
        sampling_method = "Continuous Bilinear Interpolation"
        contributing_pts = None

        # 1. LiDAR Check
        lidar_res = self.lidar_provider.get_elevation(lat, lon)
        if lidar_res is not None:
            elev = lidar_res[0]
            contributing_pts = lidar_res[1]
            source = self.lidar_provider.get_source_name()
            source_type = self.lidar_provider.get_elevation_type()
            native_res = self.lidar_provider.get_resolution()
            vertical_datum = self.lidar_provider.get_vertical_datum()
            sampling_method = "Inverse Distance Weighting (IDW) Point Sampling"
        else:
            # 2. Local GeoTIFF Check
            local_val = self.local_provider.get_elevation(lat, lon)
            if local_val is not None:
                elev = local_val
                source = self.local_provider.get_source_name()
                source_type = self.local_provider.get_elevation_type()
                native_res = self.local_provider.get_resolution()
                vertical_datum = self.local_provider.get_vertical_datum()
                sampling_method = "Local GeoTIFF Raster Lookup"
            else:
                # 3. Copernicus DEM GLO-30
                c_val = self.copernicus_provider.get_elevation(lat, lon)
                if c_val is not None:
                    elev = c_val
                    source = self.copernicus_provider.get_source_name()
                    source_type = self.copernicus_provider.get_elevation_type()
                    native_res = self.copernicus_provider.get_resolution()
                    vertical_datum = self.copernicus_provider.get_vertical_datum()
                    sampling_method = "Continuous Bilinear Interpolation"
                else:
                    # 4. SRTM GL1
                    s_val = self.srtm_provider.get_elevation(lat, lon)
                    if s_val is not None:
                        elev = s_val
                        source = self.srtm_provider.get_source_name()
                        source_type = self.srtm_provider.get_elevation_type()
                        native_res = self.srtm_provider.get_resolution()
                        vertical_datum = self.srtm_provider.get_vertical_datum()
                        sampling_method = "Continuous Bilinear Interpolation"
                    else:
                        elev = 0.0
                        source = "Unavailable"
                        source_type = "Unavailable"
                        native_res = "Unavailable"
                        vertical_datum = "Unavailable"

        # Compute physical derivatives for slope & aspect from 4-neighborhood in meters using WGS84 radii
        lat_rad = math.radians(lat)
        M_lat = wgs84_meridional_radius(lat_rad)
        N_lat = wgs84_prime_vertical_radius(lat_rad)

        d_step_m = 30.0
        d_lat = math.degrees(d_step_m / M_lat)
        d_lon = math.degrees(d_step_m / (N_lat * max(0.001, math.cos(lat_rad))))

        z_north, _ = self.get_point_elevation(lat + d_lat, lon)
        z_south, _ = self.get_point_elevation(lat - d_lat, lon)
        z_east, _ = self.get_point_elevation(lat, lon + d_lon)
        z_west, _ = self.get_point_elevation(lat, lon - d_lon)

        dz_dx = (z_east - z_west) / (2.0 * d_step_m)
        dz_dy = (z_north - z_south) / (2.0 * d_step_m)

        slope_rad = math.atan(math.sqrt(dz_dx**2 + dz_dy**2))
        slope_deg = round(math.degrees(slope_rad), 2)

        aspect_rad = math.atan2(dz_dy, -dz_dx)
        aspect_deg = round((180.0 - math.degrees(aspect_rad)) % 360.0, 2)

        cardinals = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]
        card_idx = int(round((aspect_deg % 360.0) / 45.0))
        aspect_card = cardinals[card_idx]

        # Metric offsets if bounds provided using WGS84 radii
        x_m = None
        y_m = None
        if bounds:
            mid_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
            mid_lon = (bounds["min_lon"] + bounds["max_lon"]) / 2.0
            mid_lat_rad = math.radians(mid_lat)
            M_mid = wgs84_meridional_radius(mid_lat_rad)
            N_mid = wgs84_prime_vertical_radius(mid_lat_rad)
            x_m = round(math.radians(lon - mid_lon) * N_mid * math.cos(mid_lat_rad), 2)
            y_m = round(math.radians(lat - mid_lat) * M_mid, 2)

        elev_diff = None
        if mesh_elevation_m is not None:
            elev_diff = round(abs(mesh_elevation_m - elev), 2)

        utm_info = utm_crs_for_latlon(lat, lon)

        return {
            "latitude": round(lat, 7),
            "longitude": round(lon, 7),
            "elevation": round(float(elev), 2),
            "mesh_elevation_m": round(mesh_elevation_m, 2) if mesh_elevation_m is not None else None,
            "elevation_difference_m": elev_diff,
            "slope": slope_deg,
            "aspect": aspect_deg,
            "aspect_cardinal": aspect_card,
            "x_metric_m": x_m,
            "y_metric_m": y_m,
            "source": source,
            "source_type": source_type,
            "native_resolution": native_res,
            "vertical_datum": vertical_datum,
            "sampling_method": sampling_method,
            "coordinate_system": f"EPSG:4326 (WGS84) / {utm_info['epsg']} ({utm_info['name']})",
            "num_contributing_points": contributing_pts,
            "measurement_quality": "Source-consistent measurement",
            "accuracy_statement": f"Measured from authoritative {source} ({native_res}) using {sampling_method}."
        }

    def get_satellite_texture(self, bounds: Dict[str, float], target_size: int = 1024) -> Optional[str]:
        return self.satellite_provider.generate_satellite_texture(bounds, target_size=target_size)

elevation_manager = ElevationManager()
