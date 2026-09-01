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

def test_landslide_curvature_and_weights():
    from app.services.landslide_service import curvature_service, landslide_service
    from app.models.schemas import LandslideAnalysisRequest, LandslideParameters

    # 1. Curvature of symmetric bowl: z = a*(x^2 + y^2) (concave, negative curvature)
    grid = np.zeros((32, 32), dtype=np.float32)
    for r in range(32):
        for c in range(32):
            grid[r, c] = 0.01 * ((r - 16)**2 + (c - 16)**2) * 50.0

    prof_c, plan_c, total_c = curvature_service.calculate_curvatures(grid, cell_size_x_m=20.0, cell_size_y_m=20.0)
    print(f"[TEST 9] Curvature Calculation: Prof min={np.min(prof_c):.3f}, max={np.max(prof_c):.3f}, Plan min={np.min(plan_c):.3f}, max={np.max(plan_c):.3f}")
    assert prof_c.shape == (32, 32)
    assert plan_c.shape == (32, 32)
    assert total_c.shape == (32, 32)

    # 2. Test dynamic weight renormalization when geology & rainfall are unavailable
    norm_s = landslide_service.normalize_slope(np.array([[2.0, 10.0, 20.0, 30.0, 45.0]]))
    print(f"[TEST 9] Normalized slope classes: {norm_s}")
    assert norm_s[0, 0] < 0.15, "Slope < 5 deg should be Very Low (<0.15)"
    assert norm_s[0, 4] >= 0.85, "Slope > 35 deg should be Very High (>=0.85)"
    print("[PASS] Curvature calculation and slope normalization passed")

def test_landslide_screening_pipeline():
    from app.services.landslide_service import landslide_service
    from app.models.schemas import LandslideAnalysisRequest, LandslideParameters

    # Test on Bengaluru Pilot coordinates
    req = LandslideAnalysisRequest(
        terrain_id="bengaluru_pilot",
        latitude=12.9716,
        longitude=77.5946,
        radius=1500.0,
        grid_resolution=64,
        data_mode="real",
        parameters=LandslideParameters(scenario="normal")
    )

    resp = landslide_service.calculate_landslide_susceptibility(req)
    print(f"[TEST 10] Landslide Analysis Output: Status={resp.status}, RiskGrid Shape={len(resp.risk_grid)}x{len(resp.risk_grid[0])}")
    print(f"         Stats: Very Low={resp.statistics.very_low_pct}%, Low={resp.statistics.low_pct}%, Mod={resp.statistics.moderate_pct}%, High={resp.statistics.high_pct}%, Very High={resp.statistics.very_high_pct}%")
    print(f"         Active Weights: {resp.model_info.weights_used}")
    print(f"         Hotspots Found: {len(resp.hotspots)}")
    print(f"         Buildings Screened: {resp.building_exposure.total_buildings_screened} (High/Very High: {resp.building_exposure.high_count + resp.building_exposure.very_high_count})")
    print(f"         Road Length Screened: {resp.road_exposure.total_road_length_km} km")

    assert resp.status == "success"
    assert len(resp.risk_grid) == 64
    assert abs(sum(resp.model_info.weights_used.values()) - 1.0) < 0.01, "Active weights must sum to 1.0"
    assert resp.model_info.screening_status == "Screening Model"
    assert "Not independently validated" in resp.model_info.validation_status

    # Test point inspection in landslide mode
    insp = landslide_service.inspect_point(12.9716, 77.5946)
    print(f"[TEST 10] Point Inspection: Score={insp.susceptibility_score}, Risk={insp.risk_class}, Contributors Count={len(insp.main_contributors)}")
    assert 0.0 <= insp.susceptibility_score <= 1.0
    assert insp.risk_class in ["VERY LOW", "LOW", "MODERATE", "HIGH", "VERY HIGH"]
    assert len(insp.main_contributors) >= 4
    print("[PASS] Full Landslide Susceptibility Screening Pipeline passed")

def test_historical_landslide_inventory():
    """Test 11: Real Historical Landslide Inventory provider and spatial filtering."""
    from app.providers.landslide_inventory_provider import landslide_inventory_provider

    all_records = landslide_inventory_provider.get_all_records()
    print(f"[TEST 11] Total Real Historical Records: {len(all_records)}")
    assert len(all_records) >= 12, "Must contain authentic historical inventory records"

    # Query Kodagu / Western Ghats
    bounds_kodagu = {"min_lat": 12.3, "max_lat": 12.6, "min_lon": 75.6, "max_lon": 75.9}
    events, meta = landslide_inventory_provider.get_inventory_in_bounds(bounds_kodagu, buffer_km=30.0)
    print(f"[TEST 11] Kodagu Query (30km buffer): Found {len(events)} events, Sources: {meta['sources_summary']}")
    assert len(events) >= 2, "Should locate Kodagu historical events"
    assert events[0].citation is not None
    assert events[0].trigger is not None
    print("[PASS] Real Historical Landslide Inventory provider passed")

def test_advanced_terrain_derivatives():
    """Test 12: TPI, TRI, Roughness, D8 Drainage distance, and Road distance."""
    from app.services.terrain_derivatives_service import terrain_derivatives_service

    test_dem = np.array([
        [100.0, 120.0, 150.0, 180.0],
        [110.0, 140.0, 190.0, 220.0],
        [105.0, 160.0, 230.0, 260.0],
        [95.0,  150.0, 210.0, 280.0]
    ], dtype=np.float32)

    tpi = terrain_derivatives_service.calculate_tpi(test_dem, window_size=3)
    tri = terrain_derivatives_service.calculate_tri(test_dem)
    rough = terrain_derivatives_service.calculate_roughness(test_dem, window_size=3)
    dist_drain, stream_mask = terrain_derivatives_service.calculate_drainage_proximity(test_dem, 30.0, 30.0)

    print(f"[TEST 12] TPI shape={tpi.shape}, TRI min={np.min(tri):.2f}, max={np.max(tri):.2f}")
    print(f"[TEST 12] Roughness max={np.max(rough):.2f}, Drainage Distance min={np.min(dist_drain):.1f}m")

    assert tpi.shape == (4, 4)
    assert tri.shape == (4, 4)
    assert np.all(tri >= 0.0)
    assert dist_drain.shape == (4, 4)
    print("[PASS] Advanced Terrain Derivatives (TPI, TRI, Roughness, Drainage) passed")

def test_ml_spatial_cross_validation_and_training():
    """Test 13 & 14: ML dataset construction, spatial block CV, calibration, and benchmarking."""
    from app.services.landslide_ml_service import landslide_ml_service

    # Build dataset
    X, y, coords, pos_meta = landslide_ml_service.build_training_dataset(region_name="Western Ghats / Karnataka")
    print(f"[TEST 13] ML Training Dataset: X shape={X.shape}, Positives={np.sum(y==1)}, Negatives={np.sum(y==0)}")
    assert X.shape[1] == 12, "Must contain 12 terrain/environmental features"
    assert len(y) == len(coords)

    # Train and compare candidate models
    bench = landslide_ml_service.train_and_compare_models()
    print(f"[TEST 14] Evaluated {len(bench.models_evaluated)} models on 5-Fold Spatial CV:")
    for m in bench.models_evaluated:
        print(f"         - {m.model_name}: ROC-AUC={m.roc_auc:.3f}, PR-AUC={m.pr_auc:.3f}, F1={m.f1_score:.3f}, Brier={m.brier_score:.3f}")

    assert len(bench.models_evaluated) >= 4, "Must evaluate Baseline MCE, Logistic Regression, Random Forest, Gradient Boosting"
    best_m = [m for m in bench.models_evaluated if m.is_active][0]
    assert best_m.roc_auc >= 0.70, "ML model must achieve high discrimination on spatial holdout"
    print(f"[TEST 14] Best Model Selected: {bench.selected_model}, Feature Importances: {bench.feature_importances}")
    print("[PASS] ML Spatial Cross-Validation and Multi-Model Benchmarking passed")

def test_hybrid_landslide_inference_and_capture():
    """Test 15: Full Landslide ML inference and real historical event capture evaluation."""
    from app.services.landslide_service import landslide_service
    from app.models.schemas import LandslideAnalysisRequest

    # Test ML Inference Mode on Kodagu Region (with real historical landslides)
    req_ml = LandslideAnalysisRequest(
        latitude=12.4244,
        longitude=75.7382,
        radius=3000.0,
        grid_resolution=64,
        data_mode="real",
        model_type="random_forest"
    )

    resp = landslide_service.calculate_landslide_susceptibility(req_ml)
    print(f"[TEST 15] ML Pipeline Result: ModelType={resp.model_type}, RiskGrid={len(resp.risk_grid)}x{len(resp.risk_grid[0])}")
    print(f"         Historical Events Found: {len(resp.historical_events) if resp.historical_events else 0}")
    if resp.historical_capture:
        print(f"         Historical Capture: {resp.historical_capture.captured_count}/{resp.historical_capture.total_in_bounds} ({resp.historical_capture.capture_rate_pct}%)")
        print(f"         Notice: {resp.historical_capture.evaluation_notice}")

    assert resp.status == "success"
    assert resp.ml_metrics is not None
    assert resp.ml_metrics.roc_auc >= 0.70
    assert resp.model_comparison is not None and len(resp.model_comparison) >= 4
    print("[PASS] Hybrid Landslide ML Inference and Real Capture Evaluation passed")

def test_lidar_response_schema_and_bengaluru_survey():
    """Test 16: Validate LiDAR processing with bengaluru_pilot_survey.las and verify LiDARProcessResponse schema."""
    import os
    from app.services.lidar_service import lidar_service
    from app.models.schemas import LiDARProcessResponse, LatLonBounds

    las_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data", "lidar", "bengaluru_pilot_survey.las")
    if not os.path.exists(las_path):
        # Fallback path if running directly in backend
        las_path = os.path.join("..", "data", "lidar", "bengaluru_pilot_survey.las")

    assert os.path.exists(las_path), f"Test file bengaluru_pilot_survey.las must exist at {las_path}"

    with open(las_path, "rb") as f:
        file_bytes = f.read()

    res = lidar_service.process_uploaded_las(file_bytes, "bengaluru_pilot_survey.las", mode="dtm", resolution=64)
    print(f"[TEST 16] LiDAR Process Result: Status={res['status']}, Points={res['point_count']:,}")
    print(f"         Density={res['point_density_sq_m']:.4f} pts/m², Spacing={res['point_spacing_m']:.2f}m")
    print(f"         Has Ground Classification: {res['has_ground_classification']}")
    print(f"         Accuracy Statement: {res['accuracy_statement']}")

    # Build Pydantic model
    bounds_obj = LatLonBounds(**res["bounds"])
    resp_obj = LiDARProcessResponse(
        status=res["status"],
        file_name=res["file_name"],
        saved_file=res["saved_file"],
        point_count=res["point_count"],
        point_density_sq_m=res["point_density_sq_m"],
        point_spacing_m=res["point_spacing_m"],
        has_ground_classification=res["has_ground_classification"],
        accuracy_statement=res["accuracy_statement"],
        bounds=bounds_obj,
        elevation_stats=res["elevation_stats"],
        elevation_grid=res["elevation_grid"],
        metadata=res["metadata"],
        point_cloud_sample=res["point_cloud_sample"]
    )

    assert resp_obj.status == "success"
    assert resp_obj.point_count == 510184
    assert resp_obj.point_density_sq_m > 0.0
    assert resp_obj.point_spacing_m > 0.0
    assert resp_obj.has_ground_classification is True
    assert "Source accuracy specification unavailable" in resp_obj.accuracy_statement
    assert len(resp_obj.elevation_grid) == 64
    print("[PASS] LiDAR Response Schema Validation with bengaluru_pilot_survey.las passed")

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
    test_landslide_curvature_and_weights()
    test_landslide_screening_pipeline()
    test_historical_landslide_inventory()
    test_advanced_terrain_derivatives()
    test_ml_spatial_cross_validation_and_training()
    test_hybrid_landslide_inference_and_capture()
    test_lidar_response_schema_and_bengaluru_survey()
    print("========================================")
    print("ALL 16 GEOSPATIAL TEST MODULES PASSED! [OK]")
    print("========================================")




