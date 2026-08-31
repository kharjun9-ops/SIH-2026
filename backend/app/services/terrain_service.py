import math
import io
import trimesh
import numpy as np
from typing import Dict, Any, List, Tuple, Optional

from app.models.schemas import (
    LatLonBounds, MetricBounds, PointInspection, TerrainStats,
    TwoPointMeasurementResponse, ElevationProfilePoint,
    PointValidation, ValidationReport, ContourSummary
)
from app.utils.geo_utils import (
    haversine_distance, calculate_area_sq_km,
    compass_bearing_to_cardinal
)
from app.services.hillshade_service import hillshade_service
from app.services.contour_service import contour_service
from app.services.slope_aspect_service import slope_aspect_service
from app.services.validation_service import validation_service

class TerrainService:
    """Processes real DEM/LiDAR elevation grids into 1:1 metric geometry, hillshade, slopes, contours, and validations."""

    @staticmethod
    def calculate_metric_bounds(bounds: Dict[str, float]) -> MetricBounds:
        """
        Convert WGS84 Lat/Lon bounding box into local metric dimensions (meters).
        Uses equirectangular metric projection with cosine latitude correction.
        """
        min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
        min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]
        mid_lat = (min_lat + max_lat) / 2.0

        height_m = (max_lat - min_lat) * 111320.0
        width_m = (max_lon - min_lon) * (111320.0 * math.cos(math.radians(mid_lat)))

        half_w = width_m / 2.0
        half_h = height_m / 2.0

        return MetricBounds(
            width_m=round(width_m, 2),
            height_m=round(height_m, 2),
            min_x_m=round(-half_w, 2),
            max_x_m=round(half_w, 2),
            min_y_m=round(-half_h, 2),
            max_y_m=round(half_h, 2)
        )

    @staticmethod
    def calculate_statistics(
        elevation_grid: np.ndarray,
        slope_grid: np.ndarray,
        aspect_grid: np.ndarray,
        bounds: Dict[str, float]
    ) -> TerrainStats:
        """Compute full statistical summary of the authentic DEM elevation and topography."""
        rows, cols = elevation_grid.shape
        min_elev = float(np.min(elevation_grid))
        max_elev = float(np.max(elevation_grid))
        mean_elev = float(np.mean(elevation_grid))
        std_elev = float(np.std(elevation_grid))
        range_elev = float(max_elev - min_elev)
        avg_slope = float(np.mean(slope_grid))

        max_idx = np.unravel_index(np.argmax(elevation_grid), elevation_grid.shape)
        min_idx = np.unravel_index(np.argmin(elevation_grid), elevation_grid.shape)

        min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
        min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]

        def idx_to_coords(r: int, c: int) -> Tuple[float, float]:
            lat = max_lat - (r / max(1, rows - 1)) * (max_lat - min_lat)
            lon = min_lon + (c / max(1, cols - 1)) * (max_lon - min_lon)
            return round(lat, 6), round(lon, 6)

        high_lat, high_lon = idx_to_coords(max_idx[0], max_idx[1])
        low_lat, low_lon = idx_to_coords(min_idx[0], min_idx[1])

        highest_point = PointInspection(
            latitude=high_lat,
            longitude=high_lon,
            elevation=round(max_elev, 2),
            slope=round(float(slope_grid[max_idx]), 2),
            aspect=round(float(aspect_grid[max_idx]), 2),
            aspect_cardinal=compass_bearing_to_cardinal(float(aspect_grid[max_idx])),
            grid_x=int(max_idx[1]),
            grid_y=int(max_idx[0])
        )

        lowest_point = PointInspection(
            latitude=low_lat,
            longitude=low_lon,
            elevation=round(min_elev, 2),
            slope=round(float(slope_grid[min_idx]), 2),
            aspect=round(float(aspect_grid[min_idx]), 2),
            aspect_cardinal=compass_bearing_to_cardinal(float(aspect_grid[min_idx])),
            grid_x=int(min_idx[1]),
            grid_y=int(min_idx[0])
        )

        area_sq_km = calculate_area_sq_km(bounds)

        return TerrainStats(
            min_elevation=round(min_elev, 2),
            max_elevation=round(max_elev, 2),
            average_elevation=round(mean_elev, 2),
            elevation_range=round(range_elev, 2),
            std_elevation=round(std_elev, 2),
            area_sq_km=round(area_sq_km, 3),
            average_slope_deg=round(avg_slope, 2),
            highest_point=highest_point,
            lowest_point=lowest_point
        )

    @staticmethod
    def inspect_point(
        lat: float,
        lon: float,
        elevation_grid: np.ndarray,
        slope_grid: np.ndarray,
        aspect_grid: np.ndarray,
        bounds: Dict[str, float],
        source_name: str = "Copernicus DEM GLO-30",
        mesh_elevation_m: Optional[float] = None
    ) -> PointInspection:
        """Inspect real DEM properties with continuous bilinear sampling at any coordinate."""
        rows, cols = elevation_grid.shape
        min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
        min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]
        mid_lat = (min_lat + max_lat) / 2.0

        r_frac = (max_lat - lat) / max(1e-6, (max_lat - min_lat)) * (rows - 1)
        c_frac = (lon - min_lon) / max(1e-6, (max_lon - min_lon)) * (cols - 1)

        r0 = int(np.clip(math.floor(r_frac), 0, rows - 1))
        r1 = int(np.clip(math.ceil(r_frac), 0, rows - 1))
        c0 = int(np.clip(math.floor(c_frac), 0, cols - 1))
        c1 = int(np.clip(math.ceil(c_frac), 0, cols - 1))

        wr = r_frac - r0
        wc = c_frac - c0

        elev = (elevation_grid[r0, c0] * (1 - wr) * (1 - wc) +
                elevation_grid[r0, c1] * (1 - wr) * wc +
                elevation_grid[r1, c0] * wr * (1 - wc) +
                elevation_grid[r1, c1] * wr * wc)

        # Bilinear slope and aspect
        slope = float(slope_grid[int(round(r_frac)), int(round(c_frac))])
        aspect = float(aspect_grid[int(round(r_frac)), int(round(c_frac))])

        x_m = (lon - (min_lon + max_lon) / 2.0) * (111320.0 * math.cos(math.radians(mid_lat)))
        y_m = (lat - mid_lat) * 111320.0

        elev_diff = None
        if mesh_elevation_m is not None:
            elev_diff = round(abs(mesh_elevation_m - float(elev)), 2)

        return PointInspection(
            latitude=round(lat, 7),
            longitude=round(lon, 7),
            elevation=round(float(elev), 2),
            mesh_elevation_m=round(mesh_elevation_m, 2) if mesh_elevation_m is not None else None,
            elevation_difference_m=elev_diff,
            slope=round(slope, 2),
            aspect=round(aspect, 2),
            aspect_cardinal=compass_bearing_to_cardinal(aspect),
            grid_x=int(round(c_frac)),
            grid_y=int(round(r_frac)),
            x_metric_m=round(x_m, 2),
            y_metric_m=round(y_m, 2),
            source=source_name,
            source_type="DTM (Bare-Earth)" if "LiDAR" in source_name else "DSM (Digital Surface Model)",
            native_resolution="0.5m – 1.0m" if "LiDAR" in source_name else "~30m",
            vertical_datum="NAVD88 / EGM96 Orthometric" if "LiDAR" in source_name else "EGM96 / EGM2008 Geoid (MSL)",
            sampling_method="Continuous Bilinear Interpolation",
            coordinate_system="EPSG:4326 (WGS84) / Local Metric Equirectangular",
            measurement_quality="Source-consistent measurement",
            accuracy_statement=f"Authoritative elevation measured from {source_name}."
        )

    @staticmethod
    def measure_two_points(
        lat_a: float,
        lon_a: float,
        lat_b: float,
        lon_b: float,
        elevation_grid: np.ndarray,
        slope_grid: np.ndarray,
        aspect_grid: np.ndarray,
        bounds: Dict[str, float],
        source_name: str = "Copernicus DEM GLO-30",
        samples: int = 64
    ) -> TwoPointMeasurementResponse:
        """
        Compute authoritative elevation difference, horizontal metric distance, true 3D Euclidean distance,
        slope gradient (degrees and grade percentage), direction, and cross-section profile.
        """
        pt_a = TerrainService.inspect_point(lat_a, lon_a, elevation_grid, slope_grid, aspect_grid, bounds, source_name)
        pt_b = TerrainService.inspect_point(lat_b, lon_b, elevation_grid, slope_grid, aspect_grid, bounds, source_name)

        # 1. Metric / Geodesic Horizontal Distance
        dist_m = haversine_distance(lat_a, lon_a, lat_b, lon_b)
        dist_h = max(1e-4, dist_m)

        # 2. Authoritative Height Difference
        height_diff = round(pt_b.elevation - pt_a.elevation, 2)

        # 3. True 3D Euclidean Distance: sqrt(dist_h^2 + delta_h^2)
        dist_3d = math.sqrt(dist_h**2 + height_diff**2)

        # 4. Slope and Grade
        slope_pct = (height_diff / dist_h) * 100.0
        grade_pct = (abs(height_diff) / dist_h) * 100.0
        slope_deg = math.degrees(math.atan2(abs(height_diff), dist_h))

        # 5. Direction
        if height_diff > 0.1:
            direction = "Ascending"
            comp_text = f"Point B is {abs(height_diff):.2f} m Higher than Point A (+{grade_pct:.1f}% grade)"
        elif height_diff < -0.1:
            direction = "Descending"
            comp_text = f"Point B is {abs(height_diff):.2f} m Lower than Point A (-{grade_pct:.1f}% grade)"
        else:
            direction = "Flat"
            comp_text = "Point A and Point B are at the Same Elevation (0.0% grade)"

        # 6. Cross-Section Elevation Transect Profile
        lats = np.linspace(lat_a, lat_b, samples)
        lons = np.linspace(lon_a, lon_b, samples)
        profile = []
        total_ascent = 0.0
        total_descent = 0.0
        surface_dist = 0.0
        elevations = []

        for i, (plat, plon) in enumerate(zip(lats, lons)):
            insp = TerrainService.inspect_point(plat, plon, elevation_grid, slope_grid, aspect_grid, bounds, source_name)
            step_dist = (i / max(1, samples - 1)) * dist_m
            profile.append(ElevationProfilePoint(
                distance_m=round(step_dist, 1),
                elevation_m=insp.elevation,
                latitude=insp.latitude,
                longitude=insp.longitude,
                slope_deg=insp.slope
            ))
            elevations.append(insp.elevation)

            if i > 0:
                prev_e = profile[i - 1].elevation_m
                curr_e = insp.elevation
                de = curr_e - prev_e
                step_dx = dist_m / max(1, samples - 1)
                surface_dist += math.sqrt(step_dx**2 + de**2)
                if de > 0:
                    total_ascent += de
                else:
                    total_descent += abs(de)

        min_e = min(elevations) if elevations else pt_a.elevation
        max_e = max(elevations) if elevations else pt_b.elevation
        avg_grad = ((total_ascent + total_descent) / dist_h) * 100.0

        native_res = "0.5m – 1.0m" if "LiDAR" in source_name else "~30m"
        v_datum = "NAVD88 / EGM96" if "LiDAR" in source_name else "EGM96 / EGM2008 Geoid (MSL)"

        return TwoPointMeasurementResponse(
            point_a=pt_a,
            point_b=pt_b,
            height_difference=height_diff,
            horizontal_distance=round(dist_m, 2),
            distance_meters=round(dist_m, 2),
            distance_3d=round(dist_3d, 2),
            surface_distance_m=round(surface_dist, 2),
            slope_percent=round(slope_pct, 2),
            slope_degrees=round(slope_deg, 2),
            grade_percent=round(grade_pct, 2),
            direction=direction,
            average_gradient_pct=round(avg_grad, 2),
            total_ascent_m=round(total_ascent, 1),
            total_descent_m=round(total_descent, 1),
            min_elevation_m=round(min_e, 2),
            max_elevation_m=round(max_e, 2),
            comparison_text=comp_text,
            source=source_name,
            source_resolution=native_res,
            vertical_datum_compatible=True,
            vertical_datum=v_datum,
            elevation_profile=profile
        )

    @staticmethod
    def export_mesh(
        elevation_grid: np.ndarray, 
        bounds: Dict[str, float], 
        file_format: str = "glb", 
        exaggeration: float = 1.0
    ) -> bytes:
        """Export true 1:1 metric 3D mesh (GLTF / GLB / OBJ)."""
        rows, cols = elevation_grid.shape
        min_elev = float(np.min(elevation_grid))
        metric_bounds = TerrainService.calculate_metric_bounds(bounds)

        x_lin = np.linspace(metric_bounds.min_x_m, metric_bounds.max_x_m, cols)
        y_lin = np.linspace(metric_bounds.max_y_m, metric_bounds.min_y_m, rows)
        xx, yy = np.meshgrid(x_lin, y_lin)

        z_meters = (elevation_grid - min_elev) * exaggeration
        vertices = np.column_stack([xx.ravel(), z_meters.ravel(), -yy.ravel()])

        faces = []
        for r in range(rows - 1):
            for c in range(cols - 1):
                i0 = r * cols + c
                i1 = r * cols + (c + 1)
                i2 = (r + 1) * cols + c
                i3 = (r + 1) * cols + (c + 1)
                faces.append([i0, i2, i1])
                faces.append([i1, i2, i3])

        faces = np.array(faces, dtype=np.int32)
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)

        out_bytes = io.BytesIO()
        if file_format.lower() in ["glb", "gltf"]:
            mesh.export(out_bytes, file_type="glb")
        else:
            mesh.export(out_bytes, file_type="obj")

        return out_bytes.getvalue()

terrain_service = TerrainService()
