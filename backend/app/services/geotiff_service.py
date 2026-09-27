"""
GeoTIFF Metadata Extraction & Scale Calibration Service — SIH26175
====================================================================
Handles Mode 2 (Georeferenced) input:

    GeoTIFF → Read RGB + Spatial Metadata → Extract CRS/Transform/Bounds
    
Then performs scale calibration:
    
    RELATIVE DEPTH → Reference DEM Lookup → Linear Regression → METRIC DSM
    
Calibration is ONLY applied when reliable reference data can be obtained.
If calibration fails or reference data is unavailable, the output is clearly
marked as RELATIVE, not metric.
"""

import os
import io
import logging
import math
import numpy as np
from PIL import Image
from typing import Tuple, Optional, Dict, Any

from app.config import settings
from app.models.schemas import GeoTIFFMetadata, DepthCalibrationInfo, LatLonBounds

logger = logging.getLogger(__name__)

# ─── Lazy import rasterio ────────────────────────────────────────────────────

_RASTERIO_AVAILABLE = False
try:
    import rasterio
    from rasterio.crs import CRS
    _RASTERIO_AVAILABLE = True
except ImportError:
    logger.warning("rasterio not available. GeoTIFF support will be limited.")


class GeoTIFFService:
    """
    Reads georeferenced GeoTIFF/TIFF imagery and extracts spatial metadata.
    Also handles scale calibration using reference DEM data.
    """
    
    # ─── GeoTIFF Reading ──────────────────────────────────────────────────
    
    def read_geotiff(self, file_bytes: bytes) -> Tuple[np.ndarray, GeoTIFFMetadata]:
        """
        Read a GeoTIFF file and extract both the RGB image and geospatial metadata.
        
        Args:
            file_bytes: Raw bytes of the GeoTIFF file
            
        Returns:
            (rgb_array, metadata)
            rgb_array: HxWx3 numpy array
            metadata: GeoTIFFMetadata with all spatial info
        """
        if not _RASTERIO_AVAILABLE:
            # Fall back to PIL-only reading (no geo metadata)
            return self._read_as_plain_image(file_bytes)
        
        try:
            return self._read_with_rasterio(file_bytes)
        except Exception as e:
            logger.warning(f"Rasterio GeoTIFF read failed: {e}. Falling back to PIL.")
            return self._read_as_plain_image(file_bytes)
    
    def _read_with_rasterio(self, file_bytes: bytes) -> Tuple[np.ndarray, GeoTIFFMetadata]:
        """Read GeoTIFF with rasterio extracting full spatial metadata."""
        import rasterio
        from rasterio.crs import CRS
        
        with rasterio.open(io.BytesIO(file_bytes)) as dataset:
            # Read RGB bands
            band_count = dataset.count
            
            if band_count >= 3:
                # Read first 3 bands as RGB
                r = dataset.read(1)
                g = dataset.read(2)
                b = dataset.read(3)
                rgb = np.stack([r, g, b], axis=-1)
            elif band_count == 1:
                # Single-band: replicate to RGB
                band = dataset.read(1)
                rgb = np.stack([band, band, band], axis=-1)
            else:
                r = dataset.read(1)
                g = dataset.read(2) if band_count > 1 else r
                b = r
                rgb = np.stack([r, g, b], axis=-1)
            
            # Normalize to uint8 if needed
            if rgb.dtype != np.uint8:
                if rgb.max() > 0:
                    if rgb.max() > 255:
                        # 16-bit or float imagery
                        rgb = ((rgb.astype(np.float64) / rgb.max()) * 255).astype(np.uint8)
                    else:
                        rgb = rgb.astype(np.uint8)
                else:
                    rgb = np.zeros_like(rgb, dtype=np.uint8)
            
            # Extract spatial metadata
            transform = dataset.transform
            crs = dataset.crs
            bounds = dataset.bounds
            
            has_geo = crs is not None and transform is not None
            
            # Determine pixel size and unit
            pixel_size_x = abs(transform.a) if transform else None
            pixel_size_y = abs(transform.e) if transform else None
            
            pixel_unit = "unknown"
            if crs is not None:
                try:
                    if crs.is_geographic:
                        pixel_unit = "degrees"
                    elif crs.is_projected:
                        pixel_unit = "meters"
                except Exception:
                    pixel_unit = "unknown"
            
            crs_str = str(crs) if crs else None
            crs_name = None
            if crs is not None:
                try:
                    crs_name = crs.to_epsg()
                    if crs_name:
                        crs_str = f"EPSG:{crs_name}"
                    crs_name = str(crs)
                except Exception:
                    crs_name = str(crs)
            
            # Build area description
            area_desc = None
            if has_geo and bounds:
                area_desc = (
                    f"Geographic extent: {bounds.left:.6f}°W to {bounds.right:.6f}°E, "
                    f"{bounds.bottom:.6f}°S to {bounds.top:.6f}°N"
                )
            
            nodata = dataset.nodata
            
            metadata = GeoTIFFMetadata(
                has_georeference=has_geo,
                crs=crs_str,
                crs_name=crs_name,
                affine_transform=[
                    transform.a, transform.b, transform.c,
                    transform.d, transform.e, transform.f
                ] if transform else None,
                pixel_size_x=round(pixel_size_x, 10) if pixel_size_x else None,
                pixel_size_y=round(pixel_size_y, 10) if pixel_size_y else None,
                pixel_size_unit=pixel_unit,
                bounds_west=round(bounds.left, 8) if bounds else None,
                bounds_east=round(bounds.right, 8) if bounds else None,
                bounds_south=round(bounds.bottom, 8) if bounds else None,
                bounds_north=round(bounds.top, 8) if bounds else None,
                width_pixels=dataset.width,
                height_pixels=dataset.height,
                band_count=band_count,
                dtype=str(dataset.dtypes[0]) if dataset.dtypes else None,
                nodata_value=float(nodata) if nodata is not None else None,
                area_description=area_desc,
            )
            
            return rgb, metadata
    
    def _read_as_plain_image(self, file_bytes: bytes) -> Tuple[np.ndarray, GeoTIFFMetadata]:
        """Fall back to reading as a plain image without geospatial metadata."""
        pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        rgb = np.array(pil_img)
        
        metadata = GeoTIFFMetadata(
            has_georeference=False,
            width_pixels=pil_img.width,
            height_pixels=pil_img.height,
            band_count=3,
            dtype="uint8",
            area_description="Non-georeferenced image (no CRS or spatial metadata detected)",
        )
        
        return rgb, metadata
    
    # ─── Geographic Bounds from GeoTIFF ───────────────────────────────────
    
    def extract_bounds(self, metadata: GeoTIFFMetadata) -> Optional[LatLonBounds]:
        """
        Convert GeoTIFF spatial metadata to LatLonBounds.
        Only returns bounds if the GeoTIFF has valid geographic metadata.
        """
        if not metadata.has_georeference:
            return None
        
        if metadata.bounds_west is None or metadata.bounds_north is None:
            return None
        
        west = metadata.bounds_west
        east = metadata.bounds_east
        south = metadata.bounds_south
        north = metadata.bounds_north
        
        # Validate range
        if not (-180 <= west <= 180 and -180 <= east <= 180):
            # Might be in projected coordinates, not lat/lon
            logger.warning("GeoTIFF bounds appear to be in projected coordinates, not geographic.")
            return None
        
        if not (-90 <= south <= 90 and -90 <= north <= 90):
            return None
        
        if south >= north or west >= east:
            return None
        
        center_lat = (south + north) / 2.0
        center_lon = (west + east) / 2.0
        
        # Estimate radius
        lat_span_m = (north - south) * 111320.0
        lon_span_m = (east - west) * 111320.0 * max(0.01, math.cos(math.radians(center_lat)))
        radius_m = max(lat_span_m, lon_span_m) / 2.0
        
        return LatLonBounds(
            min_lat=round(south, 6),
            max_lat=round(north, 6),
            min_lon=round(west, 6),
            max_lon=round(east, 6),
            center_lat=round(center_lat, 6),
            center_lon=round(center_lon, 6),
            radius_meters=round(radius_m, 1),
        )
    
    # ─── Scale Calibration ────────────────────────────────────────────────
    
    def calibrate_depth_to_metric(
        self,
        relative_depth: np.ndarray,
        bounds: Optional[LatLonBounds],
        calibration_mode: str = "auto",
        reference_source: Optional[str] = None,
    ) -> Tuple[np.ndarray, DepthCalibrationInfo]:
        """
        Attempt to calibrate relative depth to metric elevation.
        
        Calibration strategy:
        1. If georeferenced bounds exist, attempt reference DEM lookup
        2. Linear regression: metric_elevation = scale * relative_depth + offset
        3. If calibration quality is too low, fall back to relative
        
        Returns:
            (elevation_grid, calibration_info)
        """
        if calibration_mode == "none" or bounds is None:
            return self._return_relative(relative_depth)
        
        # Try reference DEM calibration
        try:
            return self._calibrate_with_reference_dem(
                relative_depth, bounds, reference_source
            )
        except Exception as e:
            logger.warning(f"Reference DEM calibration failed: {e}")
            return self._return_relative(relative_depth)
    
    def _return_relative(self, depth: np.ndarray) -> Tuple[np.ndarray, DepthCalibrationInfo]:
        """Return depth as-is with 'relative' calibration info."""
        info = DepthCalibrationInfo(
            calibration_method="none",
            is_metric=False,
            confidence_level="low",
            calibration_notice=(
                "No scale calibration applied. "
                "Output represents RELATIVE depth/height only, not metric elevation. "
                "Values range from 0 (lowest) to 1 (highest) in arbitrary units."
            ),
        )
        return depth.copy(), info
    
    def _calibrate_with_reference_dem(
        self,
        relative_depth: np.ndarray,
        bounds: LatLonBounds,
        reference_source: Optional[str] = None,
    ) -> Tuple[np.ndarray, DepthCalibrationInfo]:
        """
        Calibrate using reference DEM data.
        
        Strategy:
        1. Fetch reference elevation at grid sample points within bounds
        2. Fit linear regression: elevation = scale * depth + offset
        3. Apply only if R² > threshold (quality gate)
        """
        from app.services.dem_service import elevation_service
        
        h, w = relative_depth.shape
        n_samples = min(25, h * w)
        
        # Generate sample grid positions
        sample_rows = np.linspace(0, h - 1, int(np.sqrt(n_samples)), dtype=int)
        sample_cols = np.linspace(0, w - 1, int(np.sqrt(n_samples)), dtype=int)
        
        ref_elevations = []
        depth_values = []
        
        for row in sample_rows:
            for col in sample_cols:
                # Map grid position to geographic coordinates
                lat = bounds.max_lat - (row / max(1, h - 1)) * (bounds.max_lat - bounds.min_lat)
                lon = bounds.min_lon + (col / max(1, w - 1)) * (bounds.max_lon - bounds.min_lon)
                
                try:
                    elev, source = elevation_service.get_point_elevation(lat, lon)
                    if elev is not None and not np.isnan(elev) and elev > -500:
                        ref_elevations.append(elev)
                        depth_values.append(float(relative_depth[row, col]))
                except Exception:
                    continue
        
        if len(ref_elevations) < 4:
            logger.warning(f"Only {len(ref_elevations)} reference points found. Insufficient for calibration.")
            return self._return_relative(relative_depth)
        
        ref_arr = np.array(ref_elevations)
        depth_arr = np.array(depth_values)
        
        # Linear regression: elevation = scale * depth + offset
        # Using numpy polyfit (degree 1)
        try:
            coeffs = np.polyfit(depth_arr, ref_arr, 1)
            scale = float(coeffs[0])
            offset = float(coeffs[1])
        except Exception:
            return self._return_relative(relative_depth)
        
        # Compute R² to assess calibration quality
        predicted = scale * depth_arr + offset
        ss_res = np.sum((ref_arr - predicted) ** 2)
        ss_tot = np.sum((ref_arr - np.mean(ref_arr)) ** 2)
        r_squared = 1.0 - (ss_res / max(ss_tot, 1e-6))
        rmse = float(np.sqrt(np.mean((ref_arr - predicted) ** 2)))
        
        # Quality gate: only accept if R² is reasonable
        if r_squared < 0.3:
            logger.warning(f"Calibration R²={r_squared:.3f} is too low. Rejecting metric calibration.")
            info = DepthCalibrationInfo(
                calibration_method="reference_dem_rejected",
                is_metric=False,
                scale_factor=scale,
                offset_meters=offset,
                reference_source=reference_source or "Copernicus GLO-30 DEM",
                reference_elevation_min=float(np.min(ref_arr)),
                reference_elevation_max=float(np.max(ref_arr)),
                reference_elevation_mean=float(np.mean(ref_arr)),
                calibration_rmse=rmse,
                calibration_r_squared=round(r_squared, 4),
                confidence_level="low",
                calibration_notice=(
                    f"Scale calibration attempted using reference DEM but quality was insufficient "
                    f"(R²={r_squared:.3f}, RMSE={rmse:.1f}m). "
                    f"Output is RELATIVE depth only. Do not interpret as metric elevation."
                ),
            )
            return relative_depth.copy(), info
        
        # Apply calibration
        metric_elevation = (scale * relative_depth + offset).astype(np.float32)
        
        confidence = "medium" if r_squared < 0.7 else "high"
        
        info = DepthCalibrationInfo(
            calibration_method="reference_dem",
            is_metric=True,
            scale_factor=round(scale, 4),
            offset_meters=round(offset, 2),
            reference_source=reference_source or "Copernicus GLO-30 DEM",
            reference_elevation_min=round(float(np.min(ref_arr)), 1),
            reference_elevation_max=round(float(np.max(ref_arr)), 1),
            reference_elevation_mean=round(float(np.mean(ref_arr)), 1),
            calibration_rmse=round(rmse, 2),
            calibration_r_squared=round(r_squared, 4),
            confidence_level=confidence,
            calibration_notice=(
                f"Scale calibrated against {reference_source or 'Copernicus GLO-30 DEM'} reference DEM. "
                f"R²={r_squared:.3f}, RMSE={rmse:.1f}m. "
                f"Confidence: {confidence.upper()}. "
                f"Elevation range: {float(np.min(metric_elevation)):.0f}m – {float(np.max(metric_elevation)):.0f}m."
            ),
        )
        
        return metric_elevation, info


# Singleton
geotiff_service = GeoTIFFService()
