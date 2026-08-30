from fastapi import APIRouter, HTTPException
import numpy as np

from app.models.schemas import ValidationRunRequest, ValidationReport, ValidationSamplePoint
from app.providers.elevation_manager import elevation_manager
from app.services.validation_service import validation_service

router = APIRouter(prefix="/validation", tags=["Statistical Accuracy Validation"])

@router.post("/run", response_model=ValidationReport)
def run_accuracy_validation(request: ValidationRunRequest):
    """
    Performs rigorous statistical accuracy validation comparing the generated 3D mesh
    against the underlying authoritative source DEM across N sampled points.
    Computes MAE, RMSE, Max/Min error, and Mean Bias.
    """
    try:
        bounds_dict = request.bounds.model_dump()
        res = request.grid_resolution or 128
        sample_count = request.sample_count or 100

        grid, meta = elevation_manager.get_elevation_grid(
            bounds_dict, resolution=res, provider_preference=request.provider or "auto", sample_id=request.sample_id
        )

        source_name = meta.get("source", "SRTM GL1 30m")
        result = validation_service.run_statistical_validation(
            grid, bounds_dict, sample_count=sample_count, source_name=source_name
        )

        sample_pts = [ValidationSamplePoint(**pt) for pt in result["sample_points_table"]]

        return ValidationReport(
            validation_type=result["validation_type"],
            source_dataset=result["source_dataset"],
            sample_count=result["sample_count"],
            mean_absolute_error_m=result["mean_absolute_error_m"],
            root_mean_square_error_m=result["root_mean_square_error_m"],
            max_error_m=result["max_error_m"],
            min_error_m=result["min_error_m"],
            mean_bias_m=result["mean_bias_m"],
            sample_points_table=sample_pts,
            fidelity_assessment=result["fidelity_assessment"],
            accuracy_notice=result["accuracy_notice"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")
