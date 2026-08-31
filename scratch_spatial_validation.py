import json
import math
import urllib.request
import numpy as np

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def _centroid(coords):
    avg_lat = sum(c[0] for c in coords) / len(coords)
    avg_lon = sum(c[1] for c in coords) / len(coords)
    return avg_lat, avg_lon

def _sample_bilinear_elevation(lat, lon, grid, bounds):
    rows = len(grid)
    cols = len(grid[0])
    row_frac = (bounds["max_lat"] - lat) / (bounds["max_lat"] - bounds["min_lat"])
    col_frac = (lon - bounds["min_lon"]) / (bounds["max_lon"] - bounds["min_lon"])
    row_f = max(0.0, min(float(rows - 1), row_frac * (rows - 1)))
    col_f = max(0.0, min(float(cols - 1), col_frac * (cols - 1)))
    r0 = int(math.floor(row_f))
    c0 = int(math.floor(col_f))
    r1 = min(r0 + 1, rows - 1)
    c1 = min(c0 + 1, cols - 1)
    dr = row_f - r0
    dc = col_f - c0
    z = (
        grid[r0][c0] * (1 - dr) * (1 - dc) +
        grid[r0][c1] * (1 - dr) * dc +
        grid[r1][c0] * dr * (1 - dc) +
        grid[r1][c1] * dr * dc
    )
    return float(z)

def run_spatial_validation():
    print("================================================================================")
    print("    AUTOMATED BENGALURU 2D MAP -> 3D ENVIRONMENT SPATIAL VALIDATION ENGINE")
    print("================================================================================")

    # 1. Reconstruct Terrain
    req1 = urllib.request.Request(
        'http://127.0.0.1:8000/api/terrain/reconstruct',
        data=json.dumps({
            'sample_id': 'bengaluru_pilot',
            'provider': 'auto',
            'data_mode': 'real',
            'grid_resolution': 128
        }).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req1) as resp:
        terrain = json.loads(resp.read().decode())

    bounds = terrain['bounds']
    mb = terrain['metric_bounds']
    elev_grid = terrain['elevation_grid']
    stats = terrain['stats']
    min_elev = stats['min_elevation']

    # 2. Fetch Environment Layers
    req2 = urllib.request.Request(
        'http://127.0.0.1:8000/api/environment/layers',
        data=json.dumps({
            'bounds': bounds,
            'data_mode': 'real',
            'grid_resolution': 128,
            'layers': ['buildings', 'roads', 'water', 'landmarks']
        }).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req2) as resp:
        env = json.loads(resp.read().decode())

    buildings = env.get('buildings', [])
    roads = env.get('roads', [])
    water = env.get('water', [])

    width_m = mb['width_m']
    height_m = mb['height_m']
    min_lat, max_lat = bounds['min_lat'], bounds['max_lat']
    min_lon, max_lon = bounds['min_lon'], bounds['max_lon']

    # Inverse projection function: (X_3d, Z_3d) -> (lat, lon)
    def metric_to_latlon(x_m, z_m):
        frac_x = (x_m / width_m) + 0.5
        frac_z = (z_m / height_m) + 0.5
        lon = min_lon + frac_x * (max_lon - min_lon)
        lat = max_lat - frac_z * (max_lat - min_lat)
        return lat, lon

    # Forward projection function: (lat, lon) -> (X_3d, Z_3d)
    def latlon_to_metric(lat, lon):
        frac_x = (lon - min_lon) / (max_lon - min_lon)
        frac_z = (max_lat - lat) / (max_lat - min_lat)
        x = (frac_x - 0.5) * width_m
        z = (frac_z - 0.5) * height_m
        return x, z

    # -------------------------------------------------------------------------
    # A. BUILDING ALIGNMENT VALIDATION (30 Sampled Buildings across all quadrants)
    # -------------------------------------------------------------------------
    sample_building_indices = np.linspace(0, len(buildings) - 1, 30, dtype=int)
    building_pos_errors = []
    building_elev_errors = []
    building_details = []

    for idx in sample_building_indices:
        b = buildings[idx]
        footprint_src = b['footprint']  # [[lat, lon], ...]
        if len(footprint_src) < 3:
            continue

        # 1. Source polygon centroid
        src_lat, src_lon = _centroid(footprint_src)

        # 2. Expected metric coordinates
        exp_x, exp_z = latlon_to_metric(src_lat, src_lon)

        # 3. Rendered 3D building coordinates
        # In Three.js, geometry is created from footprint_metric and extruded upwards
        # 3D footprint vertices:
        fp_metric = b['footprint_metric']  # [[x, z], ...]
        rendered_3d_x = sum(p[0] for p in fp_metric) / len(fp_metric)
        rendered_3d_z = sum(p[1] for p in fp_metric) / len(fp_metric)

        # 4. Invert 3D coordinates back to Lat/Lon
        rendered_lat, rendered_lon = metric_to_latlon(rendered_3d_x, rendered_3d_z)

        # 5. Position error
        dist_m = haversine_distance(src_lat, src_lon, rendered_lat, rendered_lon)
        metric_dist_m = math.sqrt((exp_x - rendered_3d_x)**2 + (exp_z - rendered_3d_z)**2)
        building_pos_errors.append(dist_m)

        # 6. Elevation check
        expected_ground_z = _sample_bilinear_elevation(src_lat, src_lon, elev_grid, bounds)
        actual_ground_z = b['ground_elevation']
        elev_diff = abs(expected_ground_z - actual_ground_z)
        building_elev_errors.append(elev_diff)

        building_details.append({
            'id': b.get('id'),
            'name': b.get('name') or b.get('building_type') or 'building',
            'src_lat': round(src_lat, 6),
            'src_lon': round(src_lon, 6),
            '3d_x': round(rendered_3d_x, 2),
            '3d_z': round(rendered_3d_z, 2),
            'rendered_lat': round(rendered_lat, 6),
            'rendered_lon': round(rendered_lon, 6),
            'pos_err_m': dist_m,
            'ground_z': actual_ground_z,
            'exp_ground_z': round(expected_ground_z, 2),
            'elev_err_m': elev_diff
        })

    # -------------------------------------------------------------------------
    # B. ROAD ALIGNMENT VALIDATION (30 Sampled Road Points)
    # -------------------------------------------------------------------------
    sample_road_indices = np.linspace(0, len(roads) - 1, 30, dtype=int)
    road_pos_errors = []
    road_elev_errors = []
    road_details = []

    for idx in sample_road_indices:
        r = roads[idx]
        coords = r['coords']  # [[lat, lon, z], ...]
        coords_metric = r['coords_metric']  # [[x, z, z], ...]
        if not coords or not coords_metric:
            continue

        # Pick midpoint or first waypoint of the road segment
        pt_idx = len(coords) // 2
        src_lat, src_lon, src_elev = coords[pt_idx]
        x_3d, z_3d, z_elev = coords_metric[pt_idx]

        # Invert 3D to Lat/Lon
        rendered_lat, rendered_lon = metric_to_latlon(x_3d, z_3d)

        # Position error
        dist_m = haversine_distance(src_lat, src_lon, rendered_lat, rendered_lon)
        road_pos_errors.append(dist_m)

        # Elevation error
        exp_elev = _sample_bilinear_elevation(src_lat, src_lon, elev_grid, bounds)
        elev_diff = abs(exp_elev - z_elev)
        road_elev_errors.append(elev_diff)

        road_details.append({
            'id': r.get('id'),
            'name': r.get('name') or r.get('road_type') or 'road',
            'src_lat': round(src_lat, 6),
            'src_lon': round(src_lon, 6),
            '3d_x': round(x_3d, 2),
            '3d_z': round(z_3d, 2),
            'rendered_lat': round(rendered_lat, 6),
            'rendered_lon': round(rendered_lon, 6),
            'pos_err_m': dist_m,
            'road_z': z_elev,
            'exp_elev': round(exp_elev, 2),
            'elev_err_m': elev_diff
        })

    # -------------------------------------------------------------------------
    # C. WATER BODY ALIGNMENT VALIDATION
    # -------------------------------------------------------------------------
    water_pos_errors = []
    for w in water:
        poly = w['polygon']
        poly_metric = w['polygon_metric']
        if len(poly) < 3 or len(poly_metric) < 3:
            continue
        src_lat, src_lon = _centroid(poly)
        x_3d = sum(p[0] for p in poly_metric) / len(poly_metric)
        z_3d = sum(p[1] for p in poly_metric) / len(poly_metric)
        r_lat, r_lon = metric_to_latlon(x_3d, z_3d)
        water_pos_errors.append(haversine_distance(src_lat, src_lon, r_lat, r_lon))

    # Output stats
    b_mean = float(np.mean(building_pos_errors))
    b_median = float(np.median(building_pos_errors))
    b_max = float(np.max(building_pos_errors))
    b_rmse = float(np.sqrt(np.mean(np.array(building_pos_errors)**2)))

    r_mean = float(np.mean(road_pos_errors))
    r_median = float(np.median(road_pos_errors))
    r_max = float(np.max(road_pos_errors))
    r_rmse = float(np.sqrt(np.mean(np.array(road_pos_errors)**2)))

    # Terrain scale calculations
    center_lat = bounds['center_lat']
    center_lon = bounds['center_lon']
    mid_lat = (min_lat + max_lat) / 2.0
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(mid_lat))

    c_x, c_z = latlon_to_metric(center_lat, center_lon)

    print("\n" + "="*50)
    print("BUILDING ALIGNMENT REPORT")
    print("="*50)
    print(f"Samples: {len(building_pos_errors)}")
    print(f"Mean error: {b_mean:.4f} m")
    print(f"Median error: {b_median:.4f} m")
    print(f"Maximum error: {b_max:.4f} m")
    print(f"RMSE: {b_rmse:.4f} m")
    print(f"Mean ground elevation delta: {np.mean(building_elev_errors):.4f} m")
    print(f"Max ground elevation delta: {np.max(building_elev_errors):.4f} m")

    print("\n" + "="*50)
    print("ROAD ALIGNMENT REPORT")
    print("="*50)
    print(f"Samples: {len(road_pos_errors)}")
    print(f"Mean error: {r_mean:.4f} m")
    print(f"Median error: {r_median:.4f} m")
    print(f"Maximum error: {r_max:.4f} m")
    print(f"RMSE: {r_rmse:.4f} m")
    print(f"Mean road elevation delta: {np.mean(road_elev_errors):.4f} m")
    print(f"Max road elevation delta: {np.max(road_elev_errors):.4f} m")

    if water_pos_errors:
        print("\n" + "="*50)
        print("WATER BODY ALIGNMENT REPORT")
        print("="*50)
        print(f"Samples: {len(water_pos_errors)}")
        print(f"Mean error: {np.mean(water_pos_errors):.4f} m")
        print(f"Maximum error: {np.max(water_pos_errors):.4f} m")

    print("\n" + "="*50)
    print("TERRAIN ALIGNMENT REPORT")
    print("="*50)
    print(f"Map Bounds: [{min_lat:.6f}, {min_lon:.6f}] to [{max_lat:.6f}, {max_lon:.6f}]")
    print(f"Map Center: Lat={center_lat:.6f}, Lon={center_lon:.6f}")
    print(f"3D Center: X={c_x:.3f} m, Z={c_z:.3f} m (Exact 3D Origin (0,0))")
    print(f"Terrain Width (X-axis): {width_m:.2f} m (span: [-{width_m/2:.2f}m, +{width_m/2:.2f}m])")
    print(f"Terrain Height (Z-axis): {height_m:.2f} m (span: [-{height_m/2:.2f}m, +{height_m/2:.2f}m])")
    print(f"Horizontal Scale (X East-West): {m_per_deg_lon:.2f} m/deg (1 Three.js unit = 1.000 meter)")
    print(f"Horizontal Scale (Z North-South): {m_per_deg_lat:.2f} m/deg (1 Three.js unit = 1.000 meter)")
    print(f"Vertical Scale (Y Elevation): 1 Three.js unit = 1.000 meter (Physical 1.0x scale)")
    print(f"North Orientation: -Z axis (0 deg bearing = [0, 0, -1])")

    # Sample building table
    print("\n--- SAMPLE BUILDING VERIFICATION TABLE (First 10 of 30) ---")
    print(f"{'Name/Type':<22} | {'Src Lat/Lon':<21} | {'3D X/Z (m)':<20} | {'Rendered Lat/Lon':<21} | {'Err(m)':<6} | {'Elev(m)':<8}")
    print("-" * 110)
    for b in building_details[:10]:
        src_ll = f"{b['src_lat']:.5f},{b['src_lon']:.5f}"
        render_ll = f"{b['rendered_lat']:.5f},{b['rendered_lon']:.5f}"
        xz = f"{b['3d_x']:>7.1f},{b['3d_z']:>7.1f}"
        print(f"{b['name'][:22]:<22} | {src_ll:<21} | {xz:<20} | {render_ll:<21} | {b['pos_err_m']:<6.3f} | {b['ground_z']:<8.1f}")

    print("\n--- SAMPLE ROAD VERIFICATION TABLE (First 10 of 30) ---")
    print(f"{'Name/Type':<22} | {'Src Lat/Lon':<21} | {'3D X/Z (m)':<20} | {'Rendered Lat/Lon':<21} | {'Err(m)':<6} | {'Elev(m)':<8}")
    print("-" * 110)
    for r in road_details[:10]:
        src_ll = f"{r['src_lat']:.5f},{r['src_lon']:.5f}"
        render_ll = f"{r['rendered_lat']:.5f},{r['rendered_lon']:.5f}"
        xz = f"{r['3d_x']:>7.1f},{r['3d_z']:>7.1f}"
        print(f"{r['name'][:22]:<22} | {src_ll:<21} | {xz:<20} | {render_ll:<21} | {r['pos_err_m']:<6.3f} | {r['road_z']:<8.1f}")

if __name__ == '__main__':
    run_spatial_validation()
