import React, { useState, useEffect, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Circle, 
  Rectangle, 
  useMap, 
  useMapEvents 
} from 'react-leaflet';
import L from 'leaflet';
import { 
  Search, 
  Crosshair, 
  Layers, 
  Maximize2, 
  Sliders, 
  MapPin, 
  Compass,
  CheckCircle2
} from 'lucide-react';
import { LatLonBounds, SampleRegion } from '../../types';
import { api } from '../../services/api';

// Custom Leaflet Pin Icon
const pinIcon = L.divIcon({
  className: 'custom-map-pin',
  html: `
    <div style="
      width: 28px;
      height: 28px;
      background: radial-gradient(circle, #00e5ff 30%, #0284c7 90%);
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 16px rgba(0,229,255,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #000;
      font-weight: bold;
    ">
      <div style="width: 8px; height: 8px; background: #fff; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface MapPickerProps {
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  onLocationChange: (lat: number, lon: number, radius: number, bounds: LatLonBounds) => void;
  samples: SampleRegion[];
  onSelectSample: (sampleId: string) => void;
}

// Controller component to smoothly fly map to new center
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
};

// Map click listener
const MapEvents: React.FC<{ onMapClick: (lat: number, lon: number) => void }> = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export const MapPicker: React.FC<MapPickerProps> = ({
  centerLat,
  centerLon,
  radiusMeters,
  onLocationChange,
  samples,
  onSelectSample,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: number; lon: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mapType, setMapType] = useState<'dark' | 'satellite'>('satellite');
  
  // Calculate bounds
  const latDelta = radiusMeters / 111320.0;
  const lonDelta = radiusMeters / (111320.0 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));
  
  const currentBounds: LatLonBounds = {
    min_lat: Number((centerLat - latDelta).toFixed(6)),
    max_lat: Number((centerLat + latDelta).toFixed(6)),
    min_lon: Number((centerLon - lonDelta).toFixed(6)),
    max_lon: Number((centerLon + lonDelta).toFixed(6)),
    center_lat: centerLat,
    center_lon: centerLon,
    radius_meters: radiusMeters,
  };

  const areaSqKm = Number(((latDelta * 2 * 111.32) * (lonDelta * 2 * 111.32 * Math.cos((centerLat * Math.PI) / 180))).toFixed(2));

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await api.searchGeocode(searchQuery);
      setSearchResults(res);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (lat: number, lon: number) => {
    onLocationChange(lat, lon, radiusMeters, {
      ...currentBounds,
      center_lat: lat,
      center_lon: lon,
      min_lat: Number((lat - latDelta).toFixed(6)),
      max_lat: Number((lat + latDelta).toFixed(6)),
      min_lon: Number((lon - lonDelta).toFixed(6)),
      max_lon: Number((lon + lonDelta).toFixed(6)),
    });
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleRadiusChange = (newRadius: number) => {
    const newLatDelta = newRadius / 111320.0;
    const newLonDelta = newRadius / (111320.0 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));
    onLocationChange(centerLat, centerLon, newRadius, {
      min_lat: Number((centerLat - newLatDelta).toFixed(6)),
      max_lat: Number((centerLat + newLatDelta).toFixed(6)),
      min_lon: Number((centerLon - newLonDelta).toFixed(6)),
      max_lon: Number((centerLon + newLonDelta).toFixed(6)),
      center_lat: centerLat,
      center_lon: centerLon,
      radius_meters: newRadius,
    });
  };

  const rectangleBounds: [[number, number], [number, number]] = [
    [currentBounds.min_lat, currentBounds.min_lon],
    [currentBounds.max_lat, currentBounds.max_lon],
  ];

  return (
    <div className="flex flex-col h-full bg-[#0d121f] rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl">
      
      {/* Top Bar: Search and Presets */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          
          {/* Search bar */}
          <form onSubmit={handleSearch} className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, mountain, region (e.g. Mount Fuji, Himalayas, Nandi Hills)..."
              className="w-full pl-9 pr-24 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors"
            >
              {isSearching ? 'Searching...' : 'Locate'}
            </button>
          </form>

          {/* Layer switcher */}
          <div className="flex items-center bg-slate-950 border border-slate-700/80 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setMapType('satellite')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                mapType === 'satellite'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Satellite
            </button>
            <button
              type="button"
              onClick={() => setMapType('dark')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                mapType === 'dark'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              Topographic
            </button>
          </div>
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="bg-slate-950 border border-cyan-500/40 rounded-xl p-2 max-h-48 overflow-y-auto space-y-1">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelectResult(r.lat, r.lon)}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-cyan-950/60 hover:text-cyan-200 rounded-lg transition-colors flex items-center gap-2"
              >
                <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick Sample Presets */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-slate-400 font-medium whitespace-nowrap flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-cyan-400" /> Presets:
          </span>
          {samples.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSample(s.id)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 hover:text-cyan-300 border border-slate-700 transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              <span>{s.name.split('(')[0]}</span>
              <span className="text-[10px] text-cyan-400/80 font-mono">({s.peak_elevation}m)</span>
            </button>
          ))}
        </div>
      </div>

      {/* Leaflet Map Interactive Viewport */}
      <div className="relative flex-1 min-h-[380px]">
        <MapContainer
          center={[centerLat, centerLon]}
          zoom={12}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <MapController center={[centerLat, centerLon]} zoom={12} />
          <MapEvents
            onMapClick={(lat, lon) => {
              onLocationChange(lat, lon, radiusMeters, {
                ...currentBounds,
                center_lat: lat,
                center_lon: lon,
                min_lat: Number((lat - latDelta).toFixed(6)),
                max_lat: Number((lat + latDelta).toFixed(6)),
                min_lon: Number((lon - lonDelta).toFixed(6)),
                max_lon: Number((lon + lonDelta).toFixed(6)),
              });
            }}
          />

          {mapType === 'satellite' ? (
            <TileLayer
              attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={18}
            />
          ) : (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              maxZoom={19}
            />
          )}

          {/* Area of interest circle & bounding rectangle */}
          <Circle
            center={[centerLat, centerLon]}
            radius={radiusMeters}
            pathOptions={{
              color: '#00e5ff',
              fillColor: '#00e5ff',
              fillOpacity: 0.12,
              weight: 2,
              dashArray: '4, 6',
            }}
          />
          <Rectangle
            bounds={rectangleBounds}
            pathOptions={{
              color: '#38bdf8',
              fillColor: 'transparent',
              weight: 1.5,
            }}
          />

          {/* Center Marker */}
          <Marker position={[centerLat, centerLon]} icon={pinIcon} />
        </MapContainer>

        {/* Floating Coordinates & Area Pill */}
        <div className="absolute bottom-4 left-4 z-[400] bg-slate-950/90 backdrop-blur-md border border-cyan-500/30 rounded-xl px-4 py-2.5 shadow-xl text-xs space-y-1 font-mono">
          <div className="flex items-center gap-3">
            <span className="text-slate-400">LAT: <strong className="text-cyan-300">{centerLat.toFixed(4)}°</strong></span>
            <span className="text-slate-400">LON: <strong className="text-cyan-300">{centerLon.toFixed(4)}°</strong></span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-slate-400">RADIUS: <strong className="text-slate-200">{(radiusMeters / 1000).toFixed(1)} km</strong></span>
            <span className="text-slate-400">BOUNDS AREA: <strong className="text-emerald-400">{areaSqKm} km²</strong></span>
          </div>
        </div>

        {/* Map Click Instructions */}
        <div className="absolute top-4 right-4 z-[400] bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 shadow-md flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          Click anywhere on map to reposition center
        </div>
      </div>

      {/* Bottom Area Size & Radius Slider */}
      <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1 w-full space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Area Radius:
            </span>
            <span className="font-mono text-cyan-300 font-semibold">
              {(radiusMeters / 1000).toFixed(1)} km ({(radiusMeters * 2 / 1000).toFixed(1)} × {(radiusMeters * 2 / 1000).toFixed(1)} km grid)
            </span>
          </div>
          <input
            type="range"
            min={1000}
            max={15000}
            step={500}
            value={radiusMeters}
            onChange={(e) => handleRadiusChange(Number(e.target.value))}
            className="w-full cursor-pointer accent-cyan-400"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3 py-1.5 rounded-lg bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 text-xs font-mono font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span>Ready to Reconstruct</span>
          </div>
        </div>
      </div>

    </div>
  );
};
