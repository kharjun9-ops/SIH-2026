from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from app.models.schemas import ElevationQueryRequest, ElevationQueryResponse, ElevationPointResult
from app.services.dem_service import elevation_service

router = APIRouter(prefix="/elevation", tags=["Elevation"])

@router.get("", response_model=ElevationPointResult)
def get_single_elevation(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    """Query elevation at a single geographic latitude/longitude coordinate."""
    try:
        elev, provider = elevation_service.get_point_elevation(lat, lon)
        return ElevationPointResult(latitude=lat, longitude=lon, elevation=elev)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elevation lookup failed: {str(e)}")

@router.post("/query", response_model=ElevationQueryResponse)
def query_batch_elevations(request: ElevationQueryRequest):
    """Batch query elevation for multiple latitude/longitude coordinates."""
    try:
        results = []
        for pt in request.points:
            elev, provider = elevation_service.get_point_elevation(pt.latitude, pt.longitude)
            results.append(ElevationPointResult(latitude=pt.latitude, longitude=pt.longitude, elevation=elev))
        return ElevationQueryResponse(results=results, provider="DEM Pipeline")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch elevation query failed: {str(e)}")
