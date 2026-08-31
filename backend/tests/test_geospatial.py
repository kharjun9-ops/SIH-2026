import os
import sys
import math
import numpy as np

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.terrain_service import terrain_service
from app.services.hillshade_service import hillshade_service
from app.services.contour_service import contour_service
from app.services.slope_aspect_service import slope_aspect_service
from app.services.validation_service import validation_service
from app.providers.elevation_manager import elevation_manager

def test_metric_bounds():
    bounds = {"min_lat": 35.3156, "max_lat": 35.4056, "min_lon": 138.6724, "max_lon": 138.7824}
    mb = terrain_service.calculate_metric_bounds(bounds)
    print(f"[TEST 1] Metric Bounds: Width={mb.width_m}m, Height={mb.height_m}m")
    assert 9900 <= mb.width_m <= 10100, "Width should be ~10,000m"
    assert 9900 <= mb.height_m <= 10100, "Height should be ~10,000m"
    print("[PASS] Metric bounds conversion passed")

def test_slope_and_aspect():
    # Synthetic planar ramp sloping east: z = 0.1 * x (slope ~5.71 degrees, aspect = 90 degrees East)
    grid = np.zeros((64, 64), dtype=np.float32)
    for c in range(64):
        grid[:, c] = c * 10.0  # 10m rise per cell (cell size = 100m -> slope = 0.1)
    
    slope_grid, aspect_grid = slope_aspect_service.calculate_slope_and_aspect(grid, cell_size_x_m=100.0, cell_size_y_m=100.0)
    mean_slope = float(np.mean(slope_grid[2:-2, 2:-2]))
    mean_aspect = float(np.mean(aspect_grid[2:-2, 2:-2]))
    print(f"[TEST 2] Slope & Aspect: Mean Slope={mean_slope:.2f} deg, Mean Aspect={mean_aspect:.2f} deg")
    assert 5.0 <= mean_slope <= 6.5, f"Slope should be ~5.71 deg, got {mean_slope}"
    assert 265.0 <= mean_aspect <= 275.0, f"Aspect should be ~270 deg (Downhill West), got {mean_aspect}"
    print("[PASS] Slope and aspect calculations passed")

def test_hillshade():
    grid = np.full((32, 32), 500.0, dtype=np.float32)
    # Add a gentle hill in the center
    for r in range(32):
        for c in range(32):
            grid[r, c] += 100.0 * math.exp(-((r-16)**2 + (c-16)**2) / 30.0)
            
    hs = hillshade_service.compute_hillshade(grid, 30.0, 30.0, azimuth_deg=315.0, altitude_deg=45.0)
    print(f"[TEST 3] Hillshade array shape={hs.shape}, min={np.min(hs)}, max={np.max(hs)}")
    assert hs.shape == (32, 32)
    assert np.max(hs) > 150
    assert np.min(hs) < 150
    print("[PASS] Hillshade shaded relief passed")

def test_contour_levels():
    levels = contour_service.calculate_contour_levels(1064.0, 3742.0, interval_m=200.0)
    print(f"[TEST 4] Contour levels (count={len(levels)}): {levels[:5]} ... {levels[-3:]}")
    assert len(levels) > 10
    assert levels[0] == 1200.0
    assert levels[-1] <= 3742.0
    print("[PASS] Contour interval generation passed")

def test_statistical_validation():
    bounds = {"min_lat": 35.3156, "max_lat": 35.4056, "min_lon": 138.6724, "max_lon": 138.7824}
    grid, meta = elevation_manager.get_elevation_grid(bounds, resolution=64, data_mode="real")
    val_report = validation_service.run_statistical_validation(grid, bounds, sample_count=50, source_name=meta["source"])
    print(f"[TEST 5] Validation Report: MAE={val_report['mean_absolute_error_m']}m, RMSE={val_report['root_mean_square_error_m']}m, MaxErr={val_report['max_error_m']}m")
    assert val_report['sample_count'] == 50
    assert val_report['mean_absolute_error_m'] >= 0.0
    assert val_report['root_mean_square_error_m'] >= 0.0
    print("[PASS] Statistical accuracy validation passed")

def test_real_vs_demo_mode():
    bounds = {"min_lat": 35.3156, "max_lat": 35.4056, "min_lon": 138.6724, "max_lon": 138.7824}
    
    # 1. Real Data Mode must return REAL DATA (Copernicus or SRTM)
    real_grid, real_meta = elevation_manager.get_elevation_grid(bounds, resolution=64, sample_id="mount_fuji", data_mode="real")
    print(f"[TEST 6] Real Mode Provider: {real_meta['source']}, Status: {real_meta['data_status']}, Category: {real_meta['dataset_category']}")
    assert real_meta['data_status'] == "REAL DATA"
    assert "DEMO" not in real_meta['data_status']

    # 2. Demo Mode can use synthetic preset
    demo_grid, demo_meta = elevation_manager.get_elevation_grid(bounds, resolution=64, sample_id="mount_fuji", data_mode="demo")
    print(f"[TEST 6] Demo Mode Provider: {demo_meta['source']}, Status: {demo_meta['data_status']}")
    assert demo_meta['data_status'] == "SYNTHETIC DEMO DATA"
    print("[PASS] Real Mode vs Demo Mode priority cascade passed")

def test_elevation_profile_metrics():
    grid = np.zeros((64, 64), dtype=np.float32)
    # Create sloping terrain from 100m to 500m
    for r in range(64):
        for c in range(64):
            grid[r, c] = 100.0 + c * 6.25
            
    slope_g = np.full((64, 64), 5.0, dtype=np.float32)
    aspect_g = np.full((64, 64), 90.0, dtype=np.float32)
    bounds = {"min_lat": 35.3156, "max_lat": 35.4056, "min_lon": 138.6724, "max_lon": 138.7824}

    meas = terrain_service.measure_two_points(
        lat_a=35.3156, lon_a=138.6724,
        lat_b=35.3156, lon_b=138.7824,
        elevation_grid=grid,
        slope_grid=slope_g,
        aspect_grid=aspect_g,
        bounds=bounds,
        samples=64
    )
    print(f"[TEST 7] Profile Metrics: Dist={meas.distance_meters:.1f}m, Surface={meas.surface_distance_m:.1f}m, Ascent={meas.total_ascent_m:.1f}m, Descent={meas.total_descent_m:.1f}m")
    assert meas.surface_distance_m >= meas.distance_meters
    assert meas.total_ascent_m >= 0.0
    assert meas.total_descent_m >= 0.0
    assert meas.min_elevation_m >= 0.0
    print("[PASS] Profile metrics calculation passed")

def test_environment_service():
    from app.services.environment_service import _latlon_to_metric, _sample_terrain_z, get_environment_layers
    
    bounds = {"min_lat": 35.3156, "max_lat": 35.4056, "min_lon": 138.6724, "max_lon": 138.7824}
    grid = np.full((64, 64), 2500.0, dtype=np.float32)
    # Put a distinct peak in grid center
    grid[32, 32] = 3776.0
    
    # Test metric coordinate conversion
    mid_lat = (bounds["min_lat"] + bounds["max_lat"]) / 2.0
    mid_lon = (bounds["min_lon"] + bounds["max_lon"]) / 2.0
    mx, mz = _latlon_to_metric(mid_lat, mid_lon, bounds)
    print(f"[TEST 8] Center metric coords: ({mx}, {mz})")
    assert abs(mx) < 5.0 and abs(mz) < 5.0, f"Center of bounding box should map close to (0, 0), got ({mx}, {mz})"
    
    # Test terrain elevation sampling
    sampled_z = _sample_terrain_z(mid_lat, mid_lon, grid, bounds)
    print(f"[TEST 8] Sampled elevation at center: {sampled_z:.1f}m")
    assert 2500.0 <= sampled_z <= 3776.0
    
    # Test demo mode bypass
    demo_env = get_environment_layers(bounds, grid, ["buildings", "roads", "water"], data_mode="demo")
    assert len(demo_env["buildings"]) == 0
    assert len(demo_env["progress"]) > 0
    print("[PASS] Environment layer coordinate transformation and sampling passed")

if __name__ == "__main__":
    print("========================================")
    print("RUNNING GEOSPATIAL & GIS TEST SUITE")
    print("========================================")
    test_metric_bounds()
    test_slope_and_aspect()
    test_hillshade()
    test_contour_levels()
    test_statistical_validation()
    test_real_vs_demo_mode()
    test_elevation_profile_metrics()
    test_environment_service()
    print("========================================")
    print("ALL 8 GEOSPATIAL TEST MODULES PASSED! [OK]")
    print("========================================")

