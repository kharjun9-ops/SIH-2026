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
    data_status: str = "REAL DATA"  # "REAL DATA" or "SYNTHETIC DEMO DATA"
    dataset_category: str = "DSM (Surface Elevation)"  # "DTM (Bare-Earth)", "DSM (Surface Elevation)", or "DEM-derived"
    native_resolution: str
    visualization_resolution: str
    mesh_resolution: str
    horizontal_resolution: str
    source_crs: str = "EPSG:4326 (WGS84)"
    projected_crs: str = "Local Transverse Equirectangular (Meters)"
    vertical_datum: str = "EGM2008 / EGM96 Geoid (MSL)"
    source_vertical_datum: str = "EGM2008 / EGM96 Geoid"
    output_vertical_datum: str = "Orthometric Meters above Geoid"
    vertical_accuracy: str
    elevation_type: str = "DEM-derived"
    projection: str = "Local Transverse Mercator (WGS84 Equirectangular Cos-Corrected)"
    grid_spacing_x_m: float
    grid_spacing_y_m: float
    data_voids_count: int
    interpolation_method: str
    resolution_transparency_note: str = "Visualization resolution is resampled from the native source raster."

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
    data_mode: Optional[str] = Field("real", description="Data mode: 'real' (strict remote sensing / survey) or 'demo' (synthetic presets allowed)")
    area_preset: Optional[str] = Field(None, description="Area preset: '1x1km', '2x2km', '5x5km', '10x10km', 'custom'")
    include_satellite_texture: Optional[bool] = Field(True, description="Generate satellite imagery layer")
    include_hillshade: Optional[bool] = Field(True, description="Generate analytical hillshade relief")
    sun_azimuth: Optional[float] = Field(315.0, ge=0.0, le=360.0, description="Sun direction in degrees")
    sun_altitude: Optional[float] = Field(45.0, ge=0.0, le=90.0, description="Sun elevation angle in degrees")
    hillshade_intensity: Optional[float] = Field(1.0, ge=0.0, le=2.0, description="Hillshade relief intensity")
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
    data_mode: Optional[str] = "real"

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
    surface_distance_m: float
    slope_percent: float
    slope_degrees: float
    average_gradient_pct: float
    total_ascent_m: float
    total_descent_m: float
    min_elevation_m: float
    max_elevation_m: float
    comparison_text: str
    elevation_profile: List[ElevationProfilePoint]

class LiDARProcessResponse(BaseModel):
    status: str
    file_name: str
    saved_file: str
    point_count: int
    point_density_sq_m: float
    point_spacing_m: float
    has_ground_classification: bool
    accuracy_statement: str
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

class BuildingHeightSummary(BaseModel):
    lidar_available: bool
    status_message: str
    source_file: Optional[str] = None
    total_buildings: int
    lidar_count: int
    osm_height_count: int
    osm_levels_count: int
    estimated_count: int
    lidar_coverage_pct: float
    mean_lidar_height: Optional[float] = None
    median_lidar_height: Optional[float] = None
    min_lidar_height: Optional[float] = None
    max_lidar_height: Optional[float] = None

class BuildingFeatureModel(BaseModel):
    id: str
    footprint: List[List[float]]
    footprint_metric: List[List[float]]
    latitude: float
    longitude: float
    x_metric: float
    z_metric: float
    ground_elevation: float
    relative_elevation: float
    height: float
    top_elevation: float
    height_source: str  # "LIDAR", "OSM_HEIGHT", "OSM_LEVELS", "ESTIMATED", "SYNTHETIC_DEMO"
    height_quality: str = "N/A"  # "HIGH", "MEDIUM", "LOW", "N/A"
    geometry_quality: str = "MEDIUM"  # "HIGH", "MEDIUM", "LOW"
    footprint_source: str = "OpenStreetMap"
    lidar_points_count: Optional[int] = 0
    lidar_roof_elevation: Optional[float] = None
    lidar_ground_elevation: Optional[float] = None
    osm_height_diff: Optional[float] = None
    roof_type: str = "flat"
    footprint_area_sq_m: float = 0.0
    name: Optional[str] = None
    building_type: Optional[str] = "yes"
    source: str = "OpenStreetMap"

class EnvironmentCoverageSummary(BaseModel):
    buildings: Dict[str, Any]
    roads: Dict[str, Any]
    water: Dict[str, Any]


