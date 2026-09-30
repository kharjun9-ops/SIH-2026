from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from app.models.schemas import TerrainReconstructRequest, TerrainReconstructResponse
from app.services.reconstruction_service import reconstruction_service

router = APIRouter(prefix="/reconstruction", tags=["Reconstruction Pipeline"])

@router.post("", response_model=TerrainReconstructResponse)
def trigger_reconstruction(request: TerrainReconstructRequest):
    """Trigger complete 3D terrain reconstruction pipeline."""
    return reconstruction_service.reconstruct_terrain(request)

@router.get("/{job_id}")
def get_reconstruction_job(job_id: str):
    """Retrieve details of a cached reconstruction job."""
    if job_id in reconstruction_service.jobs_cache:
        job = reconstruction_service.jobs_cache[job_id]
        return {
            "status": "success",
            "job_id": job_id,
            "bounds": job["bounds"],
            "stats": job["stats"],
            "provider": job["provider_name"]
        }
    raise HTTPException(status_code=404, detail=f"Reconstruction job '{job_id}' not found.")
