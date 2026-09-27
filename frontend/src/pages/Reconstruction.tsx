import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  MapPin, 
  Image as ImageIcon, 
  Compass, 
  Sparkles, 
  ArrowRight, 
  Eye, 
  Sliders, 
  CheckCircle2,
  Crosshair,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Activity,
  FileCode2,
  UploadCloud,
  Globe2,
  Mountain,
  AlertTriangle
} from 'lucide-react';
import { 
  SampleRegion, 
  TerrainReconstructResponse, 
  LatLonBounds, 
  ImageAnalysisResponse, 
  VisualMode, 
  ColormapMode, 
  InteractionTool, 
  PointInspection, 
  TwoPointMeasurementResponse, 
  PointValidation, 
  ValidationReport, 
  LiDARProcessResponse, 
  LandslideAnalysisResponse, 
  LandslideInspection, 
  LandslideHotspot 
} from '../types';
import { MapPicker } from '../components/Map/MapPicker';
import { ImageUploader } from '../components/ImageUploader/ImageUploader';
import { TerrainCanvas } from '../components/TerrainViewer/TerrainCanvas';
import { TerrainControls } from '../components/TerrainControls/TerrainControls';
import { AnalysisPanel } from '../components/AnalysisPanel/AnalysisPanel';
import { ElevationPanel } from '../components/ElevationPanel/ElevationPanel';
import { TerrainProfileModal } from '../components/TerrainViewer/TerrainProfileModal';
import { AccuracyModal } from '../components/ValidationPanel/AccuracyModal';
import { api } from '../services/api';
import * as THREE from 'three';

interface ReconstructionProps {
  samples: SampleRegion[];
  selectedSample?: string;
  onSelectSample: (sampleId: string) => void;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  onLocationChange: (lat: number, lon: number, radius: number, bounds: LatLonBounds) => void;
  bounds: LatLonBounds;
  onReconstruct: (params?: any) => void;
  isLoading: boolean;
  terrainData: TerrainReconstructResponse | null;
  dataMode: 'real' | 'demo';
  onDataModeChange: (mode: 'real' | 'demo') => void;
  onImageAnalyzed: (analysis: ImageAnalysisResponse) => void;
  onSetTerrainData?: (data: TerrainReconstructResponse) => void;
  onNavigateToStudio: () => void;
}

export const Reconstruction: React.FC<ReconstructionProps> = ({
  samples,
  selectedSample,
  onSelectSample,
  centerLat,
  centerLon,
  radiusMeters,
  onLocationChange,
  bounds,
  onReconstruct,
  isLoading,
  terrainData,
  dataMode = 'real',
  onDataModeChange,
  onImageAnalyzed,
  onSetTerrainData,
  onNavigateToStudio,
}) => {
  const [inputTab, setInputTab] = useState<'map' | 'coords' | 'image' | 'lidar'>('map');
  const [customLat, setCustomLat] = useState<string>(centerLat.toString());
  const [customLon, setCustomLon] = useState<string>(centerLon.toString());
  const [customRadius, setCustomRadius] = useState<string>(radiusMeters.toString());

  // 3D Controls state (1.0x True Scale by default!)
  const [exaggeration, setExaggeration] = useState<number>(1.0);
  const [visualMode, setVisualMode] = useState<VisualMode>('elevation');
  const [colormap, setColormap] = useState<ColormapMode>('hypsometric');
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showSatelliteTexture, setShowSatelliteTexture] = useState<boolean>(true);
  const [showContours, setShowContours] = useState<boolean>(false);
  const [contourInterval, setContourInterval] = useState<number>(20);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<InteractionTool>('inspect');
  const [sunAzimuth, setSunAzimuth] = useState<number>(315);
  const [sunAltitude, setSunAltitude] = useState<number>(45);
  const [hillshadeIntensity, setHillshadeIntensity] = useState<number>(1.0);

  // Point inspection & measurement state
  const [selectedPoint, setSelectedPoint] = useState<PointInspection | null>(null);
  const [pointValidation, setPointValidation] = useState<PointValidation | null>(null);
  const [pointAPos, setPointAPos] = useState<THREE.Vector3 | null>(null);
  const [pointAData, setPointAData] = useState<PointInspection | null>(null);
  const [pointBPos, setPointBPos] = useState<THREE.Vector3 | null>(null);
  const [pointBData, setPointBData] = useState<PointInspection | null>(null);
  const [measurement, setMeasurement] = useState<TwoPointMeasurementResponse | null>(null);

  // Modals state
  const [isAccuracyModalOpen, setIsAccuracyModalOpen] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // LiDAR upload state
  const [lidarLoading, setLidarLoading] = useState(false);
  const [lidarResult, setLidarResult] = useState<LiDARProcessResponse | null>(null);

  // Landslide Susceptibility State
  const [landslideData, setLandslideData] = useState<LandslideAnalysisResponse | null>(null);
  const [landslideLoading, setLandslideLoading] = useState<boolean>(false);
  const [landslideScenario, setLandslideScenario] = useState<'normal' | 'heavy' | 'extreme'>('normal');
  const [landslideInspection, setLandslideInspection] = useState<LandslideInspection | null>(null);
  const [showHistoricalLandslides, setShowHistoricalLandslides] = useState<boolean>(true);

  const handleRunLandslideAnalysis = async (scenario: 'normal' | 'heavy' | 'extreme' = landslideScenario) => {
    if (!terrainData) return;
    setLandslideLoading(true);
    try {
      const resp = await api.runLandslideAnalysis({
        bounds: terrainData.bounds,
        terrain_id: terrainData.terrain_id,
        grid_resolution: terrainData.grid_resolution,
        provider: terrainData.provider_used,
        parameters: { scenario }
      });
      setLandslideData(resp);
    } catch (err) {
      console.error('Failed to run landslide analysis:', err);
    } finally {
      setLandslideLoading(false);
    }
  };

  const handleSelectPointWithLandslide = async (pt: PointInspection | null) => {
    setSelectedPoint(pt);
    if (!pt || !terrainData) {
      setLandslideInspection(null);
      return;
    }
    try {
      const inspectRes = await api.inspectLandslidePoint({
        latitude: pt.latitude,
        longitude: pt.longitude,
        bounds: terrainData.bounds,
        scenario: landslideScenario
      });
      setLandslideInspection(inspectRes);
    } catch (err) {
      console.error('Failed to inspect landslide point:', err);
    }
  };

  const handleHotspotClick = (hs: LandslideHotspot) => {
    handleSelectPointWithLandslide({
      elevation: 0,
      slope: hs.mean_slope_deg,
      aspect: 0,
      aspect_cardinal: 'N',
      latitude: hs.centroid_lat,
      longitude: hs.centroid_lon,
      grid_x: 0,
      grid_y: 0,
      x_metric_m: hs.centroid_x_m,
      y_metric_m: hs.centroid_z_m,
      source: terrainData?.provider_used || 'Copernicus DEM GLO-30',
      source_type: 'DSM',
      native_resolution: '~30m',
      vertical_datum: 'EGM96 / EGM2008',
      sampling_method: 'Hotspot Centroid Inspection',
      coordinate_system: 'EPSG:4326',
      measurement_quality: 'Hotspot Screening Cluster',
      accuracy_statement: `Screening hotspot ${hs.name} (${hs.risk_class} risk)`
    });
  };

  const handleApplyCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    const rad = parseFloat(customRadius) || 2500;
    if (isNaN(lat) || isNaN(lon)) return;

    const latDelta = rad / 111320.0;
    const lonDelta = rad / (111320.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

    const newBounds = {
      min_lat: Number((lat - latDelta).toFixed(6)),
      max_lat: Number((lat + latDelta).toFixed(6)),
      min_lon: Number((lon - lonDelta).toFixed(6)),
      max_lon: Number((lon + lonDelta).toFixed(6)),
      center_lat: lat,
      center_lon: lon,
      radius_meters: rad,
    };

    onLocationChange(lat, lon, rad, newBounds);
    onReconstruct({
      latitude: lat,
      longitude: lon,
      radius: rad,
      bounds: newBounds,
      data_mode: dataMode
    });
  };

  const handleSetMeasurement = (
    ptA: PointInspection | null,
    posA: THREE.Vector3 | null,
    ptB: PointInspection | null,
    posB: THREE.Vector3 | null,
    meas: TwoPointMeasurementResponse | null
  ) => {
    setPointAData(ptA);
    setPointAPos(posA);
    setPointBData(ptB);
    setPointBPos(posB);
    setMeasurement(meas);
  };

  const handleOpenAccuracyReport = async () => {
    setIsAccuracyModalOpen(true);
    if (terrainData) {
      setIsValidating(true);
      try {
        const report = await api.runAccuracyValidation({
          bounds: terrainData.bounds,
          grid_resolution: terrainData.grid_resolution,
          sample_count: 100,
          provider: terrainData.provider_used,
          sample_id: terrainData.region_name,
          data_mode: dataMode
        });
        setValidationReport(report);
      } catch (e) {
        console.error(e);
      } finally {
        setIsValidating(false);
      }
    }
  };

  const handleLiDARUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLidarLoading(true);
    try {
      const res = await api.processLiDARFile(file, 'dtm', 128);
      setLidarResult(res);
      const midLat = (res.bounds.min_lat + res.bounds.max_lat) / 2.0;
      const midLon = (res.bounds.min_lon + res.bounds.max_lon) / 2.0;
      onLocationChange(
        midLat,
        midLon,
        2500,
        res.bounds
      );
      // Immediately reconstruct 3D terrain from uploaded LiDAR DTM
      if (onReconstruct) {
        onReconstruct({
          bounds: res.bounds,
          latitude: midLat,
          longitude: midLon,
          provider: 'lidar',
          data_mode: 'real',
        });
      }
    } catch (err: any) {
      alert(err.message || 'LiDAR upload failed');
    } finally {
      setLidarLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Terrain Reconstruction Pipeline
          </h1>
        </div>

        {/* Data Mode Switcher + Action Header Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* REAL DATA MODE vs DEMO MODE Switcher (Requirement #1) */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => onDataModeChange('real')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                dataMode === 'real'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              REAL DATA MODE
            </button>
            <button
              onClick={() => onDataModeChange('demo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                dataMode === 'demo'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              DEMO MODE
            </button>
          </div>
        </div>
      </div>



      {/* Input Selection Tabs (Method 1: Map, Method 2: Coords, Method 3: Image, Method 4: LiDAR) */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 w-fit">
        <button
          onClick={() => setInputTab('map')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            inputTab === 'map'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Method 1 &mdash; Map & Search</span>
        </button>

        <button
          onClick={() => setInputTab('coords')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            inputTab === 'coords'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Method 2 &mdash; Coordinates</span>
        </button>

        <button
          onClick={() => setInputTab('image')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            inputTab === 'image'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Method 3 &mdash; Single Image</span>
        </button>

        <button
          onClick={() => setInputTab('lidar')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
            inputTab === 'lidar'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          <span>Method 4 &mdash; LiDAR LAS/LAZ</span>
        </button>
      </div>

      {/* Input Panels */}
      {/* Tab 1: Map & Search (Leaflet / OpenStreetMap / Satellite) */}
      {inputTab === 'map' && (
        <div className="w-full">
          <MapPicker
            centerLat={centerLat}
            centerLon={centerLon}
            radiusMeters={radiusMeters}
            onLocationChange={onLocationChange}
            samples={samples}
            onSelectSample={(sampleId) => {
              onSelectSample(sampleId);
            }}
            inspectedLat={selectedPoint?.latitude}
            inspectedLon={selectedPoint?.longitude}
            onGenerate3DWorld={() => {
              onReconstruct({ contour_interval_m: contourInterval, hillshade_intensity: hillshadeIntensity, data_mode: dataMode });
            }}
            isLoading={isLoading}
            landslideData={landslideData}
            onSelectHotspot={handleHotspotClick}
          />
        </div>
      )}

      {inputTab === 'coords' && (
        <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-cyan-400" />
              <span>Enter Exact Coordinates & Reconstruct</span>
            </h3>
            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60">
              Copernicus GLO-30 / SRTM 30m Global DEM
            </span>
          </div>

          {/* Quick Preset Location Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] text-slate-400 font-mono">Quick Benchmarks:</span>
            {[
              { name: 'Mt. Everest (Himalayas)', lat: 27.9881, lon: 86.9250, r: 4000 },
              { name: 'Grand Canyon (USA)', lat: 36.1069, lon: -112.1129, r: 3500 },
              { name: 'Wayanad High-Risk (India)', lat: 11.5380, lon: 76.1320, r: 2500 },
              { name: 'Matterhorn (Alps)', lat: 45.9763, lon: 7.6586, r: 3000 },
              { name: 'Mount Fuji (Japan)', lat: 35.3606, lon: 138.7274, r: 5000 },
            ].map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setCustomLat(p.lat.toString());
                  setCustomLon(p.lon.toString());
                  setCustomRadius(p.r.toString());
                  const latDelta = p.r / 111320.0;
                  const lonDelta = p.r / (111320.0 * Math.max(0.01, Math.cos((p.lat * Math.PI) / 180)));
                  const nb = {
                    min_lat: Number((p.lat - latDelta).toFixed(6)),
                    max_lat: Number((p.lat + latDelta).toFixed(6)),
                    min_lon: Number((p.lon - lonDelta).toFixed(6)),
                    max_lon: Number((p.lon + lonDelta).toFixed(6)),
                    center_lat: p.lat,
                    center_lon: p.lon,
                    radius_meters: p.r,
                  };
                  onLocationChange(p.lat, p.lon, p.r, nb);
                  onReconstruct({ latitude: p.lat, longitude: p.lon, radius: p.r, bounds: nb, data_mode: dataMode });
                }}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/40 rounded-lg text-[11px] font-mono text-slate-300 hover:text-cyan-300 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleApplyCoordinates} className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Latitude (-90 to +90)
              </label>
              <input
                type="number"
                step="any"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                placeholder="e.g. 12.9716"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Longitude (-180 to +180)
              </label>
              <input
                type="number"
                step="any"
                value={customLon}
                onChange={(e) => setCustomLon(e.target.value)}
                placeholder="e.g. 77.5946"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1">
                Radius in Meters
              </label>
              <input
                type="number"
                step="100"
                min="500"
                max="50000"
                value={customRadius}
                onChange={(e) => setCustomRadius(e.target.value)}
                placeholder="e.g. 2500"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-cyan-300 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="sm:col-span-3 flex justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Reconstructing Real 3D DEM...' : '⚡ Reconstruct 3D Model From Coordinates'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {inputTab === 'image' && (
        <ImageUploader
          onImageAnalyzed={onImageAnalyzed}
          samples={samples}
          onUseSampleImage={onSelectSample}
          onReconstructFromImage={onSetTerrainData}
          onApplyImageCoordinates={(lat, lon) => {
            const rad = radiusMeters || 2500;
            const latDelta = rad / 111320.0;
            const lonDelta = rad / (111320.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
            const nb = {
              min_lat: Number((lat - latDelta).toFixed(6)),
              max_lat: Number((lat + latDelta).toFixed(6)),
              min_lon: Number((lon - lonDelta).toFixed(6)),
              max_lon: Number((lon + lonDelta).toFixed(6)),
              center_lat: lat,
              center_lon: lon,
              radius_meters: rad,
            };
            onLocationChange(lat, lon, rad, nb);
            onReconstruct({ latitude: lat, longitude: lon, radius: rad, bounds: nb, data_mode: dataMode });
          }}
        />
      )}

      {inputTab === 'lidar' && (
        <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 shadow-2xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-cyan-400" />
              Airborne LiDAR Point Cloud Upload (.las / .laz / .tif)
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
              Bare-Earth ASPRS Class 2 Filtering
            </span>
          </div>

          <div className="border-2 border-dashed border-slate-700/80 hover:border-cyan-400/80 rounded-2xl p-8 text-center transition-all bg-slate-950/50">
            <UploadCloud className="w-12 h-12 text-cyan-400 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-slate-200 mb-1">
              Select LiDAR Point Cloud (.las / .laz / .tif)
            </h4>
            <p className="text-xs text-slate-500 mb-4 max-w-md mx-auto">
              Automated bare-earth classification filters vegetation & buildings to construct high-density metric DTMs.
            </p>

            <input
              type="file"
              accept=".las,.laz,.tif,.tiff"
              onChange={handleLiDARUpload}
              className="hidden"
              id="lidar-file-input"
            />
            <label
              htmlFor="lidar-file-input"
              className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg cursor-pointer transition-colors inline-block"
            >
              {lidarLoading ? 'Processing Point Cloud...' : 'Choose LiDAR File'}
            </label>
          </div>

          {lidarResult && (
            <div className="p-4 bg-slate-950 rounded-xl border border-emerald-500/40 space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-slate-900 pb-2">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  LiDAR Point Cloud Processed: {lidarResult.file_name} ({lidarResult.point_count.toLocaleString()} points)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {lidarResult.has_ground_classification ? 'ASPRS Class 2 Ground Filtered' : 'Unclassified Cloud'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300 text-[11px]">
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[9px] text-slate-500 block">POINT DENSITY</span>
                  <strong className="text-cyan-300">{lidarResult.point_density_sq_m.toFixed(4)} pts/m²</strong>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[9px] text-slate-500 block">NOMINAL SPACING</span>
                  <strong className="text-cyan-300">~{lidarResult.point_spacing_m.toFixed(2)} m</strong>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[9px] text-slate-500 block">ELEVATION RANGE</span>
                  <strong className="text-emerald-300">{lidarResult.elevation_stats.min_z}m to {lidarResult.elevation_stats.max_z}m</strong>
                </div>
                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                  <span className="text-[9px] text-slate-500 block">VERTICAL RELIEF</span>
                  <strong className="text-amber-300">{lidarResult.elevation_stats.range_z} m</strong>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-900 italic">
                {lidarResult.accuracy_statement}
              </div>

              <button
                onClick={() => {
                  const midLat = (lidarResult.bounds.min_lat + lidarResult.bounds.max_lat) / 2.0;
                  const midLon = (lidarResult.bounds.min_lon + lidarResult.bounds.max_lon) / 2.0;
                  if (onReconstruct) {
                    onReconstruct({
                      bounds: lidarResult.bounds,
                      latitude: midLat,
                      longitude: midLon,
                      provider: 'lidar',
                      data_mode: 'real',
                    });
                  }
                }}
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 hover:scale-[1.01] transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isLoading ? 'Reconstructing 3D Terrain...' : 'GENERATE 3D TERRAIN FROM LIDAR DTM'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main 3D Terrain Centerpiece */}
      {terrainData && (
        <div className="space-y-6 pt-4">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-xl font-bold text-white tracking-tight">
                3D Reconstructed Terrain &mdash; {terrainData.region_name || 'Selected Region'}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleOpenAccuracyReport}
                className="px-3.5 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Accuracy & Lineage Report</span>
              </button>

              <button
                onClick={onNavigateToStudio}
                className="px-3.5 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Eye className="w-4 h-4" />
                <span>Fullscreen Studio</span>
              </button>
            </div>
          </div>

          {/* Fallback Notice Banner if LiDAR was unavailable */}
          {terrainData.fallback_notice && (
            <div className="p-3 bg-slate-950/90 rounded-xl border border-cyan-500/30 text-xs text-slate-300 flex items-center justify-between font-mono">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>{terrainData.fallback_notice}</span>
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                1:1 Metric Scale
              </span>
            </div>
          )}

          {/* Interactive Layout: Viewport + Controls + Elevation Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: 3D Viewport & Controls */}
            <div className="lg:col-span-8 space-y-6">
              <div className="h-[580px] rounded-2xl overflow-hidden border border-slate-800 bg-[#070b14] shadow-2xl">
                <TerrainCanvas
                  terrainData={terrainData}
                  exaggeration={exaggeration}
                  visualMode={visualMode}
                  colormap={colormap}
                  showWireframe={showWireframe}
                  showSatelliteTexture={showSatelliteTexture}
                  showContours={showContours}
                  showGrid={showGrid}
                  activeTool={activeTool}
                  onToolChange={setActiveTool}
                  selectedPoint={selectedPoint}
                  onSelectPoint={handleSelectPointWithLandslide}
                  pointAPos={pointAPos}
                  pointAData={pointAData}
                  pointBPos={pointBPos}
                  pointBData={pointBData}
                  measurement={measurement}
                  onSetMeasurementPoints={handleSetMeasurement}
                  pointValidation={pointValidation}
                  onSetPointValidation={setPointValidation}
                  onOpenAccuracyModal={handleOpenAccuracyReport}
                  onOpenProfileModal={() => setIsProfileModalOpen(true)}
                  landslideData={landslideData}
                  onHotspotClick={handleHotspotClick}
                  showHistoricalLandslides={showHistoricalLandslides}
                />
              </div>

              {/* Topographic Statistics & GIS Data Quality */}
              <AnalysisPanel
                stats={terrainData.stats}
                bounds={terrainData.bounds}
                metricBounds={terrainData.metric_bounds}
                gisMetadata={terrainData.gis_metadata}
                providerUsed={terrainData.provider_used}
                gridResolution={terrainData.grid_resolution}
              />
            </div>

            {/* Right Column: Controls & Point Inspection Panels */}
            <div className="lg:col-span-4 space-y-6">
              
              <TerrainControls
                exaggeration={exaggeration}
                onExaggerationChange={setExaggeration}
                visualMode={visualMode}
                onVisualModeChange={setVisualMode}
                colormap={colormap}
                onColormapChange={setColormap}
                showWireframe={showWireframe}
                onToggleWireframe={() => setShowWireframe(!showWireframe)}
                showSatelliteTexture={showSatelliteTexture}
                onToggleSatelliteTexture={() => setShowSatelliteTexture(!showSatelliteTexture)}
                showContours={showContours}
                onToggleContours={() => setShowContours(!showContours)}
                contourInterval={contourInterval}
                onContourIntervalChange={setContourInterval}
                showGrid={showGrid}
                onToggleGrid={() => setShowGrid(!showGrid)}
                sunAzimuth={sunAzimuth}
                onSunAzimuthChange={setSunAzimuth}
                sunAltitude={sunAltitude}
                onSunAltitudeChange={setSunAltitude}
                hillshadeIntensity={hillshadeIntensity}
                onHillshadeIntensityChange={setHillshadeIntensity}
                landslideData={landslideData}
                onRunLandslideAnalysis={handleRunLandslideAnalysis}
                landslideScenario={landslideScenario}
                onScenarioChange={setLandslideScenario}
                landslideLoading={landslideLoading}
              />

              {/* Point Elevation Inspection & Landslide Factor Screening */}
              <ElevationPanel
                activeTool={activeTool}
                selectedPoint={selectedPoint}
                pointAData={pointAData}
                pointBData={pointBData}
                measurement={measurement}
                onClearMeasurement={() => {
                  handleSetMeasurement(null, null, null, null, null);
                  setPointValidation(null);
                  setLandslideInspection(null);
                }}
                pointValidation={pointValidation}
                landslideInspection={landslideInspection}
                visualMode={visualMode}
              />
            </div>

          </div>

        </div>
      )}

      {/* Accuracy & Lineage Modal */}
      <AccuracyModal
        isOpen={isAccuracyModalOpen}
        onClose={() => setIsAccuracyModalOpen(false)}
        report={validationReport}
        gisMetadata={terrainData?.gis_metadata}
        isLoading={isValidating}
      />

      {/* Terrain Cross-Section Elevation Profile Modal */}
      <TerrainProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        measurement={measurement}
      />
    </div>
  );
};
