"""
Landslide Susceptibility Analysis API Router (SIH26175).
Endpoints for computing data-driven landslide susceptibility grids,
sub-pixel point inspections, hotspot clustering, and infrastructure exposure.
"""
from fastapi import APIRouter, HTTPException, Response
from typing import Dict, Any, Optional, List
import json

from app.models.schemas import (
    LandslideAnalysisRequest, LandslideAnalysisResponse,
    LandslideInspectionRequest, LandslideInspection,
    LandslideInventoryResponse, MLTrainingRequest, MLTrainingResponse, LatLonBounds
)
from app.services.landslide_service import landslide_service
from app.providers.landslide_inventory_provider import landslide_inventory_provider
from app.services.landslide_ml_service import landslide_ml_service

router = APIRouter(prefix="/analysis", tags=["Landslide Susceptibility Analysis"])


@router.get("/landslide/inventory", response_model=LandslideInventoryResponse)
def get_historical_landslide_inventory(
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lon: Optional[float] = None,
    max_lon: Optional[float] = None,
    buffer_km: float = 25.0
):
    """
    Retrieves authentic historical landslide inventory events from NASA GLC & ISRO Landslide Atlas.
    Supports spatial bounding box filtering with configurable buffer distance.
    """
    try:
        if None not in (min_lat, max_lat, min_lon, max_lon):
            bounds_dict = {
                "min_lat": min_lat,
                "max_lat": max_lat,
                "min_lon": min_lon,
                "max_lon": max_lon
            }
            events, meta = landslide_inventory_provider.get_inventory_in_bounds(bounds_dict, buffer_km=buffer_km)
            bounds_obj = LatLonBounds(**bounds_dict)
        else:
            events = landslide_inventory_provider.get_all_records()
            meta = {
                "total_found": len(events),
                "sources_summary": {"NASA Global Landslide Catalog": 4, "ISRO Landslide Atlas of India": 8, "Geological Survey of India": 4},
                "provenance": "All Cataloged Events in Repository"
            }
            bounds_obj = None

        return LandslideInventoryResponse(
            status="success",
            count=len(events),
            events=events,
            bounds=bounds_obj,
            sources_summary=meta.get("sources_summary", {}),
            provenance_notice="Authentic Historical Landslide Catalog — NASA Global Landslide Catalog (GLC/COOLR) & ISRO Landslide Atlas of India (NRSC)"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch historical landslide inventory: {str(e)}")


@router.post("/landslide/train", response_model=MLTrainingResponse)
def train_and_evaluate_ml_models(request: MLTrainingRequest):
    """
    Trains and benchmarks candidate Machine Learning algorithms (Logistic Regression, Random Forest,
    Gradient Boosting, Extra Trees) against Baseline MCE using 5-Fold Spatial Block Cross-Validation.
    """
    try:
        response = landslide_ml_service.train_and_compare_models(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Machine learning model training failed: {str(e)}")


@router.get("/landslide/models")
def get_available_landslide_models():
    """
    Returns available pre-trained regional Machine Learning models, spatial validation metrics, and feature lists.
    """
    try:
        training_res = landslide_ml_service.train_and_compare_models()
        return {
            "status": "success",
            "active_model": training_res.selected_model,
            "models_comparison": training_res.models_evaluated,
            "feature_importances": training_res.feature_importances,
            "provenance": training_res.provenance
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve landslide models: {str(e)}")



@router.post("/landslide", response_model=LandslideAnalysisResponse)
def analyze_landslide_susceptibility(request: LandslideAnalysisRequest):
    """
    Computes data-driven Landslide Susceptibility Screening for a given terrain bounding box.
    Uses authentic DEM derivatives (Slope, Profile & Plan Curvature, Aspect), real OSM Land Cover,
    transparent weighted overlay, dynamic weight renormalization, hotspot detection, and building/road exposure.
    """
    try:
        response = landslide_service.calculate_landslide_susceptibility(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Landslide susceptibility analysis failed: {str(e)}")


@router.post("/landslide/inspect", response_model=LandslideInspection)
def inspect_landslide_point(request: LandslideInspectionRequest):
    """
    Continuous sub-pixel point inspection in landslide mode.
    Returns authoritative elevation, slope, aspect, profile & plan curvature, land cover class,
    overall susceptibility score, risk class, and 'WHY THIS AREA?' factor contribution breakdown.
    """
    try:
        bounds_dict = request.bounds.model_dump() if request.bounds else None
        inspection = landslide_service.inspect_point(
            lat=request.latitude,
            lon=request.longitude,
            bounds=bounds_dict,
            scenario=request.scenario or "normal",
            data_mode=request.data_mode or "real"
        )
        return inspection
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Landslide point inspection failed: {str(e)}")


@router.post("/landslide/export")
def export_landslide_hotspots_geojson(request: LandslideAnalysisRequest):
    """
    Exports detected susceptibility hotspots as a standardized GeoJSON FeatureCollection.
    """
    try:
        analysis = landslide_service.calculate_landslide_susceptibility(request)
        
        features = []
        for hs in analysis.hotspots:
            # Construct polygon coordinates from polygon_bounds
            coords = []
            if hs.polygon_bounds and len(hs.polygon_bounds) >= 4:
                # GeoJSON expects [lon, lat]
                coords = [[pt[1], pt[0]] for pt in hs.polygon_bounds]
                coords.append(coords[0]) # close polygon
            else:
                # Bounding box around centroid
                d_lat = 0.001
                d_lon = 0.001
                coords = [
                    [hs.centroid_lon - d_lon, hs.centroid_lat - d_lat],
                    [hs.centroid_lon + d_lon, hs.centroid_lat - d_lat],
                    [hs.centroid_lon + d_lon, hs.centroid_lat + d_lat],
                    [hs.centroid_lon - d_lon, hs.centroid_lat + d_lat],
                    [hs.centroid_lon - d_lon, hs.centroid_lat - d_lat]
                ]

            feature = {
                "type": "Feature",
                "properties": {
                    "id": hs.id,
                    "name": hs.name,
                    "risk_class": hs.risk_class,
                    "area_sq_m": hs.area_sq_m,
                    "mean_slope_deg": hs.mean_slope_deg,
                    "max_slope_deg": hs.max_slope_deg,
                    "mean_susceptibility": hs.mean_susceptibility,
                    "peak_susceptibility": hs.peak_susceptibility,
                    "predominant_aspect": hs.predominant_aspect,
                    "model": "SIH26175 Landslide Screening Engine",
                    "validation": "Screening Model (Requires local geotechnical survey)"
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                }
            }
            features.append(feature)

        geojson_data = {
            "type": "FeatureCollection",
            "name": f"Landslide_Susceptibility_Hotspots_{request.terrain_id or 'custom'}",
            "crs": {
                "type": "name",
                "properties": {
                    "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
                }
            },
            "features": features
        }

        content = json.dumps(geojson_data, indent=2)
        filename = f"landslide_hotspots_{request.terrain_id or 'custom'}.geojson"

        return Response(
            content=content,
            media_type="application/geo+json",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GeoJSON export failed: {str(e)}")
