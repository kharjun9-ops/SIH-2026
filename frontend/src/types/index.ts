export interface LatLonBounds {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  center_lat?: number;
  center_lon?: number;
  radius_meters?: number;
}

export interface MetricBounds {
  width_m: number;
  height_m: number;
  min_x_m: number;
  max_x_m: number;
  min_y_m: number;
  max_y_m: number;
}

export interface GISMetadata {
  source: string;
  data_status: 'REAL DATA' | 'SYNTHETIC DEMO DATA';
  dataset_category: string;
  native_resolution: string;
  visualization_resolution: string;
  mesh_resolution: string;
  horizontal_resolution: string;
  source_crs?: string;
  projected_crs?: string;
  vertical_datum: string;
  source_vertical_datum?: string;
  output_vertical_datum?: string;
  vertical_accuracy: string;
  elevation_type?: string;
  projection: string;
  grid_spacing_x_m: number;
  grid_spacing_y_m: number;
  data_voids_count: number;
  interpolation_method: string;
  resolution_transparency_note?: string;
}

export interface PointInspection {
  latitude: number;
  longitude: number;
  elevation: number;
  mesh_elevation_m?: number;
  elevation_difference_m?: number;
  slope: number;
  aspect: number;
  aspect_cardinal: string;
  grid_x?: number;
  grid_y?: number;
  x_metric_m?: number;
  y_metric_m?: number;
  source?: string;
  source_type?: string;
  native_resolution?: string;
  vertical_datum?: string;
  sampling_method?: string;
  coordinate_system?: string;
  num_contributing_points?: number;
  measurement_quality?: string;
  accuracy_statement?: string;
}

export interface PointValidation {
  latitude: number;
  longitude: number;
  mesh_elevation_m: number;
  raw_dem_elevation_m: number;
  discrepancy_m: number;
  is_validated: boolean;
  source_dem: string;
}

export interface ValidationSamplePoint {
  latitude: number;
  longitude: number;
  mesh_elevation_m: number;
  raw_dem_elevation_m: number;
  error_m: number;
  status: string;
}

export interface ValidationReport {
  validation_type: string;
  source_dataset: string;
  sample_count: number;
  mean_absolute_error_m: number;
  root_mean_square_error_m: number;
  max_error_m: number;
  min_error_m: number;
  mean_bias_m: number;
  sample_points_table: ValidationSamplePoint[];
  fidelity_assessment: string;
  accuracy_notice: string;
}

export interface SlopeDistribution {
  gentle_0_5_deg_pct: number;
  moderate_5_15_deg_pct: number;
  steep_15_30_deg_pct: number;
  very_steep_30_45_deg_pct: number;
  cliff_over_45_deg_pct: number;
}

export interface TerrainStats {
  min_elevation: number;
  max_elevation: number;
  average_elevation: number;
  elevation_range: number;
  std_elevation: number;
  area_sq_km: number;
  average_slope_deg: number;
  highest_point: PointInspection;
  lowest_point: PointInspection;
}

export interface TerrainReconstructResponse {
  status: string;
  terrain_id?: string;
  region_name?: string;
  provider_used: string;
  fallback_notice?: string;
  grid_resolution: number;
  bounds: LatLonBounds;
  metric_bounds: MetricBounds;
  gis_metadata: GISMetadata;
  stats: TerrainStats;
  slope_distribution?: SlopeDistribution;
  elevation_grid: number[][];
  slope_grid: number[][];
  aspect_grid: number[][];
  contour_intervals: number[];
  vertex_count: number;
  face_count: number;
  texture_url?: string;
  hillshade_url?: string;
  source_info: string;
}

export interface ElevationProfilePoint {
  distance_m: number;
  elevation_m: number;
  latitude: number;
  longitude: number;
  slope_deg: number;
}

export interface TwoPointMeasurementResponse {
  point_a: PointInspection;
  point_b: PointInspection;
  height_difference: number;
  horizontal_distance?: number;
  distance_meters: number;
  distance_3d?: number;
  surface_distance_m?: number;
  slope_percent: number;
  slope_degrees: number;
  grade_percent?: number;
  direction?: string;
  average_gradient_pct?: number;
  total_ascent_m?: number;
  total_descent_m?: number;
  min_elevation_m?: number;
  max_elevation_m?: number;
  comparison_text: string;
  source?: string;
  source_resolution?: string;
  vertical_datum_compatible?: boolean;
  vertical_datum?: string;
  elevation_profile: ElevationProfilePoint[];
}

export interface LiDARProcessResponse {
  status: string;
  file_name: string;
  saved_file: string;
  point_count: number;
  point_density_sq_m: number;
  point_spacing_m: number;
  has_ground_classification: boolean;
  accuracy_statement: string;
  bounds: LatLonBounds;
  elevation_stats: Record<string, number>;
  elevation_grid: number[][];
  metadata: Record<string, any>;
  point_cloud_sample: number[][];
}

export interface ImageAnalysisResponse {
  status: string;
  file_name: string;
  width: number;
  height: number;
  has_exif_gps: boolean;
  exif_lat?: number;
  exif_lon?: number;
  exif_altitude?: number;
  keypoints_detected: number;
  horizon_detected: boolean;
  horizon_y_norm?: number;
  depth_map_url: string;
  features_preview_url: string;
  depth_notice: string;
  recommended_bounds?: LatLonBounds;
}

export interface SampleRegion {
  id: string;
  name: string;
  country: string;
  center_lat: number;
  center_lon: number;
  radius_meters: number;
  type: string;
  base_elevation: number;
  peak_elevation: number;
  description: string;
}

export type VisualMode = 'elevation' | 'hillshade' | 'satellite' | 'hybrid' | 'slope' | 'wireframe' | 'pointcloud' | 'landslide';
export type ColormapMode = 'hypsometric' | 'viridis' | 'magma' | 'thermal' | 'emerald' | 'satellite' | 'landslide';
export type InteractionTool = 'inspect' | 'measure' | 'none';
export type DataMode = 'real' | 'demo';
export type AreaPreset = '1x1km' | '2x2km' | '5x5km' | '10x10km' | 'custom';

// ─── Environment Reconstruction Layer Types ──────────────────────

export interface BuildingHeightSummary {
  lidar_available: boolean;
  status_message: string;
  source_file?: string | null;
  total_buildings: number;
  lidar_count: number;
  osm_height_count: number;
  osm_levels_count: number;
  estimated_count: number;
  lidar_coverage_pct: number;
  mean_lidar_height?: number | null;
  median_lidar_height?: number | null;
  min_lidar_height?: number | null;
  max_lidar_height?: number | null;
}

export interface BuildingFeature {
  id: string;
  footprint: number[][];       // [[lat, lon], ...]
  footprint_metric: number[][]; // [[x, z], ...] in local metric space
  latitude: number;
  longitude: number;
  x_metric: number;
  z_metric: number;
  ground_elevation: number;
  height: number;
  top_elevation: number;
  height_source: 'LIDAR' | 'OSM_HEIGHT' | 'OSM_LEVELS' | 'ESTIMATED' | 'MAPPED';
  height_quality?: 'HIGH' | 'MEDIUM' | 'LOW' | 'N/A';
  geometry_quality?: 'HIGH' | 'MEDIUM' | 'LOW';
  footprint_source?: string;
  lidar_points_count?: number;
  lidar_roof_elevation?: number;
  lidar_ground_elevation?: number;
  osm_height_diff?: number;
  roof_type: string;
  footprint_area_sq_m: number;
  name?: string;
  building_type?: string;
  source: string;
}

export interface RoadFeature {
  id: string;
  coords: number[][];          // [[lat, lon, elevation], ...]
  coords_metric: number[][];   // [[x, z, elevation], ...]
  road_type: string;
  width: number;
  width_source: string;
  name?: string;
  surface?: string;
  source: string;
}

export interface WaterFeature {
  id: string;
  polygon: number[][];
  polygon_metric: number[][];
  water_type: string;
  latitude: number;
  longitude: number;
  elevation: number;
  elevation_source?: string;
  name?: string;
  source: string;
}

export interface LandmarkFeature {
  id: string;
  latitude: number;
  longitude: number;
  x_metric: number;
  z_metric: number;
  elevation: number;
  name?: string;
  category: string;
  source: string;
}

export interface EnvironmentCoverageSummary {
  buildings: {
    detected: number;
    reconstructed: number;
    failed: number;
    failure_breakdown?: Record<string, number>;
    lidar_heights?: number;
    mapped_heights?: number;
    osm_levels_heights?: number;
    estimated_heights?: number;
    lidar_coverage_pct?: number;
    footprint_sources?: Record<string, number>;
    geometry_qualities?: Record<string, number>;
  };
  roads: {
    detected: number;
    reconstructed: number;
    failed: number;
    mapped_widths?: number;
    default_widths?: number;
  };
  water: {
    detected: number;
    reconstructed: number;
    failed: number;
  };
}

export interface EnvironmentLayerMetadata {
  source: string;
  count: number;
  data_status: string;
  lidar_heights?: number;
  mapped_heights?: number;
  estimated_heights?: number;
  lidar_coverage_pct?: number;
}

export interface EnvironmentLayersResponse {
  status?: string;
  source?: string;
  message?: string;
  buildings: BuildingFeature[];
  roads: RoadFeature[];
  water: WaterFeature[];
  landmarks: LandmarkFeature[];
  layer_metadata: Record<string, EnvironmentLayerMetadata>;
  building_height_summary?: BuildingHeightSummary;
  coverage_summary?: EnvironmentCoverageSummary;
  counts?: {
    buildings?: number;
    roads?: number;
    water?: number;
    landmarks?: number;
  };
  progress: string[];
}

export interface LayerVisibility {
  buildings: boolean;
  roads: boolean;
  water: boolean;
  landmarks: boolean;
  landslide?: boolean;
}

// ─── Landslide Susceptibility Layer Types (SIH26175) ─────────────

export interface LandslideFactorContribution {
  factor_name: string;
  raw_value?: string;
  normalized_score: number;
  weight_pct: number;
  contribution_level: 'High contribution' | 'Moderate contribution' | 'Low contribution' | 'Unavailable' | 'Scenario-based';
  description: string;
}

export interface LandslideInspection {
  latitude: number;
  longitude: number;
  elevation: number;
  slope: number;
  aspect: number;
  aspect_cardinal: string;
  profile_curvature: number;
  plan_curvature: number;
  land_cover: string;
  geology_status: string;
  rainfall_status: string;
  susceptibility_score: number;
  risk_class: 'VERY LOW' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY HIGH';
  main_contributors: LandslideFactorContribution[];
  hotspot_id?: string | null;
  scientific_disclaimer: string;
}

export interface LandslideHotspot {
  id: string;
  name: string;
  risk_class: string;
  area_sq_m: number;
  centroid_lat: number;
  centroid_lon: number;
  centroid_x_m: number;
  centroid_z_m: number;
  mean_slope_deg: number;
  max_slope_deg: number;
  mean_susceptibility: number;
  peak_susceptibility: number;
  predominant_aspect: string;
  polygon_bounds?: number[][];
}

export interface LandslideBuildingExposure {
  very_high_count: number;
  high_count: number;
  moderate_count: number;
  low_count: number;
  very_low_count: number;
  total_count?: number;
  total_buildings_screened: number;
}

export interface LandslideRoadExposure {
  very_high_km: number;
  high_km: number;
  moderate_km: number;
  low_km: number;
  very_low_km: number;
  total_km?: number;
  total_road_length_km: number;
}

export interface LandslideModelInfo {
  model_type: string;
  screening_status: string;
  data_inputs: Record<string, string>;
  validation_status: string;
  region_name?: string;
  source_resolution: string;
  analysis_resolution: string;
  weights_used: Record<string, number>;
  scenario_mode: string;
  scientific_notice: string;
  scientific_disclaimer?: string;
}

export interface LandslideClassStatistics {
  very_low_pct: number;
  low_pct: number;
  moderate_pct: number;
  high_pct: number;
  very_high_pct: number;
  very_low_area_sq_km?: number;
  low_area_sq_km?: number;
  moderate_area_sq_km?: number;
  high_area_sq_km?: number;
  very_high_area_sq_km?: number;
  mean_score: number;
  std_score: number;
  high_risk_area_sq_km: number;
}

export interface LandslideParameters {
  weight_slope?: number;
  weight_curvature?: number;
  weight_landcover?: number;
  weight_geology?: number;
  weight_rainfall?: number;
  weight_aspect?: number;
  scenario?: 'normal' | 'heavy' | 'extreme';
  slope_thresholds?: number[];
}

export interface HistoricalLandslideEvent {
  id: string;
  latitude: number;
  longitude: number;
  event_date?: string;
  trigger: string;
  source: string;
  source_id?: string;
  inventory_type: string;
  confidence: string;
  area_sq_m?: number;
  citation?: string;
  state_region?: string;
  predicted_risk_class?: string;
  predicted_score?: number;
  is_captured?: boolean;
}

export interface HistoricalCaptureSummary {
  total_in_bounds: number;
  captured_count: number;
  missed_count: number;
  capture_rate_pct: number;
  moderate_count: number;
  low_or_very_low_count: number;
  evaluation_notice: string;
}

export interface LandslideInventoryResponse {
  status: string;
  count: number;
  events: HistoricalLandslideEvent[];
  bounds?: LatLonBounds;
  sources_summary: Record<string, number>;
  provenance_notice: string;
}

export interface MLModelMetrics {
  roc_auc: number;
  pr_auc: number;
  precision: number;
  recall: number;
  f1_score: number;
  balanced_accuracy: number;
  brier_score: number;
  validation_method: string;
  training_sample_count: number;
  positive_samples: number;
  negative_samples: number;
  is_calibrated: boolean;
  calibration_method: string;
}

export interface MLModelComparisonItem {
  model_id: string;
  model_name: string;
  algorithm: string;
  is_active: boolean;
  roc_auc: number;
  pr_auc: number;
  f1_score: number;
  precision: number;
  recall: number;
  brier_score: number;
  validation_strategy: string;
}

export interface MLTrainingRequest {
  region_name?: string;
  bounds?: LatLonBounds;
  algorithms?: string[];
  spatial_cv_folds?: number;
  negative_buffer_m?: number;
  calibrate_probabilities?: boolean;
}

export interface MLTrainingResponse {
  status: string;
  selected_model: string;
  models_evaluated: MLModelComparisonItem[];
  feature_importances: Record<string, number>;
  training_samples: number;
  spatial_folds: number;
  provenance: Record<string, any>;
}

export interface LandslideAnalysisResponse {
  status: string;
  terrain_id?: string;
  model_type?: 'baseline' | 'random_forest' | 'gradient_boosting' | 'logistic_regression' | string;
  bounds: LatLonBounds;
  metric_bounds: MetricBounds;
  grid_resolution: number;
  risk_grid: number[][];
  class_grid: string[][];
  classes: string[];
  statistics: LandslideClassStatistics;
  model_info: LandslideModelInfo;
  hotspots: LandslideHotspot[];
  building_exposure: LandslideBuildingExposure;
  road_exposure: LandslideRoadExposure;
  water_proximity_notes?: string;
  historical_events?: HistoricalLandslideEvent[];
  historical_capture?: HistoricalCaptureSummary;
  ml_metrics?: MLModelMetrics;
  model_comparison?: MLModelComparisonItem[];
  feature_importances?: Record<string, number>;
}



