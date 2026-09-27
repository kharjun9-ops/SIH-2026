import { 
  TerrainReconstructResponse, 
  TwoPointMeasurementResponse, 
  ImageAnalysisResponse, 
  SampleRegion, 
  LatLonBounds, 
  PointValidation, 
  ValidationReport, 
  LiDARProcessResponse, 
  EnvironmentLayersResponse,
  PointInspection,
  LandslideAnalysisResponse,
  LandslideInspection,
  LandslideParameters,
  HistoricalLandslideEvent,
  LandslideInventoryResponse,
  MLTrainingRequest,
  MLTrainingResponse,
  DepthPipelineResponse,
  DepthPipelineCapabilities,
  RoomReconstructResponse
} from '../types';

// Support custom backend URL in production (e.g. VITE_API_BASE_URL=https://sih-2026-eqxk.onrender.com)
// In local development, falls back to Vite proxy at '/api'
const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string) || '';
export const API_BASE = rawBaseUrl.trim()
  ? `${rawBaseUrl.trim().replace(/\/$/, '')}/api`
  : '/api';

/**
 * Resolves relative asset paths (e.g., /api/uploads/...) to full backend URLs in production.
 */
export function resolveAssetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const raw = (import.meta.env.VITE_API_BASE_URL as string || '').trim();
  const base = raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
  if (base && path.startsWith('/')) {
    return `${base}${path}`;
  }
  return path;
}

/**
 * Robust response handler checking HTTP status, parsing JSON safely,
 * and returning informative error messages without "Unexpected end of JSON input".
 */
async function handleResponse<T>(res: Response, endpointDesc: string): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status} (${res.statusText || 'Error'})`;
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        errorDetail = json.detail || json.message || JSON.stringify(json);
      } else {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          errorDetail = text.slice(0, 300);
        }
      }
    } catch {
      // Fall back to status text
    }
    throw new Error(`[${endpointDesc}] ${errorDetail} (Status ${res.status})`);
  }

  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error(`Empty response received from server`);
    }
    return JSON.parse(text) as T;
  } catch (e: any) {
    throw new Error(`[${endpointDesc}] Failed to parse JSON response: ${e.message}`);
  }
}

export const api = {
  async fetchSamples(): Promise<{ samples: SampleRegion[] }> {
    const res = await fetch(`${API_BASE}/terrain/samples`);
    return handleResponse<{ samples: SampleRegion[] }>(res, 'Fetch Samples');
  },

  async reconstructTerrain(params: {
    latitude?: number;
    longitude?: number;
    radius?: number;
    bounds?: LatLonBounds;
    grid_resolution?: number;
    provider?: string;
    sample_id?: string;
    data_mode?: 'real' | 'demo';
    area_preset?: string;
    include_satellite_texture?: boolean;
    include_hillshade?: boolean;
    sun_azimuth?: number;
    sun_altitude?: number;
    hillshade_intensity?: number;
    contour_interval_m?: number;
  }): Promise<TerrainReconstructResponse> {
    const res = await fetch(`${API_BASE}/terrain/reconstruct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<TerrainReconstructResponse>(res, 'Reconstruct Terrain');
  },

  async validatePoint(latitude: number, longitude: number, mesh_elevation_m: number): Promise<PointValidation> {
    const res = await fetch(`${API_BASE}/terrain/validate_point`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, mesh_elevation_m }),
    });
    return handleResponse<PointValidation>(res, 'Validate Point');
  },

  async getAuthoritativeElevation(latitude: number, longitude: number): Promise<{ latitude: number; longitude: number; elevation: number }> {
    const res = await fetch(`${API_BASE}/elevation?lat=${latitude}&lon=${longitude}`);
    return handleResponse<{ latitude: number; longitude: number; elevation: number }>(res, 'Query Elevation');
  },

  async runAccuracyValidation(params: {
    bounds: LatLonBounds;
    grid_resolution?: number;
    sample_count?: number;
    provider?: string;
    sample_id?: string;
    data_mode?: 'real' | 'demo';
  }): Promise<ValidationReport> {
    const res = await fetch(`${API_BASE}/validation/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<ValidationReport>(res, 'Accuracy Validation');
  },

  async processLiDARFile(file: File, mode: 'dtm' | 'dsm' = 'dtm', resolution: number = 128): Promise<LiDARProcessResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);
    formData.append('resolution', resolution.toString());

    const res = await fetch(`${API_BASE}/lidar/process`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<LiDARProcessResponse>(res, 'Process LiDAR');
  },

  async inspectPoint(
    latitude: number, 
    longitude: number, 
    mesh_elevation_m?: number, 
    grid_bounds?: LatLonBounds
  ): Promise<PointInspection> {
    const res = await fetch(`${API_BASE}/terrain/inspect_point`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, mesh_elevation_m, grid_bounds }),
    });
    return handleResponse<PointInspection>(res, 'Inspect Point');
  },

  async measurePoints(
    lat_a: number, 
    lon_a: number, 
    lat_b: number, 
    lon_b: number,
    bounds?: LatLonBounds,
    data_mode?: string
  ): Promise<TwoPointMeasurementResponse> {
    const res = await fetch(`${API_BASE}/terrain/measure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat_a, lon_a, lat_b, lon_b, bounds, data_mode }),
    });
    return handleResponse<TwoPointMeasurementResponse>(res, 'Measure Two Points');
  },

  async analyzeImage(file: File): Promise<ImageAnalysisResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/image/analyze`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<ImageAnalysisResponse>(res, 'Analyze Image');
  },

  async reconstructFromImage(file: File, resolution: number = 128): Promise<TerrainReconstructResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('grid_resolution', resolution.toString());

    const res = await fetch(`${API_BASE}/image/reconstruct-3d`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<TerrainReconstructResponse>(res, 'Reconstruct 3D from Image');
  },

  async queryElevation(lat: number, lon: number): Promise<{ latitude: number; longitude: number; elevation: number }> {
    const res = await fetch(`${API_BASE}/elevation?lat=${lat}&lon=${lon}`);
    return handleResponse<{ latitude: number; longitude: number; elevation: number }>(res, 'Query Elevation');
  },

  async export3DModel(params: any, format: 'glb' | 'obj' = 'glb', exaggeration: number = 1.0): Promise<Blob> {
    const res = await fetch(`${API_BASE}/terrain/export?format=${format}&exaggeration=${exaggeration}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      let errorDetail = `HTTP ${res.status} (${res.statusText || 'Error'})`;
      try {
        const text = await res.text();
        if (text && text.trim().length > 0) errorDetail = text.slice(0, 300);
      } catch {}
      throw new Error(`[Export 3D] ${errorDetail} (Status ${res.status})`);
    }
    return res.blob();
  },

  async fetchSampleImage(sampleId: string): Promise<Blob> {
    const sampleUrl = resolveAssetUrl(`/api/samples/${sampleId}.jpg`) || `/api/samples/${sampleId}.jpg`;
    const res = await fetch(sampleUrl);
    if (!res.ok) {
      throw new Error(`[Fetch Sample Image] HTTP ${res.status} (${res.statusText || 'Error'}) (Status ${res.status})`);
    }
    return res.blob();
  },

  async searchGeocode(query: string): Promise<Array<{ display_name: string; lat: number; lon: number }>> {
    if (!query || query.trim().length < 2) return [];
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((item: any) => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon)
      }));
    } catch {
      return [];
    }
  },

  async fetchEnvironmentLayers(params: {
    bounds: LatLonBounds;
    layers?: string[];
    data_mode?: string;
    grid_resolution?: number;
    provider?: string;
  }): Promise<EnvironmentLayersResponse> {
    const res = await fetch(`${API_BASE}/environment/layers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounds: params.bounds,
        layers: params.layers || ['buildings', 'roads', 'water'],
        data_mode: params.data_mode || 'real',
        grid_resolution: params.grid_resolution || 128,
        provider: params.provider || 'auto',
      }),
    });
    return handleResponse<EnvironmentLayersResponse>(res, 'Environment Layers');
  },

  async runLandslideAnalysis(params: {
    bounds?: LatLonBounds;
    latitude?: number;
    longitude?: number;
    radius?: number;
    terrain_id?: string;
    grid_resolution?: number;
    data_mode?: 'real' | 'demo';
    provider?: string;
    model_type?: 'baseline' | 'random_forest' | 'gradient_boosting' | 'logistic_regression' | string;
    include_historical_inventory?: boolean;
    parameters?: LandslideParameters;
  }): Promise<LandslideAnalysisResponse> {
    const res = await fetch(`${API_BASE}/analysis/landslide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<LandslideAnalysisResponse>(res, 'Landslide Susceptibility Analysis');
  },

  async fetchLandslideInventory(params?: {
    min_lat?: number;
    max_lat?: number;
    min_lon?: number;
    max_lon?: number;
    buffer_km?: number;
  }): Promise<LandslideInventoryResponse> {
    const query = new URLSearchParams();
    if (params?.min_lat !== undefined) query.append('min_lat', params.min_lat.toString());
    if (params?.max_lat !== undefined) query.append('max_lat', params.max_lat.toString());
    if (params?.min_lon !== undefined) query.append('min_lon', params.min_lon.toString());
    if (params?.max_lon !== undefined) query.append('max_lon', params.max_lon.toString());
    if (params?.buffer_km !== undefined) query.append('buffer_km', params.buffer_km.toString());

    const res = await fetch(`${API_BASE}/analysis/landslide/inventory?${query.toString()}`);
    return handleResponse<LandslideInventoryResponse>(res, 'Fetch Historical Landslide Inventory');
  },

  async trainLandslideMLModel(request: MLTrainingRequest): Promise<MLTrainingResponse> {
    const res = await fetch(`${API_BASE}/analysis/landslide/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    return handleResponse<MLTrainingResponse>(res, 'Train Landslide ML Model');
  },

  async fetchLandslideModels(): Promise<any> {
    const res = await fetch(`${API_BASE}/analysis/landslide/models`);
    return handleResponse<any>(res, 'Fetch Landslide Models');
  },

  async inspectLandslidePoint(params: {
    latitude: number;
    longitude: number;
    bounds?: LatLonBounds;
    data_mode?: string;
    scenario?: string;
  }): Promise<LandslideInspection> {
    const res = await fetch(`${API_BASE}/analysis/landslide/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse<LandslideInspection>(res, 'Inspect Landslide Point');
  },

  async exportLandslideHotspots(params: {
    bounds?: LatLonBounds;
    terrain_id?: string;
    grid_resolution?: number;
    data_mode?: 'real' | 'demo';
    parameters?: LandslideParameters;
  }): Promise<Blob> {
    const res = await fetch(`${API_BASE}/analysis/landslide/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      let errorDetail = `HTTP ${res.status} (${res.statusText || 'Error'})`;
      try {
        const text = await res.text();
        if (text && text.trim().length > 0) errorDetail = text.slice(0, 300);
      } catch {}
      throw new Error(`[Export Hotspots GeoJSON] ${errorDetail} (Status ${res.status})`);
    }
    return res.blob();
  },

  // ─── Monocular Depth Pipeline (SIH26175 Core) ─────────────────────────────

  async processDepthPipeline(
    file: File,
    gridResolution: number = 256,
    calibrationMode: string = 'auto',
    depthModel: string = 'auto'
  ): Promise<DepthPipelineResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('grid_resolution', gridResolution.toString());
    formData.append('calibration_mode', calibrationMode);
    formData.append('depth_model', depthModel);

    const res = await fetch(`${API_BASE}/depth/process`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<DepthPipelineResponse>(res, 'Depth Pipeline');
  },

  async fetchDepthPipelineResult(jobId: string): Promise<DepthPipelineResponse> {
    const res = await fetch(`${API_BASE}/depth/result/${jobId}`);
    return handleResponse<DepthPipelineResponse>(res, 'Fetch Depth Result');
  },

  async fetchDepthCapabilities(): Promise<DepthPipelineCapabilities> {
    const res = await fetch(`${API_BASE}/depth/capabilities`);
    return handleResponse<DepthPipelineCapabilities>(res, 'Depth Capabilities');
  },

  // ─── 360° Room Scanner & 3D Spatial Reconstruction ───────────────────────

  async reconstructRoom(
    files: File[],
    roomName: string = 'My Scanned Room',
    calibrationMode: string = 'auto',
    referenceHeightM?: number
  ): Promise<RoomReconstructResponse> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    formData.append('room_name', roomName);
    formData.append('calibration_mode', calibrationMode);
    if (referenceHeightM) {
      formData.append('reference_height_m', referenceHeightM.toString());
    }

    const res = await fetch(`${API_BASE}/room/reconstruct`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<RoomReconstructResponse>(res, 'Room 3D Reconstruction');
  },

  async fetchRoomDemo(roomType: string = 'bedroom'): Promise<RoomReconstructResponse> {
    const res = await fetch(`${API_BASE}/room/demo/${roomType}`);
    return handleResponse<RoomReconstructResponse>(res, 'Fetch Room Demo');
  },

  async exportRoomObj(
    lengthM: number,
    widthM: number,
    heightM: number,
    roomName: string = 'room_model'
  ): Promise<Blob> {
    const formData = new FormData();
    formData.append('length_m', lengthM.toString());
    formData.append('width_m', widthM.toString());
    formData.append('height_m', heightM.toString());
    formData.append('room_name', roomName);

    const res = await fetch(`${API_BASE}/room/export-obj`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Export failed with status ${res.status}`);
    }
    return res.blob();
  },
};
