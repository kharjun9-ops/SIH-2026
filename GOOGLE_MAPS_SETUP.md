# Google Maps Platform Integration & Security Guide (SIH26175)

This guide explains how to configure and secure your **Google Maps JavaScript API** key for the SIH26175 3D terrain reconstruction system.

---

## 1. Create a Google Cloud Project
1. Visit the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** $\to$ **New Project**.
3. Name your project (e.g. `SIH26175-3D-Terrain`) and click **Create**.

---

## 2. Enable Required APIs
Navigate to **APIs & Services $\to$ Library** and enable only the following APIs:
* **Maps JavaScript API** (Required for 2D/Satellite/Hybrid map view, markers, and rectangle overlays)
* **Places API** (Required for location search & autocomplete)
* **Geocoding API** (Required for converting search text to coordinates)

> [!NOTE]
> Do NOT enable or authorize unused server-side APIs on this client-facing browser key.

---

## 3. Create & Restrict Your API Key
1. Go to **APIs & Services $\to$ Credentials**.
2. Click **Create Credentials $\to$ API key**.
3. Name your key: `SIH26175-Frontend-Key`.
4. Under **Application restrictions**, select **Websites (HTTP referrers)**.
5. Add the allowed domains:
   - **Localhost Development**: `http://localhost:5173/*`, `http://127.0.0.1:5173/*`
   - **Production**: `https://your-domain.com/*`
6. Under **API restrictions**, select **Restrict key** and choose:
   - *Maps JavaScript API*
   - *Places API*
   - *Geocoding API*
7. Click **Save**.

---

## 4. Add the Key to Your Application
Create a `.env` file in the `frontend/` directory (or copy from `frontend/.env.example`):
```bash
# frontend/.env
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...YourKeyHere
```

Restart your Vite development server:
```bash
npm run dev
```

---

## 5. Architectural Boundaries & Data Ownership
* **Google Maps is the Input & Navigation Layer**: Used for Places search, geocoding, area selection, and 2D/Satellite context.
* **Our Authoritative 3D Reconstruction**: All 3D terrain meshes, heights, contours, slope, and GLB exports are computed from **Copernicus DEM GLO-30 / SRTM / LiDAR point clouds + OpenStreetMap footprint extrusions + Three.js**.
* **Zero Scraped 3D Tiles**: Google's Photorealistic 3D mesh is never extracted or substituted for our 3D physical terrain models.
