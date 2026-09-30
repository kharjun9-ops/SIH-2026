"""
Advanced Terrain Derivatives & Geomorphometry Service (SIH26175).
Computes physical, metric geomorphometric indices and hydrological features from DEMs:
- TPI (Topographic Position Index - Weiss 2001)
- TRI (Terrain Ruggedness Index - Riley et al. 1999)
- Surface Roughness (Local elevation relief)
- D8 Hydrological Drainage Network & Proximity Matrix
- Road Network Proximity Matrix (OSM Ingestion)

CRITICAL RULES:
- Computations occur in true 1:1 metric terrain space, never from visual mesh exaggerations.
- No fabricated values or random noise.
"""
import math
import logging
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
from scipy.ndimage import uniform_filter, generic_filter, distance_transform_edt

logger = logging.getLogger(__name__)


class TerrainDerivativesService:
    """Computes advanced geomorphometric and hydrological proxies from DEM arrays."""

    @staticmethod
    def calculate_tpi(
        elevation_grid: np.ndarray,
        window_size: int = 5
    ) -> np.ndarray:
        """
        Calculates Topographic Position Index (TPI).
        TPI = z_center - mean(z_neighborhood).
        
        Interpretation:
        - Positive (> 0): Ridges, hilltops, upper slopes
        - Near Zero (~ 0): Flat plains or continuous mid-slopes
        - Negative (< 0): Valley bottoms, incised gullies, depressions
        """
        w = max(3, window_size if window_size % 2 == 1 else window_size + 1)
        mean_elev = uniform_filter(elevation_grid.astype(np.float32), size=w, mode='nearest')
        tpi = elevation_grid.astype(np.float32) - mean_elev
        return np.round(tpi, 2)

    @staticmethod
    def calculate_tri(
        elevation_grid: np.ndarray
    ) -> np.ndarray:
        """
        Calculates Terrain Ruggedness Index (TRI - Riley et al. 1999).
        TRI = sqrt(sum((z_neighbor - z_center)^2) / 8) across 3x3 neighborhood.
        """
        z = elevation_grid.astype(np.float32)
        rows, cols = z.shape
        padded = np.pad(z, pad_width=1, mode='edge')

        diff_sq_sum = np.zeros_like(z, dtype=np.float32)

        # 8 Neighbors: (-1,-1), (-1,0), (-1,1), (0,-1), (0,1), (1,-1), (1,0), (1,1)
        shifts = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
        for dr, dc in shifts:
            neighbor = padded[1 + dr : rows + 1 + dr, 1 + dc : cols + 1 + dc]
            diff_sq_sum += (neighbor - z) ** 2

        tri = np.sqrt(diff_sq_sum / 8.0)
        return np.round(tri, 2)

    @staticmethod
    def calculate_roughness(
        elevation_grid: np.ndarray,
        window_size: int = 3
    ) -> np.ndarray:
        """
        Calculates Surface Roughness: difference between max and min elevation in local neighborhood.
        """
        w = max(3, window_size if window_size % 2 == 1 else window_size + 1)
        from scipy.ndimage import maximum_filter, minimum_filter
        max_elev = maximum_filter(elevation_grid.astype(np.float32), size=w, mode='nearest')
        min_elev = minimum_filter(elevation_grid.astype(np.float32), size=w, mode='nearest')
        roughness = max_elev - min_elev
        return np.round(roughness, 2)

    @staticmethod
    def calculate_drainage_proximity(
        elevation_grid: np.ndarray,
        cell_size_x_m: float,
        cell_size_y_m: float,
        flow_accumulation_threshold_cells: int = 25
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Estimates D8 Hydrological Flow Direction & Accumulation,
        extracts valley drainage channels, and computes metric Euclidean Distance to Drainage (m).
        
        Returns:
        - dist_drainage_m: 2D array of metric distance to nearest stream/drainage channel in meters.
        - stream_mask: 2D boolean array where streams/channels exist.
        """
        rows, cols = elevation_grid.shape
        dx = max(1.0, float(cell_size_x_m))
        dy = max(1.0, float(cell_size_y_m))
        cell_diag = math.sqrt(dx**2 + dy**2)

        # Simplified Steepest Descent D8 Flow Direction & Upstream Accumulation
        z = elevation_grid.astype(np.float32)
        padded = np.pad(z, pad_width=1, mode='edge')

        flow_accum = np.ones((rows, cols), dtype=np.float32)
        # Sort cells by elevation descending to route flow upstream -> downstream
        flat_indices = np.argsort(-z.ravel())

        shifts = [(-1, 0, dy), (1, 0, dy), (0, -1, dx), (0, 1, dx),
                  (-1, -1, cell_diag), (-1, 1, cell_diag), (1, -1, cell_diag), (1, 1, cell_diag)]

        for idx in flat_indices:
            r, c = divmod(idx, cols)
            curr_z = z[r, c]
            max_drop = 0.0
            downstream_r, downstream_c = r, c

            for dr, dc, dist in shifts:
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols:
                    drop = (curr_z - z[nr, nc]) / dist
                    if drop > max_drop:
                        max_drop = drop
                        downstream_r, downstream_c = nr, nc

            if (downstream_r, downstream_c) != (r, c) and max_drop > 0.0:
                flow_accum[downstream_r, downstream_c] += flow_accum[r, c]

        # Channels: cells where accumulated catchment area >= threshold
        stream_mask = flow_accum >= flow_accumulation_threshold_cells

        # Ensure at least valley bottoms are marked if flow accumulation is sparse
        if not np.any(stream_mask):
            stream_mask = flow_accum >= max(5, np.percentile(flow_accum, 95))

        # Euclidean Distance Transform (in cell coordinates -> metric meters)
        # Invert: distance transform calculates distance to zero pixels
        dist_cells = distance_transform_edt(~stream_mask)
        mean_cell_m = (dx + dy) / 2.0
        dist_drainage_m = np.round(dist_cells * mean_cell_m, 1)

        return dist_drainage_m, stream_mask

    @staticmethod
    def calculate_road_proximity(
        bounds: Dict[str, float],
        resolution: int,
        roads: List[Dict[str, Any]],
        cell_size_x_m: float,
        cell_size_y_m: float
    ) -> np.ndarray:
        """
        Calculates metric Euclidean Distance to nearest OpenStreetMap road network segment (m).
        Cut-slopes and toe excavation adjacent to roads significantly alter slope stability.
        """
        rows, cols = resolution, resolution
        min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
        min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]
        dx = max(1.0, float(cell_size_x_m))
        dy = max(1.0, float(cell_size_y_m))
        mean_cell_m = (dx + dy) / 2.0

        road_mask = np.zeros((rows, cols), dtype=bool)

        if roads:
            for r in roads:
                coords = r.get("coords", [])
                for pt in coords:
                    plat, plon = pt[0], pt[1]
                    if min_lat <= plat <= max_lat and min_lon <= plon <= max_lon:
                        r_idx = int(np.clip(round((max_lat - plat) / max(1e-6, max_lat - min_lat) * (rows - 1)), 0, rows - 1))
                        c_idx = int(np.clip(round((plon - min_lon) / max(1e-6, max_lon - min_lon) * (cols - 1)), 0, cols - 1))
                        road_mask[r_idx, c_idx] = True

        if not np.any(road_mask):
            # No roads in tile -> set default large distance
            return np.full((rows, cols), 5000.0, dtype=np.float32)

        dist_cells = distance_transform_edt(~road_mask)
        dist_roads_m = np.round(dist_cells * mean_cell_m, 1)
        return dist_roads_m


terrain_derivatives_service = TerrainDerivativesService()
