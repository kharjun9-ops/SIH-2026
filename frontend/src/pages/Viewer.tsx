import React, { useState } from 'react';
import { 
  Eye, 
  Mountain, 
  Layers, 
  Sliders, 
  Crosshair, 
  Ruler, 
  Download, 
  Compass,
  Sparkles,
  Maximize2,
  ShieldCheck,
  Activity
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
  ValidationReport
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
            No terrain reconstructed yet. Select an authoritative DEM sample region or run the reconstruction pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          {samples.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSample(s.id)}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all"
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
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-cyan-500/25 transition-all inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Go to Reconstruction Pipeline</span>
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
            <span className="text-xs font-mono text-emerald-400">IMMERSIVE 3D STUDIO &mdash; 1:1 METRIC SPACE</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
            {terrainData.region_name || 'Authoritative DEM 3D Viewport'}
          </h1>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <button
            onClick={handleOpenAccuracyReport}
            className="px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 transition-colors"
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
        
        {/* Main 3D Canvas Centerpiece (8 columns) */}
        <div className="lg:col-span-8 h-[660px]">
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
            }}
            pointValidation={pointValidation}
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
