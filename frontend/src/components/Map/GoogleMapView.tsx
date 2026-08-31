import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  Layers, 
  Maximize2, 
  Sliders, 
  Compass, 
  CheckCircle2, 
  AlertCircle, 
  Box,
  Eye,
  Sparkles,
  ShieldCheck,
  Building2,
  Route,
  Droplets,
  Key,
  Globe,
  ArrowRight,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { LatLonBounds, SampleRegion } from '../../types';
import { 
  googleMapsService, 
  calculateBoundsFromRadius, 
  calculateAreaMetrics, 
  AreaMetrics 
} from '../../services/googleMapsService';

interface GoogleMapViewProps {
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  onLocationChange: (lat: number, lon: number, radius: number, bounds: LatLonBounds) => void;
  samples?: SampleRegion[];
  onSelectSample?: (sampleId: string) => void;
  inspectedLat?: number;
  inspectedLon?: number;
  onOpenGoogle3DContext?: () => void;
  onGenerate3DWorld?: () => void;
  onSwitchToManualMode?: () => void;
  isLoading?: boolean;
}

export const GoogleMapView: React.FC<GoogleMapViewProps> = ({
  centerLat,
  centerLon,
  radiusMeters,
  onLocationChange,
  samples = [],
  onSelectSample,
  inspectedLat,
  inspectedLon,
  onOpenGoogle3DContext,
  onGenerate3DWorld,
  onSwitchToManualMode,
  isLoading = false,
}) => {
  // Read key from environment or local storage override
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('sih_google_maps_key') || envKey;
  });
  const [tempKeyInput, setTempKeyInput] = useState<string>('');
  const [isKeyConfigured, setIsKeyConfigured] = useState<boolean>(Boolean(apiKey && apiKey.trim().length > 5));

  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid' | 'terrain'>('hybrid');
  const [areaPreset, setAreaPreset] = useState<'1x1km' | '2x2km' | '3x3km' | '5x5km' | '10x10km' | 'custom'>('3x3km');
  const [searchQuery, setSearchQuery] = useState<string>('Bengaluru Central Pilot');
  const [loadStatus, setLoadStatus] = useState<'LOADING' | 'LOADED' | 'ERROR' | 'UNCONFIGURED'>(
    isKeyConfigured ? 'LOADING' : 'UNCONFIGURED'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const inspectMarkerRef = useRef<google.maps.Marker | null>(null);
  const rectangleRef = useRef<google.maps.Rectangle | null>(null);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);

  // Compute canonical bounds and metrics from centerLat, centerLon, radiusMeters
  const currentBounds: LatLonBounds = calculateBoundsFromRadius(centerLat, centerLon, radiusMeters);
  const metrics: AreaMetrics = calculateAreaMetrics(currentBounds);

  // Initialize Google Maps JavaScript API
  useEffect(() => {
    if (!apiKey || apiKey.trim().length < 5) {
      setLoadStatus('UNCONFIGURED');
      setIsKeyConfigured(false);
      return;
    }

    let isMounted = true;
    setLoadStatus('LOADING');
    setErrorMessage(null);

    googleMapsService.initialize(apiKey).then((google) => {
      if (!isMounted || !mapRef.current) return;

      try {
        const mapOptions: google.maps.MapOptions = {
          center: { lat: centerLat, lng: centerLon },
          zoom: radiusMeters <= 750 ? 16 : radiusMeters <= 1500 ? 15 : radiusMeters <= 3000 ? 14 : 13,
          mapTypeId: mapType,
          tilt: 0,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        };

        const map = new google.maps.Map(mapRef.current, mapOptions);
        googleMapRef.current = map;

        // 1. Center Location Pin
        const marker = new google.maps.Marker({
          position: { lat: centerLat, lng: centerLon },
          map: map,
          title: 'Selected Center Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#00e5ff',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
          }
        });
        markerRef.current = marker;

        // 2. Selection Rectangle Overlay with drag & resize handles
        const rect = new google.maps.Rectangle({
          bounds: {
            north: currentBounds.max_lat,
            south: currentBounds.min_lat,
            east: currentBounds.max_lon,
            west: currentBounds.min_lon
          },
          editable: true,
          draggable: true,
          map: map,
          strokeColor: '#00e5ff',
          strokeOpacity: 0.95,
          strokeWeight: 2.5,
          fillColor: '#0284c7',
          fillOpacity: 0.20,
        });
        rectangleRef.current = rect;

        // Rectangle drag / resize event listener
        rect.addListener('bounds_changed', () => {
          const b = rect.getBounds();
          if (!b) return;
          const ne = b.getNorthEast();
          const sw = b.getSouthWest();
          const nLat = ne.lat();
          const sLat = sw.lat();
          const eLon = ne.lng();
          const wLon = sw.lng();

          const cLat = Number(((nLat + sLat) / 2.0).toFixed(6));
          const cLon = Number(((eLon + wLon) / 2.0).toFixed(6));
          const rad = Math.round(Math.max((nLat - sLat) * 111320.0 / 2.0, (eLon - wLon) * 111320.0 * Math.cos((cLat * Math.PI) / 180) / 2.0));

          marker.setPosition({ lat: cLat, lng: cLon });
          setAreaPreset('custom');
          onLocationChange(cLat, cLon, rad, {
            min_lat: Number(sLat.toFixed(6)),
            max_lat: Number(nLat.toFixed(6)),
            min_lon: Number(wLon.toFixed(6)),
            max_lon: Number(eLon.toFixed(6)),
            center_lat: cLat,
            center_lon: cLon,
            radius_meters: rad
          });
        });

        // 3. Map Click Listener for bi-directional Map -> 3D synchronization
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const clickLat = Number(e.latLng.lat().toFixed(6));
          const clickLon = Number(e.latLng.lng().toFixed(6));

          const latD = radiusMeters / 111320.0;
          const lonD = radiusMeters / (111320.0 * Math.max(0.01, Math.cos((clickLat * Math.PI) / 180)));

          const newB: LatLonBounds = {
            min_lat: Number((clickLat - latD).toFixed(6)),
            max_lat: Number((clickLat + latD).toFixed(6)),
            min_lon: Number((clickLon - lonD).toFixed(6)),
            max_lon: Number((clickLon + lonD).toFixed(6)),
            center_lat: clickLat,
            center_lon: clickLon,
            radius_meters: radiusMeters
          };

          rect.setBounds({
            north: newB.max_lat,
            south: newB.min_lat,
            east: newB.max_lon,
            west: newB.min_lon
          });
          marker.setPosition(e.latLng);
          onLocationChange(clickLat, clickLon, radiusMeters, newB);
        });

        // 4. Places Autocomplete integration
        if (autocompleteInputRef.current && google.maps.places) {
          const autocomplete = new google.maps.places.Autocomplete(autocompleteInputRef.current, {
            fields: ['geometry', 'name', 'formatted_address']
          });
          autocomplete.bindTo('bounds', map);
          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            if (!place.geometry || !place.geometry.location) {
              setErrorMessage('Location not found. Please select from autocomplete suggestions.');
              return;
            }
            setErrorMessage(null);
            const pLat = Number(place.geometry.location.lat().toFixed(6));
            const pLon = Number(place.geometry.location.lng().toFixed(6));

            map.panTo({ lat: pLat, lng: pLon });
            map.setZoom(15);
            marker.setPosition({ lat: pLat, lng: pLon });

            const newBounds = calculateBoundsFromRadius(pLat, pLon, radiusMeters);
            rect.setBounds({
              north: newBounds.max_lat,
              south: newBounds.min_lat,
              east: newBounds.max_lon,
              west: newBounds.min_lon
            });

            onLocationChange(pLat, pLon, radiusMeters, newBounds);
          });
        }

        setLoadStatus('LOADED');
        setIsKeyConfigured(true);
      } catch (err: any) {
        console.error('Google Maps initialization error:', err);
        setLoadStatus('ERROR');
        setErrorMessage(err?.message || 'Google Maps failed to initialize. Check API key restrictions.');
      }
    }).catch((err: any) => {
      console.error('Google Maps loader error:', err);
      setLoadStatus('ERROR');
      setErrorMessage(err?.message || 'Google Maps loader failed. Please verify your VITE_GOOGLE_MAPS_API_KEY.');
    });

    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  // Synchronize map center when coordinates change from external inputs
  useEffect(() => {
    if (googleMapRef.current && markerRef.current && rectangleRef.current) {
      const pos = { lat: centerLat, lng: centerLon };
      markerRef.current.setPosition(pos);
      rectangleRef.current.setBounds({
        north: currentBounds.max_lat,
        south: currentBounds.min_lat,
        east: currentBounds.max_lon,
        west: currentBounds.min_lon
      });
      googleMapRef.current.panTo(pos);
    }
  }, [centerLat, centerLon, radiusMeters]);

  // Synchronize 3D inspected point onto Google Map
  useEffect(() => {
    if (!googleMapRef.current || !window.google) return;
    if (inspectedLat && inspectedLon) {
      if (!inspectMarkerRef.current) {
        inspectMarkerRef.current = new google.maps.Marker({
          position: { lat: inspectedLat, lng: inspectedLon },
          map: googleMapRef.current,
          title: '3D Inspected Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#f59e0b',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }
        });
      } else {
        inspectMarkerRef.current.setPosition({ lat: inspectedLat, lng: inspectedLon });
        inspectMarkerRef.current.setVisible(true);
      }
    } else if (inspectMarkerRef.current) {
      inspectMarkerRef.current.setVisible(false);
    }
  }, [inspectedLat, inspectedLon]);

  const handleApplyPreset = (preset: '1x1km' | '2x2km' | '3x3km' | '5x5km' | '10x10km') => {
    setAreaPreset(preset);
    let rad = 1500;
    if (preset === '1x1km') rad = 500;
    else if (preset === '2x2km') rad = 1000;
    else if (preset === '3x3km') rad = 1500;
    else if (preset === '5x5km') rad = 2500;
    else if (preset === '10x10km') rad = 5000;

    const newBounds = calculateBoundsFromRadius(centerLat, centerLon, rad);
    onLocationChange(centerLat, centerLon, rad, newBounds);
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempKeyInput.trim()) return;
    localStorage.setItem('sih_google_maps_key', tempKeyInput.trim());
    setApiKey(tempKeyInput.trim());
    setIsKeyConfigured(true);
    setLoadStatus('LOADING');
  };

  // ─── IF GOOGLE MAPS IS NOT CONFIGURED OR FAILED: DO NOT SILENTLY USE LEAFLET ───
  if (!isKeyConfigured || loadStatus === 'UNCONFIGURED' || loadStatus === 'ERROR') {
    return (
      <div className="bg-[#0d121f] rounded-2xl border border-blue-500/40 p-6 shadow-2xl space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Globe className="w-6 h-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Google Maps Platform &mdash; Primary Geographic Map
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 border border-blue-700/60 text-blue-300 font-mono font-bold">
                  OFFICIAL API
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Authoritative Geographic Search, Navigation, and Area Selection Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSwitchToManualMode && (
              <button
                onClick={onSwitchToManualMode}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-mono font-bold transition-all"
              >
                Manual Coordinates Mode &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Warning / Diagnostic Card */}
        <div className="p-5 bg-blue-950/40 border border-blue-500/30 rounded-2xl space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white tracking-wide uppercase">
                {loadStatus === 'ERROR' ? 'Google Maps API Authorization Notice' : 'Google Maps API Key Configuration Required'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                {loadStatus === 'ERROR' ? (
                  <>Google Maps failed to load: <strong className="text-amber-400">{errorMessage}</strong></>
                ) : (
                  <>
                    To display the live interactive Google Map, Places autocomplete search, and satellite imagery, add your Google Maps API key to <code className="text-cyan-300 bg-slate-950 px-1.5 py-0.5 rounded">frontend/.env</code>:
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-cyan-300">
            <code>VITE_GOOGLE_MAPS_API_KEY=AIzaSy...YourKeyHere</code>
          </div>

          {/* Quick API Key Input Form directly on page */}
          <form onSubmit={handleSaveApiKey} className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <div className="relative flex-1 w-full">
              <Key className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Or paste your Google Maps API key here to test immediately..."
                value={tempKeyInput}
                onChange={(e) => setTempKeyInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-all"
              />
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 hover:scale-105 transition-all flex items-center justify-center gap-2 shrink-0 font-mono"
            >
              <span>Apply Google API Key</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono pt-1">
            <span>Required Google Cloud APIs: <strong>Maps JavaScript API</strong>, <strong>Places API</strong>, <strong>Geocoding API</strong></span>
            <a
              href="https://console.cloud.google.com/google/maps-apis"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-400 hover:underline flex items-center gap-1"
            >
              <span>Get Key from Google Cloud Console</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Fallback Selected Area Telemetry Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase">Default Center</span>
            <div className="text-cyan-400 font-bold mt-0.5">
              {centerLat.toFixed(5)}° N, {centerLon.toFixed(5)}° E
            </div>
          </div>
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase">Metric Area</span>
            <div className="text-emerald-400 font-bold mt-0.5">
              {metrics.widthMeters}m × {metrics.heightMeters}m ({metrics.areaSqKm} km²)
            </div>
          </div>
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase">Reconstruction Engine</span>
            <div className="text-white font-bold mt-0.5">
              DEM + LiDAR + OSM
            </div>
          </div>
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase">Default Pilot</span>
            <div className="text-white font-bold mt-0.5">
              Bengaluru Central (3×3 km)
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        {onGenerate3DWorld && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-xs text-slate-400 font-mono">
              Ready to execute 3D reconstruction for selected Bengaluru coordinates.
            </span>
            <button
              onClick={onGenerate3DWorld}
              disabled={isLoading}
              className="px-6 py-3 bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-105 transition-all flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isLoading ? 'Reconstructing...' : 'GENERATE 3D WORLD'}</span>
            </button>
          </div>
        )}

      </div>
    );
  }

  // ─── GOOGLE MAPS LOADED AND ACTIVE ───
  return (
    <div className="space-y-4">
      {/* Top Map Header with Google Branding, Places Search, and Map Controls */}
      <div className="bg-[#0d121f] rounded-2xl border border-slate-800/80 p-4 shadow-xl space-y-3">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-700/60 text-blue-300 text-xs font-mono font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              MAP ENGINE: Google Maps Platform
            </span>
            <span className="text-xs text-slate-400 font-mono">BENGALURU PILOT</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenGoogle3DContext && (
              <button
                onClick={onOpenGoogle3DContext}
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/50 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span>Google 3D Context</span>
              </button>
            )}

            {onSwitchToManualMode && (
              <button
                onClick={onSwitchToManualMode}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/70 rounded-xl text-xs font-mono transition-colors"
              >
                Manual Coords
              </button>
            )}
          </div>
        </div>

        {/* Places Search Box with Google Places Autocomplete */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-cyan-400" />
          </div>
          <input
            ref={autocompleteInputRef}
            type="text"
            placeholder="Search location (e.g. Bengaluru, Vidhana Soudha, MG Road, Cubbon Park, Nandi Hills)..."
            defaultValue={searchQuery}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono transition-all"
          />
        </div>
        {errorMessage && <p className="text-xs text-amber-400 font-mono">{errorMessage}</p>}

        {/* Map Type & Area Presets Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80 text-xs">
          
          {/* Map Type Switcher (Roadmap, Satellite, Hybrid, Terrain) */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['hybrid', 'satellite', 'roadmap', 'terrain'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setMapType(t); googleMapRef.current?.setMapTypeId(t); }}
                className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-semibold uppercase transition-all ${
                  mapType === t ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Area Presets (1x1km, 2x2km, 3x3km, 5x5km, 10x10km) */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['1x1km', '2x2km', '3x3km', '5x5km', '10x10km'] as const).map((p) => (
              <button
                key={p}
                onClick={() => handleApplyPreset(p)}
                className={`px-2 py-1 rounded-lg font-mono text-[11px] font-semibold transition-all ${
                  areaPreset === p ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.replace('x', ' × ')}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Google Maps Container */}
      <div className="relative w-full h-[520px] rounded-2xl overflow-hidden border border-slate-800/80 shadow-2xl">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* Real-Time Selected Area Geodetic & Metric Telemetry Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0d121f] p-4 rounded-2xl border border-slate-800/80 text-xs font-mono shadow-xl">
        <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
          <span className="text-slate-500 text-[10px] uppercase">Bounding Box (N / S)</span>
          <div className="text-white font-bold mt-0.5">
            North: {metrics.north.toFixed(4)}°<br />
            South: {metrics.south.toFixed(4)}°
          </div>
        </div>

        <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
          <span className="text-slate-500 text-[10px] uppercase">Bounding Box (E / W)</span>
          <div className="text-white font-bold mt-0.5">
            East: {metrics.east.toFixed(4)}°<br />
            West: {metrics.west.toFixed(4)}°
          </div>
        </div>

        <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
          <span className="text-slate-500 text-[10px] uppercase">Center Coordinates</span>
          <div className="text-cyan-400 font-bold mt-0.5">
            {metrics.centerLat.toFixed(5)}° N<br />
            {metrics.centerLon.toFixed(5)}° E
          </div>
        </div>

        <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800">
          <span className="text-slate-500 text-[10px] uppercase">Metric Dimensions</span>
          <div className="text-emerald-400 font-bold mt-0.5">
            {metrics.widthMeters}m × {metrics.heightMeters}m<br />
            {metrics.areaSqKm} km²
          </div>
        </div>
      </div>

      {/* Data Source Architecture Transparency Card & Primary Action Button */}
      <div className="p-4 bg-[#0d121f] rounded-2xl border border-slate-800/80 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono text-slate-400">
          <div>
            <span className="text-slate-500 block uppercase">MAP ENGINE</span>
            <span className="text-blue-400 font-bold">Google Maps Platform</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase">VECTOR DATA</span>
            <span className="text-amber-400 font-bold">OpenStreetMap</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase">TERRAIN SOURCE</span>
            <span className="text-emerald-400 font-bold">LiDAR / Copernicus / SRTM</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase">BUILDING HEIGHTS</span>
            <span className="text-cyan-400 font-bold">LiDAR Survey (95th-p)</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase">3D ENGINE</span>
            <span className="text-purple-400 font-bold">Three.js 1:1 Metric</span>
          </div>
        </div>

        {onGenerate3DWorld && (
          <button
            onClick={onGenerate3DWorld}
            disabled={isLoading}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-105 transition-all flex items-center justify-center gap-2 shrink-0 font-mono"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isLoading ? 'Reconstructing...' : 'GENERATE 3D WORLD'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
