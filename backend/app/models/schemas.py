from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class LatLonBounds(BaseModel):
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float
    center_lat: Optional[float] = None
    center_lon: Optional[float] = None
    radius_meters: Optional[float] = None

class MetricBounds(BaseModel):
    width_m: float
    height_m: float
    min_x_m: float
    max_x_m: float
    min_y_m: float
    max_y_m: float

class GISMetadata(BaseModel):
    source: str
    horizontal_resolution: str
    vertical_datum: str
    vertical_accuracy: str
    elevation_type: str = "DEM-derived"
    projection: str = "Local Transverse Mercator (WGS84 Equirectangular Cos-Corrected)"
    grid_spacing_x_m: float
    grid_spacing_y_m: float
    data_voids_count: int
    interpolation_method: str

class PointCoordinate(BaseModel):
    latitude: float
    longitude: float

class TerrainReconstructRequest(BaseModel):
    latitude: Optional[float] = Field(None, description="Center latitude (-90 to 90)")
    longitude: Optional[float] = Field(None, description="Center longitude (-180 to 180)")
    radius: Optional[float] = Field(2500.0, description="Radius in meters (500 to 50000)")
    bounds: Optional[LatLonBounds] = Field(None, description="Explicit bounding box")
    grid_resolution: Optional[int] = Field(128, ge=32, le=256, description="Grid resolution e.g. 128x128")
    provider: Optional[str] = Field("auto", description="Provider preference: 'auto', 'lidar', 'copernicus', 'srtm', 'local-geotiff'")
    sample_id: Optional[str] = Field(None, description="Sample region ID")
    include_satellite_texture: Optional[bool] = Field(True, description="Generate satellite imagery layer")
    include_hillshade: Optional[bool] = Field(True, description="Generate analytical hillshade relief")
    sun_azimuth: Optional[float] = Field(315.0, ge=0.0, le=360.0, description="Sun direction in degrees")
    sun_altitude: Optional[float] = Field(45.0, ge=0.0, le=90.0, description="Sun elevation angle in degrees")
    contour_interval_m: Optional[float] = Field(20.0, description="Contour line spacing in meters")

class PointInspection(BaseModel):
    latitude: float
    longitude: float
    elevation: float
    slope: float
    aspect: float
    aspect_cardinal: str
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    x_metric_m: Optional[float] = None
    y_metric_m: Optional[float] = None

class PointInspectionRequest(BaseModel):
    latitude: float
    longitude: float
    grid_bounds: Optional[LatLonBounds] = None

class PointValidation(BaseModel):
    latitude: float
    longitude: float
    mesh_elevation_m: float
    raw_dem_elevation_m: float
    discrepancy_m: float
    is_validated: bool
    source_dem: str

class ValidationSamplePoint(BaseModel):
    latitude: float
    longitude: float
    mesh_elevation_m: float
    raw_dem_elevation_m: float
    error_m: float
    status: str

class ValidationReport(BaseModel):
    validation_type: str
    source_dataset: str
    sample_count: int
    mean_absolute_error_m: float
    root_mean_square_error_m: float
    max_error_m: float
    min_error_m: float
    mean_bias_m: float
    sample_points_table: List[ValidationSamplePoint]
    fidelity_assessment: str
    accuracy_notice: str

class TerrainStats(BaseModel):
    min_elevation: float
    max_elevation: float
    average_elevation: float
    elevation_range: float
    std_elevation: float
    area_sq_km: float
    average_slope_deg: float
    highest_point: PointInspection
    lowest_point: PointInspection

class ContourSummary(BaseModel):
    supported_intervals_m: List[float]
    default_interval_m: float
    levels: List[float]

class SlopeDistribution(BaseModel):
    gentle_0_5_deg_pct: float
    moderate_5_15_deg_pct: float
    steep_15_30_deg_pct: float
    very_steep_30_45_deg_pct: float
    cliff_over_45_deg_pct: float

class TerrainReconstructResponse(BaseModel):
    status: str
    region_name: Optional[str] = None
    provider_used: str
    fallback_notice: Optional[str] = None
    grid_resolution: int
    bounds: LatLonBounds
    metric_bounds: MetricBounds
    gis_metadata: GISMetadata
    stats: TerrainStats
    slope_distribution: Optional[SlopeDistribution] = None
    elevation_grid: List[List[float]]
    slope_grid: List[List[float]]
    aspect_grid: List[List[float]]
    contour_intervals: List[float]
    vertex_count: int
    face_count: int
    texture_url: Optional[str] = None
    hillshade_url: Optional[str] = None
    source_info: str

class ElevationQueryRequest(BaseModel):
    points: List[PointCoordinate]

class ElevationPointResult(BaseModel):
    latitude: float
    longitude: float
    elevation: float
    source: Optional[str] = None

class ElevationQueryResponse(BaseModel):
    results: List[ElevationPointResult]
    provider: str

class PointValidationRequest(BaseModel):
    latitude: float
    longitude: float
    mesh_elevation_m: float

class ValidationRunRequest(BaseModel):
    bounds: LatLonBounds
    grid_resolution: Optional[int] = 128
    sample_count: Optional[int] = 100
    provider: Optional[str] = "auto"
    sample_id: Optional[str] = None

class TwoPointMeasurementRequest(BaseModel):
    lat_a: float
    lon_a: float
    lat_b: float
    lon_b: float

class ElevationProfilePoint(BaseModel):
    distance_m: float
    elevation_m: float
    latitude: float
    longitude: float
    slope_deg: float

class TwoPointMeasurementResponse(BaseModel):
    point_a: PointInspection
    point_b: PointInspection
    height_difference: float
    distance_meters: float
    slope_percent: float
    slope_degrees: float
    comparison_text: str
    elevation_profile: List[ElevationProfilePoint]

class LiDARProcessResponse(BaseModel):
    status: str
    file_name: str
    saved_file: str
    point_count: int
    bounds: LatLonBounds
    elevation_stats: Dict[str, float]
    elevation_grid: List[List[float]]
    metadata: Dict[str, Any]
    point_cloud_sample: List[List[float]]

class ImageAnalysisResponse(BaseModel):
    status: str
    file_name: str
    width: int
    height: int
    has_exif_gps: bool
    exif_lat: Optional[float] = None
    exif_lon: Optional[float] = None
    exif_altitude: Optional[float] = None
    keypoints_detected: int
    horizon_detected: bool
    horizon_y_norm: Optional[float] = None
    depth_map_url: str
    features_preview_url: str
    depth_notice: str = "AI-estimated relative depth (relative scale only, not calibrated absolute meters)"
    recommended_bounds: Optional[LatLonBounds] = None
