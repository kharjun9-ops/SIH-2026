# Monocular Depth Estimation & 3D Surface Reconstruction Guide
## SIH 2026 Problem Statement Extension

This extension integrates optical single-view depth estimation directly into the existing geospatial 3D terrain reconstruction platform.

---

## 1. High-Level Architecture

```
                       OPTICAL RGB IMAGE
                              │
            ┌─────────────────┴─────────────────┐
            │                                   │
      MODE 1 (PNG / JPG)                  MODE 2 (GeoTIFF)
      Non-Georeferenced                   Georeferenced (CRS + Affine)
            │                                   │
            ▼                                   ▼
   Monocular Depth Estimation          Monocular Depth Estimation
   (MiDaS DPT-Hybrid / OpenCV)        (MiDaS DPT-Hybrid / OpenCV)
            │                                   │
            ▼                                   ▼
    Relative Depth Map                  Relative Depth Map
   (Normalized 0.0 - 1.0)              (Normalized 0.0 - 1.0)
            │                                   │
            │                         Scale Calibration
            │                         (Copernicus GLO-30 / SRTM)
            │                                   │
            ▼                                   ▼
   Relative DSM (rDSM)                 Metric DSM (Elevation in meters)
   (Arbitrary units 0-1)               (Only if R² >= 0.35 & RMSE <= 25m)
            │                                   │
            └─────────────────┬─────────────────┘
                              │
                              ▼
                     Terrain Derivatives
                  (Slope, Aspect, Hillshade)
                              │
                              ▼
                      3D Surface Mesh
                  (64x64 to 512x512 Grid)
                              │
                              ▼
                   RGB Texture Draping
                              │
                              ▼
           Interactive 3D Flythrough / Orbit Viewer
                (Three.js / React Three Fiber)
```

---

## 2. Input Modes & Behavior

### Mode 1: Non-Georeferenced Imagery (PNG, JPG, JPEG, WEBP)
- **Use Case**: Drone imagery, aerial photos, satellite crops without embedded spatial tags.
- **Elevation Model**: **Relative Digital Surface Model (rDSM)**.
- **Elevation Units**: Normalized relative scale ($[0.0, 1.0]$ where $1.0 = \text{highest/closest}$, $0.0 = \text{lowest/farthest}$).
- **Scientific Notice**: Clearly displayed to prevent misrepresentation as surveyed metric data.

### Mode 2: Georeferenced Imagery (GeoTIFF / TIFF)
- **Use Case**: Orthomosaics, geocoded aerial tiles with embedded CRS and affine transformation.
- **Spatial Metadata Extracted**:
  - Coordinate Reference System (CRS) e.g., EPSG:4326, EPSG:32643
  - Pixel size in ground units (meters or degrees)
  - Geographic bounding box (WGS84 Lat/Lon)
- **Scale Calibration Engine**:
  - Samples elevation reference grid from Copernicus GLO-30 or SRTM.
  - Computes linear regression ($Z = s \cdot d + b$) between relative depth ($d$) and ground elevation ($Z$).
  - Validates statistical confidence ($R^2$ coefficient of determination, RMSE).
  - If $R^2 \ge 0.35$ and RMSE is reasonable, yields **Metric DSM (meters)**.
  - If reference data is uncorrelated or missing, safely defaults to **Relative DSM** with an explanatory advisory.

---

## 3. Depth Estimation Models

1. **MiDaS DPT-Hybrid / DPT-Large (Neural Network)**:
   - Uses Vision Transformer (ViT) backbone trained on multi-dataset RGB depth.
   - Automatically loaded and cached when PyTorch is available.
2. **OpenCV Multi-Cue Estimator (Fast Fallback)**:
   - Zero-dependency algorithm combining:
     - Multi-scale gradient and Laplacian texture density.
     - Dark Channel Prior (atmospheric haze / aerial perspective).
     - Vertical position prior.
     - Bilateral edge-preserving filtering.
   - Executes in $< 50\text{ms}$ on CPU.

---

## 4. Frontend Experience ("Image → 3D" Page)

- **Access**: Located directly in the top navigation bar between **Reconstruct** and **3D Studio**.
- **Features**:
  - Drag-and-drop or file selector with instant format detection (Mode 1 vs Mode 2).
  - Configurable resolution ($64\times 64$, $128\times 128$, $256\times 256$, $512\times 512$).
  - Model preference selector (Auto, MiDaS Neural, OpenCV Fast).
  - Tabbed viewer:
    1. **Colorized Depth Map**: Turbo colormap visualization with min/mean/max stats.
    2. **Raw Depth**: Grayscale depth representation.
    3. **3D Surface Studio**: Interactive Three.js canvas with original RGB draped as texture, orbit/flythrough navigation, wireframe toggle, height exaggeration slider, and full-screen support.
    4. **Pipeline Audit**: Real-time step-by-step processing log with timestamps and scientific notices.

---

## 5. API Endpoints

### `POST /api/depth/process`
Unified processing endpoint for single-view images and GeoTIFFs.

**Form Parameters**:
- `file`: Image file (`.png`, `.jpg`, `.jpeg`, `.webp`, `.tif`, `.tiff`)
- `grid_resolution`: Integer between 64 and 512 (default: 256)
- `depth_model`: `'auto'`, `'midas'`, or `'opencv'` (default: `'auto'`)
- `calibration_mode`: `'auto'`, `'reference_dem'`, or `'none'` (default: `'auto'`)

### `GET /api/depth/result/{job_id}`
Retrieve a cached pipeline output by its 16-character Job ID.

### `GET /api/depth/capabilities`
Inspect runtime depth model availability, supported extensions, and calibration providers.

---

## 6. Verification & Automated Tests

Run the standalone verification suite:
```powershell
python "..\scratch\test_depth_pipeline.py"
python "..\scratch\test_pipeline_precision.py"
```
Both test suites validate:
- WGS84 geodesy & UTM projection calculations.
- Monocular depth prediction fidelity (MiDaS + OpenCV fallback).
- Spatial metadata extraction & reference DEM calibration safeguards.
- 3D surface mesh vertex/index generation and RGB texture draping.
