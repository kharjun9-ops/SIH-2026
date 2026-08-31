import { 
  TerrainReconstructResponse, 
  TwoPointMeasurementResponse, 
  ImageAnalysisResponse, 
  SampleRegion,
  LatLonBounds,
  PointValidation,
  ValidationReport,
  LiDARProcessResponse,
  EnvironmentLayersResponse
} from '../types';

// Support custom backend URL in production (e.g. VITE_API_BASE_URL=https://my-backend.onrender.com)
// In local development, falls back to Vite proxy at '/api'
const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string) || '';
const API_BASE = rawBaseUrl.trim()
  ? `${rawBaseUrl.trim().replace(/\/$/, '')}/api`
  : '/api';

export const api = {
  async fetchSamples(): Promise<{ samples: SampleRegion[] }> {
    const res = await fetch(`${API_BASE}/terrain/samples`);
    if (!res.ok) throw new Error('Failed to load sample regions');
    return res.json();
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Reconstruction error' }));
      throw new Error(err.detail || 'Failed to reconstruct 3D terrain');
    }
    return res.json();
  },

  async validatePoint(latitude: number, longitude: number, mesh_elevation_m: number): Promise<PointValidation> {
    const res = await fetch(`${API_BASE}/terrain/validate_point`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, mesh_elevation_m }),
    });
    if (!res.ok) throw new Error('Point validation error');
    return res.json();
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
    if (!res.ok) throw new Error('Accuracy validation failed');
    return res.json();
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'LiDAR processing failed' }));
      throw new Error(err.detail || 'Failed to process LiDAR point cloud');
    }
    return res.json();
  },

  async inspectPoint(latitude: number, longitude: number, mesh_elevation_m?: number, grid_bounds?: LatLonBounds): Promise<any> {
    const res = await fetch(`${API_BASE}/terrain/inspect_point`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, mesh_elevation_m, grid_bounds }),
    });
    if (!res.ok) throw new Error('Point inspection error');
    return res.json();
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Measurement error' }));
      throw new Error(err.detail || 'Failed to compute height difference');
    }
    return res.json();
  },

  async analyzeImage(file: File): Promise<ImageAnalysisResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/image/analyze`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Image analysis error' }));
      throw new Error(err.detail || 'Failed to analyze uploaded image');
    }
    return res.json();
  },

  async queryElevation(lat: number, lon: number): Promise<{ latitude: number; longitude: number; elevation: number }> {
    const res = await fetch(`${API_BASE}/elevation?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error('Elevation lookup failed');
    return res.json();
  },

  async export3DModel(params: any, format: 'glb' | 'obj' = 'glb', exaggeration: number = 1.0): Promise<Blob> {
    const res = await fetch(`${API_BASE}/terrain/export?format=${format}&exaggeration=${exaggeration}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to export 3D model');
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
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Environment layers error' }));
      throw new Error(err.detail || 'Failed to fetch environment layers');
    }
    return res.json();
  }
};
