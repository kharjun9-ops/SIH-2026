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
  PointInspection
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
  }
};
