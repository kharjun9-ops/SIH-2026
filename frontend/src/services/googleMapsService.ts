import { Loader } from '@googlemaps/js-api-loader';
import { LatLonBounds } from '../types';

export interface GeocodingResult {
  formatted_address: string;
  latitude: number;
  longitude: number;
  place_id?: string;
}

export interface AreaMetrics {
  north: number;
  south: number;
  east: number;
  west: number;
  centerLat: number;
  centerLon: number;
  widthMeters: number;
  heightMeters: number;
  areaSqKm: number;
  radiusMeters: number;
}

/**
 * Calculates geodetic bounds given a center coordinate and metric radius.
 */
export function calculateBoundsFromRadius(lat: number, lon: number, radiusMeters: number): LatLonBounds {
  const latDelta = radiusMeters / 111320.0;
  const lonDelta = radiusMeters / (111320.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

  return {
    min_lat: Number((lat - latDelta).toFixed(6)),
    max_lat: Number((lat + latDelta).toFixed(6)),
    min_lon: Number((lon - lonDelta).toFixed(6)),
    max_lon: Number((lon + lonDelta).toFixed(6)),
    center_lat: Number(lat.toFixed(6)),
    center_lon: Number(lon.toFixed(6)),
    radius_meters: radiusMeters,
  };
}

/**
 * Calculates metric dimensions and surface area from geodetic bounds.
 */
export function calculateAreaMetrics(bounds: LatLonBounds): AreaMetrics {
  const midLat = (bounds.min_lat + bounds.max_lat) / 2.0;
  const midLon = (bounds.min_lon + bounds.max_lon) / 2.0;
  const latSpan = bounds.max_lat - bounds.min_lat;
  const lonSpan = bounds.max_lon - bounds.min_lon;

  const heightMeters = Math.round(latSpan * 111320.0);
  const widthMeters = Math.round(lonSpan * 111320.0 * Math.cos((midLat * Math.PI) / 180));
  const areaSqKm = Number(((widthMeters / 1000.0) * (heightMeters / 1000.0)).toFixed(2));
  const radiusMeters = Math.round(Math.max(widthMeters, heightMeters) / 2.0);

  return {
    north: bounds.max_lat,
    south: bounds.min_lat,
    east: bounds.max_lon,
    west: bounds.min_lon,
    centerLat: bounds.center_lat ?? midLat,
    centerLon: bounds.center_lon ?? midLon,
    widthMeters,
    heightMeters,
    areaSqKm,
    radiusMeters,
  };
}

class GoogleMapsService {
  private loader: Loader | null = null;
  private isLoaded = false;
  private loadPromise: Promise<any> | null = null;

  public initialize(apiKey: string): Promise<any> {
    if (this.loadPromise) return this.loadPromise;

    if (!apiKey || apiKey.trim().length < 5) {
      return Promise.reject(new Error('Missing or invalid Google Maps API key'));
    }

    this.loader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['places', 'geometry', 'maps'] as any,
    });

    const p = (this.loader as any).load
      ? (this.loader as any).load()
      : (this.loader as any).importLibrary('maps');

    this.loadPromise = Promise.resolve(p).then((googleInstance: any) => {
      this.isLoaded = true;
      return googleInstance || (window as any).google;
    });

    return this.loadPromise;
  }

  public getIsLoaded(): boolean {
    return this.isLoaded && typeof window !== 'undefined' && !!(window as any).google;
  }

  /**
   * Geocodes a text address or query using Google Maps Geocoder.
   */
  public async geocodeAddress(query: string): Promise<GeocodingResult[]> {
    if (!this.getIsLoaded()) {
      throw new Error('Google Maps API is not loaded');
    }

    const geocoder = new google.maps.Geocoder();
    return new Promise((resolve, reject) => {
      geocoder.geocode({ address: query }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
          const formatted = results.map((r) => ({
            formatted_address: r.formatted_address,
            latitude: Number(r.geometry.location.lat().toFixed(6)),
            longitude: Number(r.geometry.location.lng().toFixed(6)),
            place_id: r.place_id,
          }));
          resolve(formatted);
        } else {
          reject(new Error(`Geocoding failed with status: ${status}`));
        }
      });
    });
  }
}

export const googleMapsService = new GoogleMapsService();
