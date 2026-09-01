import React, { useState, useEffect, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  Circle, 
  Rectangle, 
  Polygon,
  CircleMarker,
  Popup,
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
  CheckCircle2,
  Sparkles,
  Globe,
  AlertTriangle,
  Flame
} from 'lucide-react';
import { LatLonBounds, SampleRegion, LandslideAnalysisResponse, LandslideHotspot } from '../../types';

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

// Inspected Point Pin Icon for Map-3D sync
const inspectPinIcon = L.divIcon({
  className: 'custom-inspect-pin',
  html: `
    <div style="
      width: 20px;
      height: 20px;
      background: radial-gradient(circle, #f59e0b 40%, #d97706 90%);
      border: 2px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 14px rgba(245,158,11,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="width: 6px; height: 6px; background: #fff; border-radius: 50%;"></div>
    </div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

interface MapPickerProps {
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  onLocationChange: (lat: number, lon: number, radius: number, bounds: LatLonBounds) => void;
  samples: SampleRegion[];
  onSelectSample: (sampleId: string) => void;
  inspectedLat?: number;
  inspectedLon?: number;
  onGenerate3DWorld?: () => void;
  isLoading?: boolean;
  landslideData?: LandslideAnalysisResponse | null;
  onSelectHotspot?: (hs: LandslideHotspot) => void;
}

// Controller component to smoothly fly map to new center & invalidate size
const MapController: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.flyTo(center, zoom, { duration: 1.0 });
  }, [center, zoom, map]);

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);

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
  inspectedLat,
  inspectedLon,
  onGenerate3DWorld,
  isLoading = false,
  landslideData,
  onSelectHotspot,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: number; lon: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [mapType, setMapType] = useState<'osm' | 'satellite' | 'terrain'>('satellite');
  
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
    radius_meters: radiusMeters
  };

  const rectangleBounds: [[number, number], [number, number]] = [
    [currentBounds.min_lat, currentBounds.min_lon],
    [currentBounds.max_lat, currentBounds.max_lon]
  ];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      const formatted = (data || []).map((item: any) => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      }));
      setSearchResults(formatted);
      if (formatted.length > 0) {
        handleSelectResult(formatted[0].lat, formatted[0].lon);
      }
    } catch (err) {
      console.error('Geocode search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (lat: number, lon: number) => {
    const latD = radiusMeters / 111320.0;
    const lonD = radiusMeters / (111320.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
    onLocationChange(lat, lon, radiusMeters, {
      min_lat: Number((lat - latD).toFixed(6)),
      max_lat: Number((lat + latD).toFixed(6)),
      min_lon: Number((lon - lonD).toFixed(6)),
      max_lon: Number((lon + lonD).toFixed(6)),
      center_lat: lat,
      center_lon: lon,
      radius_meters: radiusMeters,
    });
    setSearchResults([]);
  };

  const handleApplyPreset = (radiusM: number) => {
    const lDelta = radiusM / 111320.0;
    const lnDelta = radiusM / (111320.0 * Math.max(0.01, Math.cos((centerLat * Math.PI) / 180)));
    onLocationChange(centerLat, centerLon, radiusM, {
      center_lat: centerLat,
      center_lon: centerLon,
      min_lat: Number((centerLat - lDelta).toFixed(6)),
      max_lat: Number((centerLat + lDelta).toFixed(6)),
      min_lon: Number((centerLon - lnDelta).toFixed(6)),
      max_lon: Number((centerLon + lnDelta).toFixed(6)),
      radius_meters: radiusM
    });
  };

  const areaSqKm = ((currentBounds.max_lat - currentBounds.min_lat) * 111.32 * (currentBounds.max_lon - currentBounds.min_lon) * 111.32 * Math.cos((centerLat * Math.PI) / 180)).toFixed(2);
  const widthMeters = Math.round((currentBounds.max_lon - currentBounds.min_lon) * 111320.0 * Math.cos((centerLat * Math.PI) / 180));
  const heightMeters = Math.round((currentBounds.max_lat - currentBounds.min_lat) * 111320.0);

  return (
    <div className="flex flex-col h-full bg-[#0d121f] rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden space-y-0">
      
      {/* Top Map Toolbar: Search + Layer Selector */}
      <div className="p-3.5 bg-slate-950/95 border-b border-slate-800/80 space-y-3">
        
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Map Engine Badge */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-950/80 border border-blue-700/60 text-blue-300 text-xs font-mono font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              MAP ENGINE: Leaflet / OpenStreetMap
            </span>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[280px] flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-cyan-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search location (e.g. Bengaluru, MG Road, Vidhana Soudha)..."
                className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl font-mono transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSearching ? <span className="animate-spin">⌛</span> : <Crosshair className="w-3.5 h-3.5" />}
              <span>Locate</span>
            </button>
          </form>

          {/* Map Layer Switcher */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setMapType('satellite')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                mapType === 'satellite'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-cyan-300" />
              <span>Satellite</span>
            </button>

            <button
              onClick={() => setMapType('osm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                mapType === 'osm'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              OpenStreetMap
            </button>

            <button
              onClick={() => setMapType('terrain')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
                mapType === 'terrain'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Terrain
            </button>
          </div>
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="p-2 bg-slate-900 border border-slate-700 rounded-xl space-y-1 shadow-2xl max-h-48 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => handleSelectResult(r.lat, r.lon)}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-cyan-950/60 hover:text-cyan-200 rounded-lg transition-colors flex items-center gap-2 font-mono"
              >
                <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="truncate">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}


      </div>

      {/* Interactive Map Viewport with Leaflet TileLayers */}
      <div className="relative w-full h-[520px] min-h-[500px] bg-slate-950">
        <MapContainer
          center={[centerLat, centerLon]}
          zoom={14}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%', minHeight: '500px' }}
        >
          <MapController center={[centerLat, centerLon]} zoom={14} />
          
          <MapEvents
            onMapClick={(lat, lon) => {
              const lDelta = radiusMeters / 111320.0;
              const lnDelta = radiusMeters / (111320.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
              onLocationChange(lat, lon, radiusMeters, {
                center_lat: lat,
                center_lon: lon,
                min_lat: Number((lat - lDelta).toFixed(6)),
                max_lat: Number((lat + lDelta).toFixed(6)),
                min_lon: Number((lon - lnDelta).toFixed(6)),
                max_lon: Number((lon + lnDelta).toFixed(6)),
                radius_meters: radiusMeters,
              });
            }}
          />

          {/* 1. Esri World Imagery (Satellite) */}
          {mapType === 'satellite' && (
            <TileLayer
              attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          )}

          {/* 2. Standard OpenStreetMap */}
          {mapType === 'osm' && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          )}

          {/* 3. OpenTopoMap (Terrain) */}
          {mapType === 'terrain' && (
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              maxZoom={17}
            />
          )}

          {/* Area of interest circle & bounding rectangle */}
          <Circle
            center={[centerLat, centerLon]}
            radius={radiusMeters}
            pathOptions={{
              color: '#00e5ff',
              fillColor: '#00e5ff',
              fillOpacity: 0.1,
              weight: 2,
              dashArray: '4, 6',
            }}
          />
          <Rectangle
            bounds={rectangleBounds}
            pathOptions={{
              color: '#38bdf8',
              fillColor: '#0284c7',
              fillOpacity: 0.15,
              weight: 2,
            }}
          />

          {/* 2D Landslide Hotspot Polygons & Popups (Top 3 Critical) */}
          {landslideData?.hotspots && landslideData.hotspots.slice(0, 3).map((hs) => {
            const poly = hs.polygon_bounds || [
              [hs.centroid_lat + 0.001, hs.centroid_lon - 0.001],
              [hs.centroid_lat + 0.001, hs.centroid_lon + 0.001],
              [hs.centroid_lat - 0.001, hs.centroid_lon + 0.001],
              [hs.centroid_lat - 0.001, hs.centroid_lon - 0.001],
            ];
            const isVeryHigh = hs.risk_class === 'VERY HIGH';
            return (
              <Polygon
                key={hs.id}
                positions={poly as [number, number][]}
                pathOptions={{
                  color: isVeryHigh ? '#ef4444' : '#f97316',
                  fillColor: isVeryHigh ? '#ef4444' : '#f97316',
                  fillOpacity: 0.45,
                  weight: 2,
                }}
                eventHandlers={{
                  click: () => {
                    if (onSelectHotspot) onSelectHotspot(hs);
                  }
                }}
              >
                <Popup>
                  <div className="font-mono text-xs p-1 space-y-1">
                    <div className="font-bold text-slate-900 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span>{hs.name} ({hs.risk_class})</span>
                    </div>
                    <div>Area: <strong>{hs.area_sq_m} m²</strong></div>
                    <div>Mean Slope: <strong>{hs.mean_slope_deg}°</strong> (Max: {hs.max_slope_deg}°)</div>
                    <div>Peak Susceptibility: <strong>{hs.peak_susceptibility}</strong></div>
                    <div className="text-[10px] text-slate-500 italic">Screening result — not a prediction</div>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {/* Real Historical Landslide Markers (NASA GLC / ISRO LAI) */}
          {landslideData?.historical_events && landslideData.historical_events.map((ev) => (
            <CircleMarker
              key={ev.id}
              center={[ev.latitude, ev.longitude]}
              radius={8}
              pathOptions={{
                color: ev.is_captured ? '#ef4444' : '#f59e0b',
                fillColor: ev.is_captured ? '#ef4444' : '#f59e0b',
                fillOpacity: 0.85,
                weight: 2,
              }}
            >
              <Popup>
                <div className="font-mono text-xs p-1.5 space-y-1 max-w-[220px]">
                  <div className="font-bold text-rose-700 flex items-center gap-1">
                    <Flame className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{ev.id}</span>
                  </div>
                  <div>Trigger: <strong>{ev.trigger}</strong></div>
                  <div>Event Date: <strong>{ev.event_date || 'Cataloged'}</strong></div>
                  <div>Confidence: <strong className="text-emerald-700">{ev.confidence}</strong></div>
                  <div>Source: <strong>{ev.source}</strong></div>
                  {ev.citation && <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-200">{ev.citation}</div>}
                  {ev.predicted_risk_class && (
                    <div className="text-[10px] font-bold p-1 rounded bg-slate-100 text-slate-800">
                      Predicted: {ev.predicted_risk_class} ({ev.predicted_score}) {ev.is_captured ? '✓ Captured' : '— Missed'}
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* Selected Center Pin */}
          <Marker position={[centerLat, centerLon]} icon={pinIcon} />

          {/* 3D Inspected Pin (Synchronized from 3D Viewport clicks) */}
          {inspectedLat && inspectedLon && (
            <Marker position={[inspectedLat, inspectedLon]} icon={inspectPinIcon} />
          )}
        </MapContainer>
      </div>

      {/* Bottom Coordinates, Area Presets, & Generate Action Bar */}
      <div className="px-4 py-3 bg-slate-950/95 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3">
          <span className="text-slate-400">
            Center: <strong className="text-cyan-300">{centerLat.toFixed(5)}° N, {centerLon.toFixed(5)}° E</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            Scale: <strong className="text-emerald-400">{widthMeters}m × {heightMeters}m ({areaSqKm} km²)</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleApplyPreset(500)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                radiusMeters === 500 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              1.0 × 1.0 km
            </button>
            <button
              onClick={() => handleApplyPreset(1000)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                radiusMeters === 1000 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              2.0 × 2.0 km
            </button>
            <button
              onClick={() => handleApplyPreset(1500)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                radiusMeters === 1500 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              3.0 × 3.0 km
            </button>
            <button
              onClick={() => handleApplyPreset(2500)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                radiusMeters === 2500 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              5.0 × 5.0 km
            </button>
          </div>

          {/* Primary Action Button */}
          {onGenerate3DWorld && (
            <button
              onClick={onGenerate3DWorld}
              disabled={isLoading}
              className="px-5 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 hover:scale-105 transition-all flex items-center gap-1.5 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Reconstructing...' : 'GENERATE 3D WORLD'}</span>
            </button>
          )}
        </div>
      </div>

    </div>
  );
};
