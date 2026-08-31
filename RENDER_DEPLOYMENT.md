# Render Deployment Guide — SIH26175 3D Terrain Reconstruction

This guide explains how to deploy the **SIH26175 3D Terrain Reconstruction Platform** on [Render](https://render.com) using a two-service architecture:
1. **Frontend**: Render Static Site (Vite + React + Three.js)
2. **Backend**: Render Web Service (FastAPI + Docker + GDAL/LiDAR/DEM tools)

---

## 🏛️ Deployment Architecture

```
                                  USER BROWSER
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
   RENDER STATIC SITE                                     RENDER WEB SERVICE
  (Vite + React + Leaflet)                                (FastAPI + Docker)
  URL: https://sih-frontend.onrender.com                  URL: https://sih-backend.onrender.com
  Build: `npm ci && npm run build`                        Runtime: Docker (Python 3.11)
  Publish: `dist`                                         Health Check: `/health`
             │                                                     │
             │─────── REST API Calls (`VITE_API_BASE_URL`) ────────┘
```

---

## 🚀 Step 1: Deploy Backend Web Service

1. Log in to [Render Dashboard](https://dashboard.render.com/) and click **New +** $\to$ **Web Service**.
2. Connect your Git repository (`SIH 1`).
3. Configure the Web Service settings:

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Name** | `sih26175-backend` | Or any unique name |
| **Region** | Oregon (US West) or Singapore | Choose closest to your users |
| **Branch** | `main` | Production branch |
| **Root Directory** | Leave blank or `backend` | Dockerfile handles path resolution |
| **Runtime** | **Docker** | Uses `backend/Dockerfile` |
| **Dockerfile Path** | `backend/Dockerfile` | Python 3.11 + GDAL/OpenCV dependencies |
| **Instance Type** | Free or Starter | 512 MB - 2 GB RAM recommended |
| **Health Check Path** | `/health` | Returns `{"status": "healthy"}` |

4. Configure **Environment Variables** in the Render Dashboard:

| Variable | Recommended Value | Description |
| :--- | :--- | :--- |
| `ALLOWED_ORIGINS` | `https://sih26175-frontend.onrender.com,http://localhost:5173` | Allowed CORS origins for frontend |
| `OPENTOPOGRAPHY_API_KEY` | *(Optional)* | For live Copernicus DEM API queries |

5. Click **Create Web Service**.
6. Wait for the Docker build to complete. Note your backend URL (e.g. `https://sih26175-backend.onrender.com`).

---

## 🌐 Step 2: Deploy Frontend Static Site

1. In the Render Dashboard, click **New +** $\to$ **Static Site**.
2. Connect the same Git repository.
3. Configure the Static Site settings:

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Name** | `sih26175-frontend` | Or any unique name |
| **Branch** | `main` | Production branch |
| **Root Directory** | `frontend` | Important: points to frontend workspace |
| **Build Command** | `npm ci && npm run build` | Builds TypeScript and Vite production bundle |
| **Publish Directory** | `dist` | Generated build artifacts |

4. Configure **Environment Variables** for the Static Site:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://sih26175-backend.onrender.com` | **Your backend URL from Step 1** |

5. Configure **Redirects / Rewrites** (for Single Page Application routing):
   - Under **Redirects/Rewrites**, add:
     - **Source**: `/*`
     - **Destination**: `/index.html`
     - **Action**: `Rewrite`

6. Click **Create Static Site**.
7. Once deployment finishes, open your frontend URL (e.g. `https://sih26175-frontend.onrender.com`).

---

## ⚙️ Environment Variables Reference

### Frontend (`frontend/.env.example`)
```env
# Backend API URL for production deployment on Render
# In local development: leave blank (Vite proxies /api to http://localhost:8000)
# In production on Render: set to your backend URL
VITE_API_BASE_URL=https://sih26175-backend.onrender.com
```

### Backend (`.env.example`)
```env
# Server Binding
HOST=0.0.0.0
PORT=8000

# CORS Allowed Origins (comma-separated URLs)
ALLOWED_ORIGINS=https://sih26175-frontend.onrender.com,http://localhost:5173,http://127.0.0.1:5173

# Optional OpenTopography API Key
OPENTOPOGRAPHY_API_KEY=
```

---

## ⚠️ Important Deployment & Architecture Notes

1. **Dynamic `$PORT` Binding**:
   - Render assigns a dynamic port via the `$PORT` environment variable.
   - The `backend/Dockerfile` automatically runs `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`, adapting seamlessly to both local and Render environments.

2. **Ephemeral File Storage**:
   - Render's free tier uses an ephemeral filesystem (files written to `/backend/uploads` will reset upon instance restarts).
   - Core Bengaluru demo datasets (`data/bengaluru/`, `data/lidar/`, `data/samples/`, `data/dem/`) are committed and baked into the image, ensuring they are always available.

3. **CORS & Domain Whitelisting**:
   - Make sure `ALLOWED_ORIGINS` on your backend includes your exact Render frontend URL (`https://<your-static-site>.onrender.com`).

---

## 🧪 Local Testing Before Deployment

To verify locally that production settings work:
```bash
# 1. Build and verify frontend
cd frontend
npm ci
npm run build

# 2. Test backend health check
cd ../backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
curl http://127.0.0.1:8000/health
# Response: {"status":"healthy"}
```
