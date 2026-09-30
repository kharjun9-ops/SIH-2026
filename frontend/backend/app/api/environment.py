"""
Environment layers API route.
Fetches real geographic vector features (buildings, roads, water, landmarks)
from OpenStreetMap and samples elevations on the active DEM terrain grid.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging

from app.models.schemas import LatLonBounds
from app.providers.elevation_manager import elevation_manager
from app.services.environment_service import get_environment_layers

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/environment", tags=["environment"])


class EnvironmentLayersRequest(BaseModel):
    bounds: Optional[LatLonBounds] = None
    # Alternate direct coordinates support (Requirement #9)
    north: Optional[float] = None
    south: Optional[float] = None
    east: Optional[float] = None
    west: Optional[float] = None
    layers: Optional[List[str]] = Field(
        default=["buildings", "roads", "water"],
        description="Layers to fetch: 'buildings', 'roads', 'water', 'landmarks'"
    )
    data_mode: Optional[str] = Field("real", description="'real' or 'demo'")
    grid_resolution: Optional[int] = Field(128, description="DEM resolution for terrain sampling")
    provider: Optional[str] = Field("auto", description="DEM provider preference")
    min_elevation: Optional[float] = Field(0.0, description="Minimum elevation baseline in meters")


@router.post("/query")
@router.post("/layers")
async def fetch_environment_layers(request: EnvironmentLayersRequest):
    """
    Fetch geographic vector features (buildings, roads, water bodies, landmarks)
    from OpenStreetMap, draped on the active 3D terrain elevation surface.
    """
    try:
        # Resolve bounding box
        if request.bounds is not None:
            bounds_dict = request.bounds.model_dump()
        elif request.north is not None and request.south is not None and request.east is not None and request.west is not None:
            bounds_dict = {
                "min_lat": min(request.south, request.north),
                "max_lat": max(request.south, request.north),
                "min_lon": min(request.west, request.east),
                "max_lon": max(request.west, request.east),
            }
        else:
            raise HTTPException(status_code=400, detail="Missing geographic bounding box (bounds or north/south/east/west required)")

        resolution = request.grid_resolution or 128
        data_mode = request.data_mode or "real"

        # 1. Retrieve DEM elevation grid for ground height sampling
        elevation_grid, dem_meta = elevation_manager.get_elevation_grid(
            bounds_dict,
            resolution=resolution,
            provider_preference=request.provider or "auto",
            data_mode=data_mode
        )

        min_elev = float(dem_meta.get("min_elevation", request.min_elevation or 0.0))

        # 2. Query OSM vector features & sample on terrain
        result = get_environment_layers(
            bounds=bounds_dict,
            elevation_grid=elevation_grid,
            layers_requested=request.layers or ["buildings", "roads", "water"],
            data_mode=data_mode,
            min_elevation=min_elev
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Environment layer endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Environment layer processing failed: {str(e)}")


@router.get("/status")
async def environment_status():
    """Health check for environment layer provider."""
    return {
        "status": "online",
        "available_layers": ["buildings", "roads", "water", "landmarks"],
        "primary_source": "OpenStreetMap (OSM 0.6 Map API)",
        "fallback_source": "Overpass Multi-Mirror API",
    }
