# SIH26175 — Advanced 3D Terrain Reconstruction & Geospatial Analysis Platform

An authoritative full-stack GIS, remote-sensing, computer-vision, and 3D graphics platform built for **Smart India Hackathon Problem Statement SIH26175**.

The application transforms real-world geographic coordinates, digital elevation models (DEMs), airborne LiDAR point clouds, and satellite imagery into **interactive 1:1 metric 3D terrain representations** with sub-pixel elevation inspection, statistical accuracy validation, and 7 visualization modes.

---

## 🏛️ System Architecture

```
                                  [ Map Interface / Search / Polygon ]
                                                   │
                                                   ▼
                                     [ Elevation Provider Manager ]
                                                   │
                ┌──────────────────────────────────┼──────────────────────────────────┐
                │                                  │                                  │
                ▼                                  ▼                                  ▼
      [ LiDAR Point Cloud ]              [ Copernicus GLO-30 ]               [ SRTM GL1 30m ]
    (LAS / LAZ / DTM Bare-Earth)           (ESA / AWS Open Data)          (NASA / USGS Terrarium)
                │                                  │                                  │
                └──────────────────────────────────┼──────────────────────────────────┘
                                                   │
                                                   ▼
                                [ Local Projected Coordinate System ]
                                  (WGS84 Equirectangular / UTM)
                                  X = meters E/W, Y = meters N/S,
                                    Z = true elevation in meters
                                                   │
                                                   ▼
                                    [ Geospatial Processing Engine ]
                              - Horn's Slope & Aspect (Degrees & Bearing)
                              - Analytical Hillshade (Azimuth & Altitude)
                              - Real Contour Intervals (5m, 10m, 20m, 50m)
                              - Statistical Validation (MAE, RMSE, Bias)
                                                   │
                                                   ▼
                                       [ Interactive 3D Engine ]
                                  - 7 Geospatial Material Modes
                                  - 1:1 Metric Scale (1 unit = 1 meter)
                                  - True North Orientation & 3D Scale Bar
                                  - Sub-Pixel Point Inspection & Profile
                                  - Export Metric 3D (.glb / .obj)
```

---

## 🚀 Key Features

### 1. Modular Elevation Provider Cascade
- **Automated Best-Source Selection**:
  1. **Airborne LiDAR Survey**: High-density point clouds (`.las`, `.laz`, `.tif`) with ASPRS Class 2 Ground Point filtering for bare-earth Digital Terrain Models (DTMs).
  2. **Authoritative Local GeoTIFF**: High-precision local survey rasters (`rasterio`).
  3. **Copernicus DEM GLO-30**: Global 30m elevation model published by the European Space Agency.
  4. **SRTM GL1 30m**: Global 1 arc-second radar elevation model from NASA/USGS.
- **Transparent Fallback Reporting**: When high-resolution LiDAR is unavailable for a region, the platform explicitly displays: *"High-resolution LiDAR unavailable for this region. Using SRTM ~30m DEM."*

### 2. Physical 1:1 Metric Geometry (Meters)
- Converts WGS84 latitude/longitude to a local metric tangent plane with $\cos(\text{latitude})$ distortion correction:
  $$\Delta X_m = (\lambda - \lambda_{\text{center}}) \times 111320 \times \cos(\phi_{\text{center}})$$
  $$\Delta Y_m = (\phi - \phi_{\text{center}}) \times 111320$$
  $$Z_m = \text{Raw DEM Elevation in Meters}$$
- **1 Three.js World Unit = Exactly 1 Real-World Meter** across all 3 axes ($X, Y, Z$).
- Default visual exaggeration is strictly **1.0x (Physical Scale)**.

### 3. Seven (7) Geospatial Visualization Modes
1. **Hypsometric Elevation Shading**: Continuous elevation color mapping (Topographic Earth, Viridis, Magma, Thermal Infrared, Forest Highlands, Satellite Elevation).
2. **Analytical Hillshade**: Shaded relief computed via Horn's formula with customizable Sun Azimuth ($0^\circ - 360^\circ$) and Sun Altitude ($0^\circ - 90^\circ$).
3. **Satellite Imagery Draping**: High-resolution Esri World Imagery tiles mapped onto the 3D terrain geometry.
4. **Hybrid Satellite + Hillshade**: Satellite imagery blended with analytical shaded relief for photorealistic mountain visualization.
5. **Topographic Slope Classification**: Standard geotechnical slope bins (0–5° Gentle, 5–15° Moderate, 15–30° Steep, 30–45° Very Steep, >45° Cliff).
6. **3D Wireframe Mesh**: Geometric topology and triangle density inspection.
7. **3D Point Cloud**: Interactive XYZ particle visualization for LiDAR and DEM point arrays.

### 4. Statistical Accuracy & Data Lineage Validation
- Compares the reconstructed 3D mesh geometry directly against the underlying raw source DEM/LiDAR across $N$ sample points (default 100).
- Computes standard geodetic metrics:
  - **MAE** (Mean Absolute Error): $\frac{1}{N} \sum |z_{\text{mesh}} - z_{\text{raw}}|$
  - **RMSE** (Root Mean Square Error): $\sqrt{\frac{1}{N} \sum (z_{\text{mesh}} - z_{\text{raw}})^2}$
  - **Maximum & Minimum Error**
  - **Mean Bias Error**
- Displays a transparent lineage breakdown of native resolution, vertical datum (EGM96), and interpolation methodology.

### 5. Terrain Cross-Section Elevation Profile
- Interactive distance-versus-elevation graph along any surface line between Point A and Point B.
- Computes total elevation gain, total elevation loss, surface distance, average slope, and max gradient.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Three.js, React Three Fiber, Drei, Leaflet, Lucide Icons |
| **Backend** | Python 3.11, FastAPI, Uvicorn, Pydantic v2 |
| **GIS & Math** | NumPy, SciPy, Rasterio, Trimesh, Shapely, Laspy, OpenCV |
| **Remote Sensing** | AWS Open Data Terrarium, Copernicus GLO-30, NASA SRTM GL1, Esri World Imagery |

---

## 💻 Quick Start & Running Locally

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 1. Start the Backend API
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at: `http://localhost:8000/docs`

### 2. Start the Frontend Application
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: `http://localhost:5173/`

### 3. Run Automated Geospatial Tests
```bash
cd backend
python tests/test_geospatial.py
```

---

## 📄 License & Attribution
- Elevation Data: NASA/USGS SRTM GL1, Copernicus GLO-30 (ESA), AWS Open Data.
- Satellite Imagery: Tiles &copy; Esri & GIS User Community.
- Built for Smart India Hackathon **SIH26175**.
