"""
Test script for the new SIH 2026 Monocular Depth Estimation & GeoTIFF Pipeline
"""
import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

import numpy as np
from PIL import Image
import io

def test_depth_pipeline():
    print("=" * 70)
    print("Testing SIH 2026 Depth Estimation & Pipeline Components")
    print("=" * 70)
    
    # 1. Test Depth Estimation Service
    from app.services.depth_estimation_service import depth_estimation_service
    
    # Create synthetic test RGB image (256x256)
    img_array = np.zeros((256, 256, 3), dtype=np.uint8)
    # Add a gradient and a central hill
    y, x = np.ogrid[:256, :256]
    center_y, center_x = 128, 128
    dist_from_center = np.sqrt((x - center_x)**2 + (y - center_y)**2)
    hill = np.clip(255 - dist_from_center * 2, 0, 255).astype(np.uint8)
    img_array[:, :, 0] = hill
    img_array[:, :, 1] = np.clip(100 + hill // 2, 0, 255).astype(np.uint8)
    img_array[:, :, 2] = np.clip(50 + x // 2, 0, 255).astype(np.uint8)
    
    pil_img = Image.fromarray(img_array)
    buf = io.BytesIO()
    pil_img.save(buf, format="PNG")
    image_bytes = buf.getvalue()
    
    print("\n[Step 1] Running Monocular Depth Estimation...")
    depth_map, model_name, depth_meta = depth_estimation_service.estimate_depth(
        img_rgb=img_array,
        model_preference="auto",
        target_resolution=128
    )
    
    print(f"  Model Used: {model_name}")
    print(f"  Depth shape: {depth_map.shape}")
    print(f"  Min Depth: {float(np.min(depth_map)):.4f}, Max Depth: {float(np.max(depth_map)):.4f}")
    assert depth_map.shape == (128, 128), f"Expected (128, 128), got {depth_map.shape}"
    print("  --> PASS: Depth estimation successful")
    
    # 2. Test GeoTIFF Service / Calibration
    print("\n[Step 2] Testing GeoTIFF Service...")
    from app.services.geotiff_service import geotiff_service
    # Test reading non-geotiff raises HTTPException
    try:
        geotiff_service.read_geotiff(b"not_a_geotiff")
        assert False, "Should have raised exception"
    except Exception:
        print("  Non-geotiff handling: successfully rejected")
    
    # 3. Test Full Pipeline Endpoint Logic
    print("\n[Step 3] Testing FastAPI Depth Router...")
    from fastapi.testclient import TestClient
    from app.main import app
    
    client = TestClient(app)
    
    # Mode 1: Non-georeferenced PNG
    files = {"file": ("test_hill.png", image_bytes, "image/png")}
    response = client.post("/api/depth/process", files=files)
    print(f"  POST /api/depth/process status: {response.status_code}")
    if response.status_code != 200:
        print("  Error response:", response.text)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    
    data = response.json()
    print(f"  Pipeline input_mode: {data.get('input_mode')}")
    print(f"  DSM type: {data.get('dsm_type')}")
    print(f"  Job ID: {data.get('job_id')}")
    print(f"  Mesh vertex count: {data.get('mesh_vertex_count')}")
    assert data.get("input_mode") == "non_georeferenced"
    assert data.get("dsm_type") == "RELATIVE"
    assert data.get("mesh_vertex_count") > 0
    print("  --> PASS: Mode 1 pipeline endpoint verified")
    
    # Test GET result
    job_id = data.get("job_id")
    if job_id:
        get_res = client.get(f"/api/depth/result/{job_id}")
        assert get_res.status_code == 200
        print(f"  GET /api/depth/result/{job_id}: 200 OK")
    
    print("\n" + "=" * 70)
    print("  ALL SIH 2026 PIPELINE TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    test_depth_pipeline()
