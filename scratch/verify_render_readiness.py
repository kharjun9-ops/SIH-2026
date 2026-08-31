import httpx
import os
import sys

API_BASE = "http://127.0.0.1:8000"

print("=" * 80)
print("             RENDER DEPLOYMENT READINESS VERIFICATION AUDIT")
print("=" * 80)

with httpx.Client(timeout=30.0) as client:
    # 1. Health Check Endpoint
    res = client.get(f"{API_BASE}/health")
    print(f"\n[1] GET /health check:")
    print(f"  • Status Code: {res.status_code}")
    print(f"  • Response:    {res.json()}")
    assert res.status_code == 200
    assert res.json() == {"status": "healthy"}

    # 2. Root API Endpoint
    res = client.get(f"{API_BASE}/")
    print(f"\n[2] GET / root endpoint:")
    print(f"  • Status Code: {res.status_code}")
    print(f"  • Project:     {res.json().get('project')}")
    assert res.status_code == 200

    # 3. Sample Regions Endpoint
    res = client.get(f"{API_BASE}/api/terrain/samples")
    print(f"\n[3] GET /api/terrain/samples:")
    print(f"  • Samples Count: {len(res.json().get('samples', []))}")
    assert res.status_code == 200

    # 4. Terrain Reconstruction & GLB Export Endpoint (Bengaluru Pilot)
    bounds = {
        "min_lat": 12.958125,
        "max_lat": 12.985075,
        "min_lon": 77.580772,
        "max_lon": 77.608428,
        "center_lat": 12.9716,
        "center_lon": 77.5946,
        "radius_meters": 1500
    }
    recon_payload = {
        "bounds": bounds,
        "grid_resolution": 128,
        "data_mode": "real"
    }
    res = client.post(f"{API_BASE}/api/terrain/reconstruct", json=recon_payload)
    print(f"\n[4] POST /api/terrain/reconstruct:")
    print(f"  • Status Code:     {res.status_code}")
    d = res.json()
    print(f"  • Terrain Source:  {d.get('source_info')}")
    print(f"  • Elevation Range: {d.get('stats', {}).get('min_elevation')}m to {d.get('stats', {}).get('max_elevation')}m")
    print(f"  • Grid Shape:      {len(d.get('elevation_grid', []))}x{len(d.get('elevation_grid', [[]])[0])}")
    assert res.status_code == 200

    # 5. Environment Layers Endpoint (Buildings + LiDAR Heights, Roads, Water)
    env_payload = {
        "bounds": bounds,
        "layers": ["buildings", "roads", "water", "landmarks"],
        "data_mode": "real"
    }
    res = client.post(f"{API_BASE}/api/environment/layers", json=env_payload)
    print(f"\n[5] POST /api/environment/layers:")
    print(f"  • Status Code:         {res.status_code}")
    env = res.json()
    bld_cnt = len(env.get("buildings", []))
    road_cnt = len(env.get("roads", []))
    water_cnt = len(env.get("water", []))
    lidar_cnt = env.get("building_height_summary", {}).get("lidar_count", 0)
    print(f"  • Reconstructed Bldgs: {bld_cnt}")
    print(f"  • LiDAR Height Bldgs:  {lidar_cnt} ({env.get('building_height_summary', {}).get('lidar_coverage_pct')}%)")
    print(f"  • Reconstructed Roads: {road_cnt}")
    print(f"  • Reconstructed Water: {water_cnt}")
    assert res.status_code == 200
    assert bld_cnt > 0
    assert road_cnt > 0

    # 6. GLB Export Endpoint (Returns binary GLB)
    res = client.post(f"{API_BASE}/api/terrain/export", json={"bounds": bounds, "format": "glb"})
    print(f"\n[6] POST /api/terrain/export (GLB 3D Export):")
    print(f"  • Status Code:     {res.status_code}")
    print(f"  • Content-Type:    {res.headers.get('content-type')}")
    print(f"  • Binary GLB Size: {len(res.content):,} bytes")
    assert res.status_code == 200
    assert len(res.content) > 1000

print("\n" + "=" * 80)
print("     ALL RENDER PREPARATION AUDIT TESTS PASSED SUCCESSFULLY (0 ERRORS)")
print("=" * 80)
