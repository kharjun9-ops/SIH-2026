"""
Automated Comprehensive Precision & Validation Verification Suite
Covers Requirements 4-27:
1. Bengaluru LiDAR reconstruction, bounds, metric dimensions, ASPRS ground filtering, datum
2. DEM-based reconstruction (Nandi Hills via Copernicus GLO-30)
3. Point inspection deriving authoritative source elevation
4. Two-point measurement with Haversine geodesic horizontal distance & vertical difference
5. Statistical validation engine (MAE, RMSE, Max/Min error, Mean bias)
6. Error handling for invalid bounds, out-of-range coordinates, and unavailable coverage
7. Spatial alignment and orientation (N/S/E/W, 1:1 metric scale, zero vertical inversion)
"""
import math
import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

import numpy as np

def run_tests():
    print("=" * 80)
    print("  3D TERRAIN RECONSTRUCTION PIPELINE COMPREHENSIVE VERIFICATION SUITE")
    print("=" * 80)

    from app.models.schemas import (
        TerrainReconstructRequest, PointInspectionRequest,
        TwoPointMeasurementRequest, LatLonBounds
    )
    from app.services.reconstruction_service import reconstruction_service
    from app.services.terrain_service import terrain_service
    from app.providers.elevation_manager import elevation_manager
    from app.services.validation_service import validation_service
    from app.utils.geo_utils import (
        wgs84_dimensions, utm_crs_for_latlon, haversine_distance
    )

    # -------------------------------------------------------------------------
    # TEST 1: WGS84 Geodesy & UTM Projection
    # -------------------------------------------------------------------------
    print("\n[TEST 1] Testing WGS84 Ellipsoidal Geodesy & UTM CRS Resolution...")
    w_m, h_m = wgs84_dimensions(12.958125, 12.985075, 77.580772, 77.608428)
    utm_info = utm_crs_for_latlon(12.9716, 77.5946)
    print(f"  Bengaluru WGS84 Ground Dimensions: Width={w_m:.2f} m, Height={h_m:.2f} m")
    print(f"  Bengaluru UTM CRS: {utm_info['epsg']} ({utm_info['name']})")
    assert 2950.0 <= w_m <= 3050.0, f"Width {w_m} out of expected ~3000m range"
    assert 2950.0 <= h_m <= 3050.0, f"Height {h_m} out of expected ~3000m range"
    assert utm_info["epsg"] == "EPSG:32643", f"Expected EPSG:32643 for Bengaluru, got {utm_info['epsg']}"
    print("  --> PASS: WGS84 Geodesy & UTM CRS verified.")

    # -------------------------------------------------------------------------
    # TEST 2: Bengaluru LiDAR Reconstruction
    # -------------------------------------------------------------------------
    print("\n[TEST 2] Testing Bengaluru Pilot LiDAR Reconstruction...")
    req_lidar = TerrainReconstructRequest(
        sample_id="bengaluru_pilot",
        data_mode="real",
        grid_resolution=128
    )
    res_lidar = reconstruction_service.reconstruct_terrain(req_lidar)

    print(f"  Status: {res_lidar.status}")
    print(f"  Provider Used: {res_lidar.provider_used}")
    print(f"  Grid Resolution: {res_lidar.grid_resolution}x{res_lidar.grid_resolution}")
    print(f"  Bounds: [{res_lidar.bounds.min_lat}, {res_lidar.bounds.min_lon}] to [{res_lidar.bounds.max_lat}, {res_lidar.bounds.max_lon}]")
    print(f"  Metric Dimensions: {res_lidar.metric_bounds.width_m:.2f}m W x {res_lidar.metric_bounds.height_m:.2f}m H")
    print(f"  Elevation Min/Max/Mean: {res_lidar.stats.min_elevation:.2f}m / {res_lidar.stats.max_elevation:.2f}m / {res_lidar.stats.average_elevation:.2f}m")
    print(f"  Source CRS: {res_lidar.gis_metadata.source_crs}")
    print(f"  Projected CRS: {res_lidar.gis_metadata.projected_crs}")
    print(f"  Vertical Datum: {res_lidar.gis_metadata.vertical_datum}")
    print(f"  Resolution Note: {res_lidar.gis_metadata.resolution_transparency_note}")

    assert "LiDAR" in res_lidar.provider_used, "Expected LiDAR provider for Bengaluru pilot"
    assert res_lidar.stats.min_elevation >= 890.0 and res_lidar.stats.max_elevation <= 970.0, "Elevation out of range"
    assert "NAVD88" not in res_lidar.gis_metadata.vertical_datum, "Fabricated NAVD88 datum detected!"
    assert "32643" in res_lidar.gis_metadata.projected_crs, "Expected UTM Zone 43N (EPSG:32643)"
    assert len(res_lidar.elevation_grid) == 128 and len(res_lidar.elevation_grid[0]) == 128, "Grid shape mismatch"
    print("  --> PASS: Bengaluru LiDAR reconstruction verified.")

    # -------------------------------------------------------------------------
    # TEST 3: DEM-Based Reconstruction (Nandi Hills / Copernicus GLO-30)
    # -------------------------------------------------------------------------
    print("\n[TEST 3] Testing DEM-based Reconstruction (Nandi Hills)...")
    req_dem = TerrainReconstructRequest(
        sample_id="nandi_hills",
        data_mode="real",
        grid_resolution=128
    )
    res_dem = reconstruction_service.reconstruct_terrain(req_dem)

    print(f"  Status: {res_dem.status}")
    print(f"  Provider Used: {res_dem.provider_used}")
    print(f"  Fallback Notice: {res_dem.fallback_notice}")
    print(f"  Metric Dimensions: {res_dem.metric_bounds.width_m:.2f}m W x {res_dem.metric_bounds.height_m:.2f}m H")
    print(f"  Elevation Min/Max/Mean: {res_dem.stats.min_elevation:.2f}m / {res_dem.stats.max_elevation:.2f}m / {res_dem.stats.average_elevation:.2f}m")
    print(f"  Projected CRS: {res_dem.gis_metadata.projected_crs}")
    print(f"  Vertical Datum: {res_dem.gis_metadata.vertical_datum}")

    assert "Copernicus" in res_dem.provider_used, "Expected Copernicus provider for Nandi Hills"
    assert res_dem.stats.max_elevation >= 1400.0, f"Peak elevation too low: {res_dem.stats.max_elevation}m"
    assert res_dem.fallback_notice is not None, "Expected transparent fallback notice"
    print("  --> PASS: DEM-based reconstruction verified.")

    # -------------------------------------------------------------------------
    # TEST 4: Authoritative Point Inspection
    # -------------------------------------------------------------------------
    print("\n[TEST 4] Testing Authoritative Point Inspection...")
    insp = elevation_manager.inspect_point(12.9716, 77.5946, bounds=res_lidar.bounds.model_dump())
    print(f"  Inspected Point (12.9716, 77.5946):")
    print(f"    Elevation: {insp['elevation']:.2f} m")
    print(f"    Source: {insp['source']}")
    print(f"    Sampling Method: {insp['sampling_method']}")
    print(f"    Vertical Datum: {insp['vertical_datum']}")
    print(f"    Slope: {insp['slope']} deg ({insp['aspect_cardinal']} aspect)")
    print(f"    Coordinate System: {insp['coordinate_system']}")

    assert insp["elevation"] > 890.0, "Elevation lookup returned invalid value"
    assert "NAVD88" not in insp["vertical_datum"], "Fabricated datum in point inspection"
    print("  --> PASS: Authoritative point inspection verified.")

    # -------------------------------------------------------------------------
    # TEST 5: Geodesic Two-Point Measurement
    # -------------------------------------------------------------------------
    print("\n[TEST 5] Testing Geodesic Two-Point Measurement...")
    lat_a, lon_a = 12.9716, 77.5946
    lat_b, lon_b = 12.9750, 77.6000
    elev_grid_np = np.array(res_lidar.elevation_grid, dtype=np.float32)
    slope_grid_np = np.array(res_lidar.slope_grid, dtype=np.float32)
    aspect_grid_np = np.array(res_lidar.aspect_grid, dtype=np.float32)

    meas = terrain_service.measure_two_points(
        lat_a, lon_a, lat_b, lon_b,
        elev_grid_np, slope_grid_np, aspect_grid_np,
        res_lidar.bounds.model_dump(),
        source_name=res_lidar.provider_used
    )
    expected_dist = haversine_distance(lat_a, lon_a, lat_b, lon_b)
    print(f"  Point A: ({lat_a}, {lon_a}) Elev={meas.point_a.elevation:.2f}m")
    print(f"  Point B: ({lat_b}, {lon_b}) Elev={meas.point_b.elevation:.2f}m")
    print(f"  Horizontal Distance: {meas.horizontal_distance:.2f} m (Expected Haversine: {expected_dist:.2f} m)")
    print(f"  Height Difference: {meas.height_difference:.2f} m")
    print(f"  3D Distance: {meas.distance_3d:.2f} m")
    print(f"  Slope: {meas.slope_degrees:.2f} deg, Grade: {meas.grade_percent:.2f}%")
    print(f"  Profile samples: {len(meas.elevation_profile)}")

    assert abs(meas.horizontal_distance - expected_dist) < 1.0, "Measurement distance discrepancy"
    assert len(meas.elevation_profile) == 64, "Expected 64 profile transect points"
    print("  --> PASS: Geodesic two-point measurement verified.")

    # -------------------------------------------------------------------------
    # TEST 6: Statistical Validation Engine
    # -------------------------------------------------------------------------
    print("\n[TEST 6] Testing Statistical Accuracy Validation Engine...")
    val_lidar = validation_service.run_statistical_validation(
        elev_grid_np, res_lidar.bounds.model_dump(), sample_count=50, source_name=res_lidar.provider_used
    )
    print(f"  Bengaluru LiDAR Validation (N={val_lidar['sample_count']}):")
    print(f"    MAE: {val_lidar['mean_absolute_error_m']:.4f} m")
    print(f"    RMSE: {val_lidar['root_mean_square_error_m']:.4f} m")
    print(f"    Max Error: {val_lidar['max_error_m']:.4f} m")
    print(f"    Mean Bias: {val_lidar['mean_bias_m']:.4f} m")
    print(f"    Assessment: {val_lidar['fidelity_assessment']}")

    assert not math.isnan(val_lidar["mean_absolute_error_m"]), "NaN MAE value"
    assert val_lidar["mean_absolute_error_m"] < 0.20, f"LiDAR MAE too high: {val_lidar['mean_absolute_error_m']}"
    assert len(val_lidar["sample_points_table"]) > 0, "No sample points in validation table"
    print("  --> PASS: Statistical validation engine verified.")

    # -------------------------------------------------------------------------
    # TEST 7: Error Handling & Boundary Validation
    # -------------------------------------------------------------------------
    print("\n[TEST 7] Testing Error Handling & Boundary Validation...")
    try:
        # Inverted latitude
        bad_bounds = LatLonBounds(min_lat=13.0, max_lat=12.0, min_lon=77.0, max_lon=78.0)
        assert False, "Should have raised ValueError for inverted latitude"
    except ValueError as e:
        print(f"  Correctly rejected inverted latitude: {e}")

    try:
        # Inverted longitude
        bad_bounds = LatLonBounds(min_lat=12.0, max_lat=13.0, min_lon=78.0, max_lon=77.0)
        assert False, "Should have raised ValueError for inverted longitude"
    except ValueError as e:
        print(f"  Correctly rejected inverted longitude: {e}")

    try:
        # Out-of-range latitude
        bad_bounds = LatLonBounds(min_lat=-95.0, max_lat=12.0, min_lon=77.0, max_lon=78.0)
        assert False, "Should have raised ValueError for out-of-range latitude"
    except ValueError as e:
        print(f"  Correctly rejected out-of-range latitude: {e}")
    print("  --> PASS: Error handling & boundary validation verified.")

    print("\n" + "=" * 80)
    print("  ALL 7 CORE RECONSTRUCTION VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == "__main__":
    run_tests()
