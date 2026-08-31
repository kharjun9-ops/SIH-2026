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
  slope: number;
  aspect: number;
  aspect_cardinal: string;
  grid_x?: number;
  grid_y?: number;
  x_metric_m?: number;
  y_metric_m?: number;
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
  distance_meters: number;
  surface_distance_m?: number;
  slope_percent: number;
  slope_degrees: number;
  average_gradient_pct?: number;
  total_ascent_m?: number;
  total_descent_m?: number;
  min_elevation_m?: number;
  max_elevation_m?: number;
  comparison_text: string;
  elevation_profile: ElevationProfilePoint[];
}

export interface LiDARProcessResponse {
  status: string;
  file_name: string;
  saved_file: string;
  point_count: number;
  point_density_sq_m?: number;
  point_spacing_m?: number;
  has_ground_classification?: boolean;
  accuracy_statement?: string;
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

export type VisualMode = 'elevation' | 'hillshade' | 'satellite' | 'hybrid' | 'slope' | 'wireframe' | 'pointcloud';
export type ColormapMode = 'hypsometric' | 'viridis' | 'magma' | 'thermal' | 'emerald' | 'satellite';
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
}

