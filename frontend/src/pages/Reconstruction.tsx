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
  Building2,
  Route,
  Droplets
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
  EnvironmentLayersResponse,
  LayerVisibility,
  BuildingFeature,
  RoadFeature,
  WaterFeature
} from '../types';
import { MapPicker } from '../components/Map/MapPicker';
import { ImageUploader } from '../components/ImageUploader/ImageUploader';
import { TerrainCanvas } from '../components/TerrainViewer/TerrainCanvas';
import { TerrainControls } from '../components/TerrainControls/TerrainControls';
import { AnalysisPanel } from '../components/AnalysisPanel/AnalysisPanel';
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

  // Environment layers state
  const [environmentData, setEnvironmentData] = useState<EnvironmentLayersResponse | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibility>({
    buildings: true,
    roads: true,
    water: true,
    landmarks: false,
  });
  const [colorBySource, setColorBySource] = useState<boolean>(true);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingFeature | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<RoadFeature | null>(null);
  const [selectedWater, setSelectedWater] = useState<WaterFeature | null>(null);
  const [showEnvironmentBreakdown, setShowEnvironmentBreakdown] = useState<boolean>(false);

  const handleApplyCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    setShowEnvironmentBreakdown(false);
    setEnvironmentData(null);
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    const rad = parseFloat(customRadius) || 2500;
    if (isNaN(lat) || isNaN(lon)) return;

    const latDelta = rad / 111320.0;
    const lonDelta = rad / (111320.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

    onLocationChange(lat, lon, rad, {
      min_lat: Number((lat - latDelta).toFixed(6)),
      max_lat: Number((lat + latDelta).toFixed(6)),
      min_lon: Number((lon - lonDelta).toFixed(6)),
      max_lon: Number((lon + lonDelta).toFixed(6)),
      center_lat: lat,
      center_lon: lon,
      radius_meters: rad,
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
      onLocationChange(
        (res.bounds.min_lat + res.bounds.max_lat) / 2.0,
        (res.bounds.min_lon + res.bounds.max_lon) / 2.0,
        2500,
        res.bounds
      );
    } catch (err: any) {
      alert(err.message || 'LiDAR upload failed');
    } finally {
      setLidarLoading(false);
    }
  };

  // ─── Environment Layer Fetch ─────────────────────────
  const handleFetchEnvironment = async (customBounds?: LatLonBounds) => {
    const targetBounds = customBounds || terrainData?.bounds;
    if (!targetBounds || dataMode === 'demo') return;
    setEnvLoading(true);
    setEnvError(null);
    try {
      const layers: string[] = ['buildings', 'roads', 'water', 'landmarks'];

      const res = await api.fetchEnvironmentLayers({
        bounds: targetBounds,
        layers,
        data_mode: dataMode,
        grid_resolution: terrainData?.grid_resolution || 128,
        provider: terrainData?.provider_used || 'auto',
      });

      if ((res as any).status === 'error') {
        setEnvError((res as any).message || 'OpenStreetMap vector query failed.');
        setEnvironmentData(null);
      } else {
        setEnvironmentData(res);
        setEnvError(null);
      }
    } catch (err: any) {
      console.error('Environment layers error:', err);
      setEnvError(err.message || 'Failed to connect to OpenStreetMap vector service.');
    } finally {
      setEnvLoading(false);
    }
  };

  const handleToggleLayer = (layer: keyof LayerVisibility) => {
    setLayerVisibility(prev => ({ ...prev, [layer]: !prev[layer] }));
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
              setShowEnvironmentBreakdown(false);
              setEnvironmentData(null);
              onSelectSample(sampleId);
            }}
            inspectedLat={selectedPoint?.latitude}
            inspectedLon={selectedPoint?.longitude}
            onGenerate3DWorld={() => {
              setShowEnvironmentBreakdown(false);
              setEnvironmentData(null);
              onReconstruct({ contour_interval_m: contourInterval, hillshade_intensity: hillshadeIntensity, data_mode: dataMode });
            }}
            isLoading={isLoading}
          />
        </div>
      )}

      {inputTab === 'coords' && (
        <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 shadow-2xl space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-cyan-400" />
            Enter Exact Latitude & Longitude Coordinates
          </h3>

          <form onSubmit={handleApplyCoordinates} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-colors"
              >
                Update Selected Location
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
          onApplyImageCoordinates={(lat, lon) => {
            onLocationChange(lat, lon, radiusMeters, bounds);
            setInputTab('map');
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
            <div className="p-4 bg-slate-950 rounded-xl border border-emerald-500/40 space-y-2 text-xs font-mono">
              <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                LiDAR Point Cloud Processed: {lidarResult.file_name} ({lidarResult.point_count.toLocaleString()} points)
              </div>
              <div className="grid grid-cols-3 gap-2 text-slate-300">
                <div>Min Elev: <strong>{lidarResult.elevation_stats.min_z}m</strong></div>
                <div>Max Elev: <strong>{lidarResult.elevation_stats.max_z}m</strong></div>
                <div>Relief: <strong>{lidarResult.elevation_stats.range_z}m</strong></div>
              </div>
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

            <div className="flex items-center gap-2">
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
              <div className="h-[580px]">
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
                  onSelectPoint={setSelectedPoint}
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
                  environmentData={showEnvironmentBreakdown ? environmentData : null}
                  layerVisibility={layerVisibility}
                  colorBySource={colorBySource}
                  onBuildingClick={(b: BuildingFeature) => { setSelectedBuilding(b); setSelectedRoad(null); setSelectedWater(null); }}
                  onRoadClick={(r: RoadFeature) => { setSelectedRoad(r); setSelectedBuilding(null); setSelectedWater(null); }}
                  onWaterClick={(w: WaterFeature) => { setSelectedWater(w); setSelectedBuilding(null); setSelectedRoad(null); }}
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
                layerVisibility={layerVisibility}
                onToggleLayer={handleToggleLayer}
                colorBySource={colorBySource}
                onToggleColorBySource={() => setColorBySource(!colorBySource)}
                environmentLoading={envLoading}
                environmentAvailable={showEnvironmentBreakdown && !!environmentData}
              />

              {/* 🏢 On-Demand Environmental Breakdown Control Card */}
              <div className="bg-[#0d121f] rounded-2xl border border-slate-800/80 p-4 shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-amber-400" />
                    <span className="font-bold text-sm text-white">Environmental Breakdown</span>
                  </div>
                  {showEnvironmentBreakdown && environmentData && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                      Rendered in 3D
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Extract real OpenStreetMap & LiDAR buildings, classified road networks, and water bodies sitting on this 3D model.
                </p>

                {!showEnvironmentBreakdown ? (
                  <button
                    onClick={async () => {
                      setShowEnvironmentBreakdown(true);
                      if (!environmentData && !envLoading) {
                        await handleFetchEnvironment();
                      }
                    }}
                    disabled={envLoading}
                    className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-xl shadow-amber-500/20 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{envLoading ? 'Querying GIS Vector Data...' : 'Show Environmental Breakdown in 3D'}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowEnvironmentBreakdown(false)}
                    className="w-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Hide Environmental Breakdown</span>
                  </button>
                )}
              </div>

              {/* Loading Indicator */}
              {envLoading && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-200 flex items-center gap-2 font-mono animate-pulse">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Querying real OpenStreetMap vector data (buildings, roads, water)...</span>
                </div>
              )}

              {/* Explicit Provider Error Display (Requirement #11) */}
              {envError && (
                <div className="p-3.5 bg-rose-950/50 border border-rose-500/60 rounded-xl text-xs text-rose-200 space-y-2 font-mono">
                  <div className="flex items-center gap-2 font-bold text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>DATA PROVIDER ERROR</span>
                  </div>
                  <p className="text-[11px] text-rose-200/90 leading-relaxed">{envError}</p>
                  <button
                    onClick={() => handleFetchEnvironment()}
                    className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800/70 border border-rose-600/60 rounded text-[10px] text-white font-semibold transition-colors"
                  >
                    Retry Query
                  </button>
                </div>
              )}

              {/* Environment Coverage & Feature Summary Card (Shown ONLY when Environmental Breakdown is active) */}
              {showEnvironmentBreakdown && environmentData && (
                <div className="bg-[#0d121f] rounded-2xl border border-slate-800/80 p-4 shadow-2xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wide">Environment Coverage</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 font-mono">
                      {environmentData.source || 'OpenStreetMap'}
                    </span>
                  </div>
                  
                  {/* Coverage Stats (Detected vs Reconstructed) */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-amber-400" />
                        Buildings
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        {environmentData.coverage_summary?.buildings ? (
                          <span className="font-bold text-emerald-400">
                            {environmentData.coverage_summary.buildings.reconstructed.toLocaleString()} / {environmentData.coverage_summary.buildings.detected.toLocaleString()}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-400">
                            {environmentData.counts?.buildings ?? environmentData.buildings?.length ?? 0}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          100%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Route className="w-3.5 h-3.5 text-slate-400" />
                        Roads
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        {environmentData.coverage_summary?.roads ? (
                          <span className="font-bold text-emerald-400">
                            {environmentData.coverage_summary.roads.reconstructed.toLocaleString()} / {environmentData.coverage_summary.roads.detected.toLocaleString()}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-400">
                            {environmentData.counts?.roads ?? environmentData.roads?.length ?? 0}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          100%
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Droplets className="w-3.5 h-3.5 text-blue-400" />
                        Water Bodies
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        {environmentData.coverage_summary?.water ? (
                          <span className="font-bold text-emerald-400">
                            {environmentData.coverage_summary.water.reconstructed.toLocaleString()} / {environmentData.coverage_summary.water.detected.toLocaleString()}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-400">
                            {environmentData.counts?.water ?? environmentData.water?.length ?? 0}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          100%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Building Height Sources Breakdown */}
                  {environmentData.building_height_summary && (
                    <div className="pt-2 border-t border-slate-800/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          Building Height Sources
                        </span>
                        {environmentData.building_height_summary.lidar_available ? (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                            {environmentData.building_height_summary.lidar_coverage_pct}% LiDAR
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300">
                            Fallback Active
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                        <div className="p-1.5 bg-slate-950/60 rounded border border-cyan-500/20 flex items-center justify-between">
                          <span className="text-cyan-400">LiDAR:</span>
                          <span className="text-white font-bold">{environmentData.building_height_summary.lidar_count.toLocaleString()}</span>
                        </div>
                        <div className="p-1.5 bg-slate-950/60 rounded border border-amber-500/20 flex items-center justify-between">
                          <span className="text-amber-400">OSM Mapped:</span>
                          <span className="text-white font-bold">{environmentData.building_height_summary.osm_height_count.toLocaleString()}</span>
                        </div>
                        <div className="p-1.5 bg-slate-950/60 rounded border border-slate-700/40 flex items-center justify-between">
                          <span className="text-slate-400">OSM Levels:</span>
                          <span className="text-white font-bold">{environmentData.building_height_summary.osm_levels_count.toLocaleString()}</span>
                        </div>
                        <div className="p-1.5 bg-slate-950/60 rounded border border-slate-700/40 flex items-center justify-between">
                          <span className="text-slate-400">Estimated:</span>
                          <span className="text-white font-bold">{environmentData.building_height_summary.estimated_count.toLocaleString()}</span>
                        </div>
                      </div>

                      {environmentData.building_height_summary.mean_lidar_height && (
                        <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between px-1">
                          <span>Mean LiDAR Height: <strong className="text-cyan-300">{environmentData.building_height_summary.mean_lidar_height}m</strong></span>
                          <span>Range: <strong className="text-cyan-300">{environmentData.building_height_summary.min_lidar_height}m – {environmentData.building_height_summary.max_lidar_height}m</strong></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Data Quality & Lineage */}
                  <div className="pt-2 border-t border-slate-800/60 grid grid-cols-3 gap-1.5 text-[9px] font-mono">
                    <div className="p-1 bg-slate-950/50 rounded border border-slate-800 text-center">
                      <span className="text-slate-500 block">FOOTPRINT</span>
                      <span className="text-white font-semibold">Mapped</span>
                    </div>
                    <div className="p-1 bg-slate-950/50 rounded border border-slate-800 text-center">
                      <span className="text-slate-500 block">HEIGHT</span>
                      <span className="text-cyan-300 font-semibold">LiDAR (95th-p)</span>
                    </div>
                    <div className="p-1 bg-slate-950/50 rounded border border-slate-800 text-center">
                      <span className="text-slate-500 block">TERRAIN</span>
                      <span className="text-emerald-300 font-semibold">Bare-Earth DTM</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>Attribution: © OpenStreetMap & LiDAR</span>
                    <button
                      onClick={() => handleFetchEnvironment()}
                      className="text-cyan-400 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}

              {/* Selected Building Inspection Card */}
              {selectedBuilding && (
                <div className="bg-[#0d121f] rounded-2xl border border-cyan-500/40 p-4 shadow-2xl space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                    <span className="text-xs font-bold text-cyan-400 uppercase tracking-wide flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      Building Inspection
                    </span>
                    <button onClick={() => setSelectedBuilding(null)} className="text-xs text-slate-500 hover:text-white">✕</button>
                  </div>

                  {selectedBuilding.name && <div className="text-sm font-bold text-white tracking-tight">{selectedBuilding.name}</div>}

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="text-slate-500">ID</span><br /><span className="text-white font-mono text-[10px] truncate block">{selectedBuilding.id}</span></div>
                    <div><span className="text-slate-500">Type</span><br /><span className="text-white font-mono">{selectedBuilding.building_type}</span></div>
                    <div><span className="text-slate-500">Footprint Source</span><br /><span className="text-cyan-300 font-mono text-[10px]">{selectedBuilding.footprint_source || selectedBuilding.source}</span></div>
                    <div><span className="text-slate-500">Roof Shape</span><br /><span className="text-amber-300 font-mono capitalize">{selectedBuilding.roof_type || 'flat'}</span></div>
                    <div><span className="text-slate-500">Latitude</span><br /><span className="text-white font-mono">{selectedBuilding.latitude.toFixed(6)}°</span></div>
                    <div><span className="text-slate-500">Longitude</span><br /><span className="text-white font-mono">{selectedBuilding.longitude.toFixed(6)}°</span></div>
                    <div><span className="text-slate-500">Ground Elevation</span><br /><span className="text-white font-mono font-bold">{selectedBuilding.ground_elevation}m</span></div>
                    <div><span className="text-slate-500">Building Height</span><br /><span className="text-cyan-300 font-mono font-bold text-xs">{selectedBuilding.height}m</span></div>
                    <div><span className="text-slate-500">Top Elevation</span><br /><span className="text-white font-mono">{selectedBuilding.top_elevation}m</span></div>
                    <div><span className="text-slate-500">Footprint Area</span><br /><span className="text-white font-mono">{selectedBuilding.footprint_area_sq_m.toFixed(0)} m²</span></div>
                    
                    <div>
                      <span className="text-slate-500">Height Source</span><br />
                      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded inline-block ${
                        selectedBuilding.height_source === 'LIDAR' ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' :
                        selectedBuilding.height_source === 'OSM_HEIGHT' || selectedBuilding.height_source === 'MAPPED' ? 'bg-amber-950 text-amber-300 border border-amber-500/40' :
                        selectedBuilding.height_source === 'OSM_LEVELS' ? 'bg-slate-900 text-slate-300 border border-slate-700' :
                        'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}>
                        {selectedBuilding.height_source === 'LIDAR' ? 'LiDAR-derived' : selectedBuilding.height_source}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500">Geometry Quality</span><br />
                      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded inline-block ${
                        selectedBuilding.geometry_quality === 'HIGH' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' :
                        selectedBuilding.geometry_quality === 'MEDIUM' ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/40' :
                        'bg-slate-900 text-slate-400 border border-slate-700'
                      }`}>
                        {selectedBuilding.geometry_quality || selectedBuilding.height_quality || 'MEDIUM'}
                      </span>
                    </div>
                  </div>

                  {/* LiDAR Detailed Points Info if available */}
                  {selectedBuilding.height_source === 'LIDAR' && (
                    <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-1.5 text-[10px] font-mono text-slate-300 bg-slate-950/60 p-2 rounded-xl">
                      <div>LiDAR Points: <strong className="text-cyan-300">{selectedBuilding.lidar_points_count ?? 0} pts</strong></div>
                      {selectedBuilding.lidar_roof_elevation && <div>Roof Elev (p95): <strong className="text-cyan-300">{selectedBuilding.lidar_roof_elevation}m</strong></div>}
                      {selectedBuilding.lidar_ground_elevation && <div>Ground Elev: <strong className="text-cyan-300">{selectedBuilding.lidar_ground_elevation}m</strong></div>}
                      {selectedBuilding.osm_height_diff !== null && selectedBuilding.osm_height_diff !== undefined && (
                        <div>OSM vs LiDAR: <strong className={selectedBuilding.osm_height_diff >= 0 ? 'text-emerald-400' : 'text-amber-400'}>{selectedBuilding.osm_height_diff > 0 ? `+${selectedBuilding.osm_height_diff}` : selectedBuilding.osm_height_diff}m</strong></div>
                      )}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-500 font-mono">Source: {selectedBuilding.source}</div>
                </div>
              )}

              {selectedRoad && (
                <div className="bg-[#0d121f] rounded-2xl border border-slate-500/30 p-4 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Road Inspection</span>
                    <button onClick={() => setSelectedRoad(null)} className="text-xs text-slate-500 hover:text-white">✕</button>
                  </div>
                  {selectedRoad.name && <div className="text-sm font-bold text-white">{selectedRoad.name}</div>}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><span className="text-slate-500">Type</span><br /><span className="text-white font-mono">{selectedRoad.road_type}</span></div>
                    <div><span className="text-slate-500">Width</span><br /><span className="text-white font-mono">{selectedRoad.width}m</span></div>
                    <div><span className="text-slate-500">Surface</span><br /><span className="text-white font-mono">{selectedRoad.surface || 'Unknown'}</span></div>
                    <div><span className="text-slate-500">Segments</span><br /><span className="text-white font-mono">{selectedRoad.coords.length} pts</span></div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Source: {selectedRoad.source}</div>
                </div>
              )}
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
