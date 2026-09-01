import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.terrain import router as terrain_router
from app.api.elevation import router as elevation_router
from app.api.image import router as image_router
from app.api.reconstruction import router as reconstruction_router
from app.api.validation import router as validation_router
from app.api.lidar import router as lidar_router
from app.api.environment import router as environment_router
from app.api.landslide import router as landslide_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="SIH26175 3D Terrain Reconstruction - Authoritative GIS, LiDAR & 3D Analytics Platform",
    version="2.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for uploads and samples
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.SAMPLES_DIR, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/api/samples", StaticFiles(directory=settings.SAMPLES_DIR), name="samples")

# Register API Routers
app.include_router(terrain_router, prefix=settings.API_V1_PREFIX)
app.include_router(elevation_router, prefix=settings.API_V1_PREFIX)
app.include_router(image_router, prefix=settings.API_V1_PREFIX)
app.include_router(reconstruction_router, prefix=settings.API_V1_PREFIX)
app.include_router(validation_router, prefix=settings.API_V1_PREFIX)
app.include_router(lidar_router, prefix=settings.API_V1_PREFIX)
app.include_router(environment_router, prefix=settings.API_V1_PREFIX)
app.include_router(landslide_router, prefix=settings.API_V1_PREFIX)

@app.get("/")
def root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "sih_problem_statement": "SIH26175",
        "version": "2.0.0 (Authoritative GIS & LiDAR Platform)",
        "endpoints": {
            "reconstruct": "/api/terrain/reconstruct",
            "samples": "/api/terrain/samples",
            "elevation": "/api/elevation",
            "validation_run": "/api/validation/run",
            "lidar_process": "/api/lidar/process",
            "image_analyze": "/api/image/analyze",
            "measure": "/api/terrain/measure",
            "export_3d": "/api/terrain/export",
            "environment_layers": "/api/environment/layers"
        }
    }

@app.get("/health")
def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
