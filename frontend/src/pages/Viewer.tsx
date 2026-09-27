import React, { useState } from 'react';
import { 
  Mountain, 
  Compass, 
  Sparkles, 
  ShieldCheck,
  Eye,
  Maximize2
} from 'lucide-react';
import { 
  TerrainReconstructResponse, 
  VisualMode, 
  ColormapMode, 
  InteractionTool, 
  PointInspection, 
  TwoPointMeasurementResponse,
  SampleRegion,
  PointValidation,
  ValidationReport,
  LandslideAnalysisResponse,
  LandslideInspection,
  LandslideHotspot
} from '../types';
import { TerrainCanvas } from '../components/TerrainViewer/TerrainCanvas';
import { TerrainControls } from '../components/TerrainControls/TerrainControls';
import { ElevationPanel } from '../components/ElevationPanel/ElevationPanel';
import { TerrainProfileModal } from '../components/TerrainViewer/TerrainProfileModal';
import { AccuracyModal } from '../components/ValidationPanel/AccuracyModal';
import { api } from '../services/api';
import * as THREE from 'three';

interface ViewerProps {
  terrainData: TerrainReconstructResponse | null;
  samples: SampleRegion[];
  onSelectSample: (sampleId: string) => void;
  onNavigateToReconstruct: () => void;
}

export const Viewer: React.FC<ViewerProps> = ({
  terrainData,
  samples,
  onSelectSample,
  onNavigateToReconstruct,
}) => {
  const [exaggeration, setExaggeration] = useState<number>(1.0);
  const [visualMode, setVisualMode] = useState<VisualMode>('elevation');
  const [colormap, setColormap] = useState<ColormapMode>('hypsometric');
  const [showWireframe, setShowWireframe] = useState<boolean>(false);
  const [showSatelliteTexture, setShowSatelliteTexture] = useState<boolean>(true);
  const [showContours, setShowContours] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<InteractionTool>('inspect');
  const [sunAzimuth, setSunAzimuth] = useState<number>(315);
  const [sunAltitude, setSunAltitude] = useState<number>(45);

  // Landslide Susceptibility State
  const [landslideData, setLandslideData] = useState<LandslideAnalysisResponse | null>(null);
  const [landslideLoading, setLandslideLoading] = useState<boolean>(false);
  const [landslideScenario, setLandslideScenario] = useState<'normal' | 'heavy' | 'extreme'>('normal');
  const [landslideModelType, setLandslideModelType] = useState<string>('random_forest');
  const [showHistoricalLandslides, setShowHistoricalLandslides] = useState<boolean>(true);
  const [landslideInspection, setLandslideInspection] = useState<LandslideInspection | null>(null);

  // Point Inspection & Measurement
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

  const handleRunLandslideAnalysis = async (
    scenario: 'normal' | 'heavy' | 'extreme' = landslideScenario,
    modelType: string = landslideModelType
  ) => {
    if (!terrainData) return;
    setLandslideLoading(true);
    try {
      const resp = await api.runLandslideAnalysis({
        bounds: terrainData.bounds,
        terrain_id: terrainData.terrain_id,
        grid_resolution: terrainData.grid_resolution,
        provider: terrainData.provider_used,
        model_type: modelType,
        include_historical_inventory: true,
        parameters: { scenario }
      });
      setLandslideData(resp);
    } catch (err) {
      console.error('Failed to run landslide analysis:', err);
    } finally {
      setLandslideLoading(false);
    }
  };

  React.useEffect(() => {
    if (terrainData) {
      handleRunLandslideAnalysis(landslideScenario, landslideModelType);
    }
  }, [terrainData]);

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
        });
        setValidationReport(report);
      } catch (e) {
        console.error(e);
      } finally {
        setIsValidating(false);
      }
    }
  };

  if (!terrainData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto shadow-xl shadow-cyan-500/10">
          <Mountain className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-extrabold text-white">3D Studio Ready</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Select a region below to generate and explore its 3D terrain model:
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          {samples.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSample(s.id)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
            >
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>{s.name}</span>
              <span className="text-[10px] text-cyan-300 font-mono">({s.peak_elevation}m)</span>
            </button>
          ))}
        </div>

        <div className="pt-4">
          <button
            onClick={onNavigateToReconstruct}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-cyan-500/25 transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Select Custom Location on Map</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400">3D MODEL &mdash; SELECTED REGION ONLY (1:1 TRUE SCALE)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
            {terrainData.region_name || '3D Reconstructed Surface'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <button
            onClick={handleOpenAccuracyReport}
            className="px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Accuracy Report</span>
          </button>
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
            Min: <strong className="text-white">{terrainData.stats.min_elevation}m</strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300">
            Max: <strong className="text-cyan-300">{terrainData.stats.max_elevation}m</strong>
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main 3D Model Centerpiece of ONLY the Selected Place (8 columns) */}
        <div className="lg:col-span-8 h-[660px] rounded-2xl overflow-hidden border border-slate-800 bg-[#070b14] shadow-2xl">
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

        {/* Right Sidebar Controls & Elevation HUD (4 columns) */}
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
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid(!showGrid)}
            sunAzimuth={sunAzimuth}
            onSunAzimuthChange={setSunAzimuth}
            sunAltitude={sunAltitude}
            onSunAltitudeChange={setSunAltitude}
            landslideData={landslideData}
            onRunLandslideAnalysis={handleRunLandslideAnalysis}
            landslideScenario={landslideScenario}
            onScenarioChange={setLandslideScenario}
            landslideLoading={landslideLoading}
            landslideModelType={landslideModelType}
            onModelTypeChange={setLandslideModelType}
            showHistoricalLandslides={showHistoricalLandslides}
            onToggleHistoricalLandslides={() => setShowHistoricalLandslides(!showHistoricalLandslides)}
          />

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

      {/* Accuracy Modal */}
      <AccuracyModal
        isOpen={isAccuracyModalOpen}
        onClose={() => setIsAccuracyModalOpen(false)}
        report={validationReport}
        gisMetadata={terrainData?.gis_metadata}
        isLoading={isValidating}
      />

      {/* Profile Modal */}
      <TerrainProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        measurement={measurement}
      />
    </div>
  );
};
