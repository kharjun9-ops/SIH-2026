import React, { useState } from 'react';
import { 
  Sliders, 
  Layers, 
  Palette, 
  Grid as GridIcon, 
  RotateCcw, 
  Eye, 
  Sparkles, 
  Sun,
  Maximize2,
  Box,
  Image as ImageIcon,
  Mountain,
  Activity,
  Compass,
  Building2,
  Route,
  Droplets,
  AlertTriangle,
  Flame,
  ShieldAlert,
  Info,
  Settings2,
  RefreshCw
} from 'lucide-react';
import { VisualMode, ColormapMode, LayerVisibility, LandslideAnalysisResponse } from '../../types';

interface TerrainControlsProps {
  exaggeration: number;
  onExaggerationChange: (val: number) => void;
  visualMode: VisualMode;
  onVisualModeChange: (mode: VisualMode) => void;
  colormap: ColormapMode;
  onColormapChange: (colormap: ColormapMode) => void;
  showWireframe: boolean;
  onToggleWireframe: () => void;
  showSatelliteTexture: boolean;
  onToggleSatelliteTexture: () => void;
  showContours: boolean;
  onToggleContours: () => void;
  contourInterval?: number;
  onContourIntervalChange?: (interval: number) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  sunAzimuth?: number;
  onSunAzimuthChange?: (val: number) => void;
  sunAltitude?: number;
  onSunAltitudeChange?: (val: number) => void;
  hillshadeIntensity?: number;
  onHillshadeIntensityChange?: (val: number) => void;
  layerVisibility?: LayerVisibility;
  onToggleLayer?: (layer: keyof LayerVisibility) => void;
  colorBySource?: boolean;
  onToggleColorBySource?: () => void;
  environmentLoading?: boolean;
  environmentAvailable?: boolean;
  landslideData?: LandslideAnalysisResponse | null;
  onRunLandslideAnalysis?: (scenario?: 'normal' | 'heavy' | 'extreme', modelType?: string) => void;
  landslideScenario?: 'normal' | 'heavy' | 'extreme';
  onScenarioChange?: (scenario: 'normal' | 'heavy' | 'extreme') => void;
  landslideLoading?: boolean;
  landslideModelType?: string;
  onModelTypeChange?: (modelType: string) => void;
  showHistoricalLandslides?: boolean;
  onToggleHistoricalLandslides?: () => void;
}

export const TerrainControls: React.FC<TerrainControlsProps> = ({
  exaggeration = 1.0,
  onExaggerationChange,
  visualMode = 'elevation',
  onVisualModeChange,
  colormap,
  onColormapChange,
  showWireframe,
  onToggleWireframe,
  showSatelliteTexture,
  onToggleSatelliteTexture,
  showContours,
  onToggleContours,
  contourInterval = 20,
  onContourIntervalChange,
  showGrid,
  onToggleGrid,
  sunAzimuth = 315,
  onSunAzimuthChange,
  sunAltitude = 45,
  onSunAltitudeChange,
  hillshadeIntensity = 1.0,
  onHillshadeIntensityChange,
  layerVisibility,
  onToggleLayer,
  colorBySource = true,
  onToggleColorBySource,
  environmentLoading = false,
  environmentAvailable = false,
  landslideData,
  onRunLandslideAnalysis,
  landslideScenario = 'normal',
  onScenarioChange,
  landslideLoading = false,
  landslideModelType = 'random_forest',
  onModelTypeChange,
  showHistoricalLandslides = true,
  onToggleHistoricalLandslides,
}) => {
  const [showWeightsDetail, setShowWeightsDetail] = useState(false);

  return (
    <div className="bg-[#0d121f] rounded-2xl border border-slate-800/80 p-5 shadow-2xl space-y-5">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-base text-white tracking-tight">
            3D Geospatial Controls
          </h3>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 font-mono">
          1:1 Metric Space
        </span>
      </div>

      {/* 1. Terrain Material & Analysis Modes Selector */}
      <div className="space-y-2">
        <label className="text-xs text-slate-300 font-medium flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            Terrain Analysis & Material Modes:
          </span>
          <span className="text-[10px] font-mono text-cyan-400 font-semibold uppercase">
            {visualMode}
          </span>
        </label>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 text-[11px] font-semibold">
          
          <button
            onClick={() => onVisualModeChange('elevation')}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate ${
              visualMode === 'elevation'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Elevation
          </button>

          <button
            onClick={() => onVisualModeChange('hillshade')}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate ${
              visualMode === 'hillshade'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Hillshade
          </button>

          <button
            onClick={() => onVisualModeChange('satellite')}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate ${
              visualMode === 'satellite'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Satellite
          </button>

          <button
            onClick={() => onVisualModeChange('hybrid')}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate ${
              visualMode === 'hybrid'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Hybrid
          </button>

          <button
            onClick={() => onVisualModeChange('slope')}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate ${
              visualMode === 'slope'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Slope Map
          </button>

          <button
            onClick={() => {
              onVisualModeChange('landslide');
              if (onRunLandslideAnalysis && !landslideData) {
                onRunLandslideAnalysis(landslideScenario);
              }
            }}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate flex items-center justify-center gap-1 ${
              visualMode === 'landslide'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30'
                : 'text-amber-400 hover:text-amber-200 border border-amber-500/30 bg-amber-950/20'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>Landslide</span>
          </button>

          <button
            onClick={() => onVisualModeChange('wireframe')}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate ${
              visualMode === 'wireframe'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Wireframe
          </button>

          <button
            onClick={() => onVisualModeChange('pointcloud')}
            className={`py-1.5 px-2 rounded-lg transition-all text-center truncate ${
              visualMode === 'pointcloud'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Point Cloud
          </button>

        </div>
      </div>

      {/* ─── Landslide Susceptibility & Machine Learning Framework ─── */}
      {(visualMode === 'landslide' || landslideData) && (
        <div className="p-3.5 bg-gradient-to-br from-[#121829] to-[#0d121f] rounded-2xl border border-amber-500/40 space-y-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>LANDSLIDE SUSCEPTIBILITY</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold ${
                landslideModelType && landslideModelType !== 'baseline'
                  ? 'bg-cyan-950 border border-cyan-500/40 text-cyan-300'
                  : 'bg-amber-950/80 border border-amber-500/40 text-amber-300'
              }`}>
                {landslideModelType && landslideModelType !== 'baseline' ? 'ML Framework' : 'Screening Model'}
              </span>
            </div>
          </div>

          {/* Model Architecture Selector (Baseline vs ML) */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-300 font-medium flex items-center justify-between">
              <span>Model Architecture:</span>
              <span className="text-[10px] text-cyan-400 font-mono">
                {landslideData?.ml_metrics ? `ROC-AUC: ${landslideData.ml_metrics.roc_auc.toFixed(2)}` : 'Heuristic'}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-mono font-bold">
              <button
                onClick={() => {
                  if (onModelTypeChange) onModelTypeChange('baseline');
                  if (onRunLandslideAnalysis) onRunLandslideAnalysis(landslideScenario, 'baseline');
                }}
                className={`py-1.5 rounded-lg transition-all text-center ${
                  !landslideModelType || landslideModelType === 'baseline'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Baseline MCE
              </button>
              <button
                onClick={() => {
                  if (onModelTypeChange) onModelTypeChange('random_forest');
                  if (onRunLandslideAnalysis) onRunLandslideAnalysis(landslideScenario, 'random_forest');
                }}
                className={`py-1.5 rounded-lg transition-all text-center ${
                  landslideModelType === 'random_forest'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ML Random Forest
              </button>
            </div>
          </div>

          {/* Real Historical Landslides Overlay Toggle */}
          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <span className="text-slate-300 flex items-center gap-1.5 text-[11px]">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Real Historical Landslides</span>
            </span>
            <button
              onClick={onToggleHistoricalLandslides}
              className={`w-9 h-4.5 rounded-full p-0.5 transition-colors ${
                showHistoricalLandslides ? 'bg-rose-500' : 'bg-slate-800'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${showHistoricalLandslides ? 'translate-x-4.5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Historical Capture Banner */}
          {showHistoricalLandslides && landslideData?.historical_capture && (
            <div className="p-2 rounded-xl bg-slate-950 border border-rose-500/30 text-[10px] font-mono space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <span>NASA/ISRO Capture Rate:</span>
                <strong className={landslideData.historical_capture.capture_rate_pct >= 75 ? 'text-emerald-400' : 'text-amber-400'}>
                  {landslideData.historical_capture.captured_count}/{landslideData.historical_capture.total_in_bounds} ({landslideData.historical_capture.capture_rate_pct}%)
                </strong>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight">
                {landslideData.historical_capture.evaluation_notice}
              </p>
            </div>
          )}

          {/* Scenario Mode Dropdown */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-300 font-medium flex items-center justify-between">
              <span>What-If Rainfall Scenario:</span>
              <span className="text-[10px] text-amber-400 font-mono font-semibold">
                {landslideScenario === 'normal' && 'Baseline 1.0×'}
                {landslideScenario === 'heavy' && 'Heavy (+25%)'}
                {landslideScenario === 'extreme' && 'Extreme (+50%)'}
              </span>
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-mono font-bold">
              {(['normal', 'heavy', 'extreme'] as const).map((sc) => (
                <button
                  key={sc}
                  onClick={() => {
                    if (onScenarioChange) onScenarioChange(sc);
                    if (onRunLandslideAnalysis) onRunLandslideAnalysis(sc, landslideModelType);
                  }}
                  className={`py-1.5 rounded-lg transition-all text-center capitalize ${
                    landslideScenario === sc
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>

          {/* Model Lineage / Feature Checklist */}
          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-[11px] font-mono">
            <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-900 text-[10px]">
              <span>FEATURE / DATA</span>
              <span>PROVENANCE</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Elevation / Slope</span>
              <strong className="text-emerald-400">REAL / DERIVED ✓</strong>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Curvatures & TPI/TRI</span>
              <strong className="text-emerald-400">DERIVED ✓</strong>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Drainage / Road Proximity</span>
              <strong className="text-emerald-400">DERIVED ✓</strong>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Land Cover (OSM)</span>
              <strong className="text-emerald-400">REAL ✓</strong>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Historical Inventory</span>
              <strong className="text-emerald-400">REAL (NASA/ISRO) ✓</strong>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>Geology & Soil Strata</span>
              <strong className="text-slate-500">UNAVAILABLE —</strong>
            </div>
          </div>

          {/* Calculate / Refresh Button */}
          {onRunLandslideAnalysis && (
            <button
              onClick={() => onRunLandslideAnalysis(landslideScenario, landslideModelType)}
              disabled={landslideLoading}
              className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${landslideLoading ? 'animate-spin' : ''}`} />
              <span>{landslideLoading ? 'Training & Evaluating...' : (landslideModelType !== 'baseline' ? 'Run ML Susceptibility Model' : 'Recalculate Baseline MCE')}</span>
            </button>
          )}

          <div className="text-[9px] text-slate-500 text-center italic">
            Screening & ML susceptibility result. Not a substitute for a geotechnical site investigation.
          </div>
        </div>
      )}

      {/* 2. Elevation Exaggeration (1.0x Default) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
            Vertical Exaggeration:
          </span>
          <span className="font-mono text-cyan-300 font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800/40">
            {exaggeration.toFixed(1)}× {exaggeration === 1.0 && '(True 1:1 Scale)'}
          </span>
        </div>
        
        <input
          type="range"
          min={0.5}
          max={5.0}
          step={0.1}
          value={exaggeration}
          onChange={(e) => onExaggerationChange(parseFloat(e.target.value))}
          className="w-full cursor-pointer accent-cyan-400"
        />

        <div className="flex justify-between text-[10px] font-mono text-slate-500 px-0.5">
          <span>0.5×</span>
          <span className="text-emerald-400 font-bold">1.0× (Physical 1:1)</span>
          <span>2.5×</span>
          <span>5.0×</span>
        </div>
      </div>

      {/* 3. Hillshade Sun Lighting Controls (when Hillshade or Hybrid active) */}
      {(visualMode === 'hillshade' || visualMode === 'hybrid') && (
        <div className="p-3 bg-slate-950 rounded-xl border border-cyan-500/30 space-y-3">
          <div className="flex items-center justify-between text-xs text-cyan-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              Hillshade Illumination Angle
            </span>
            <span className="text-[10px] font-mono text-slate-400">Az={sunAzimuth}°, Alt={sunAltitude}°</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Sun Azimuth (Compass Heading):</span>
              <span className="font-mono text-slate-200">{sunAzimuth}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={15}
              value={sunAzimuth}
              onChange={(e) => onSunAzimuthChange && onSunAzimuthChange(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-amber-400"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Sun Altitude (Elevation above Horizon):</span>
              <span className="font-mono text-slate-200">{sunAltitude}°</span>
            </div>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={sunAltitude}
              onChange={(e) => onSunAltitudeChange && onSunAltitudeChange(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-amber-400"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Hillshade Relief Intensity:</span>
              <span className="font-mono text-cyan-300 font-bold">{hillshadeIntensity.toFixed(1)}×</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={hillshadeIntensity}
              onChange={(e) => onHillshadeIntensityChange && onHillshadeIntensityChange(parseFloat(e.target.value))}
              className="w-full cursor-pointer accent-cyan-400"
            />
          </div>
        </div>
      )}

      {/* 4. Colormaps (when in Elevation mode) */}
      {visualMode === 'elevation' && (
        <div className="space-y-2">
          <label className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-cyan-400" />
            Hypsometric Shading Palette:
          </label>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: 'hypsometric', name: 'Topographic Earth', gradient: 'from-[#153e2e] via-[#8b6d47] to-[#f8fafc]' },
              { id: 'viridis', name: 'Viridis Scientific', gradient: 'from-[#440154] via-[#21918c] to-[#fde725]' },
              { id: 'magma', name: 'Magma / Relief', gradient: 'from-[#000004] via-[#b73779] to-[#fcfdbf]' },
              { id: 'thermal', name: 'Thermal / Infrared', gradient: 'from-[#001040] via-[#00ffff] to-[#ff2200]' },
              { id: 'emerald', name: 'Forest Highlands', gradient: 'from-[#064e3b] to-[#34d399]' },
              { id: 'satellite', name: 'Satellite Elevation', gradient: 'from-[#1e3a1e] via-[#8b7355] to-[#e0e4e8]' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => onColormapChange(item.id as ColormapMode)}
                className={`p-2 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                  colormap === item.id
                    ? 'border-cyan-400 bg-cyan-950/40 shadow-sm shadow-cyan-500/20'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className={`h-2 rounded-full w-full bg-gradient-to-r ${item.gradient}`} />
                <span className={`text-[11px] font-medium truncate ${colormap === item.id ? 'text-cyan-200' : 'text-slate-400'}`}>
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. Viewport Toggles (Contour lines, Wireframe, Grid) */}
      <div className="space-y-2.5 pt-2 border-t border-slate-800">
        <label className="text-xs text-slate-400 font-medium">Overlays & Vectors</label>
        
        {/* Real Contour Lines Toggle + Interval Selector */}
        <div className="space-y-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              Elevation Contours ({contourInterval}m)
            </span>
            <button
              onClick={onToggleContours}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                showContours ? 'bg-cyan-500' : 'bg-slate-800'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showContours ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {showContours && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-500 font-mono">Interval:</span>
              {[5, 10, 20, 50, 100].map((intVal) => (
                <button
                  key={intVal}
                  onClick={() => onContourIntervalChange && onContourIntervalChange(intVal)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    contourInterval === intVal
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {intVal}m
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Wireframe Mesh Toggle */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            Wireframe Overlay
          </span>
          <button
            onClick={onToggleWireframe}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
              showWireframe ? 'bg-cyan-500' : 'bg-slate-800'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showWireframe ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Spatial Metric Grid */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-300 flex items-center gap-1.5">
            <GridIcon className="w-3.5 h-3.5 text-cyan-400" />
            Spatial Metric Grid
          </span>
          <button
            onClick={onToggleGrid}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
              showGrid ? 'bg-cyan-500' : 'bg-slate-800'
            }`}
          >
            <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showGrid ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* ─── Environment Layers ─── */}
      {layerVisibility && onToggleLayer && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wide">Environment Layers</span>
            </div>
            {environmentLoading && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-700/60 text-amber-300 font-mono animate-pulse">
                Loading...
              </span>
            )}
            {!environmentLoading && environmentAvailable && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-300 font-mono">
                OSM
              </span>
            )}
          </div>

          {/* Buildings Toggle */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              Buildings
            </span>
            <button
              onClick={() => onToggleLayer('buildings')}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                layerVisibility.buildings ? 'bg-amber-500' : 'bg-slate-800'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${layerVisibility.buildings ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Color by Height Source Toggle (when buildings active) */}
          {layerVisibility.buildings && onToggleColorBySource && (
            <div className="pl-4 py-1.5 border-l-2 border-cyan-500/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-cyan-300 text-[11px] font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  Color by Height Source
                </span>
                <button
                  onClick={onToggleColorBySource}
                  className={`w-9 h-4.5 rounded-full p-0.5 transition-colors ${
                    colorBySource ? 'bg-cyan-500' : 'bg-slate-800'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${colorBySource ? 'translate-x-4.5' : 'translate-x-0'}`} />
                </button>
              </div>

              {colorBySource && (
                <div className="grid grid-cols-3 gap-1 pt-1 text-[9px] font-mono text-slate-400">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                    <span>LiDAR</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span>Mapped</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                    <span>Estimated</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Roads Toggle */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-slate-400" />
              Roads
            </span>
            <button
              onClick={() => onToggleLayer('roads')}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                layerVisibility.roads ? 'bg-slate-500' : 'bg-slate-800'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${layerVisibility.roads ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Water Toggle */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-blue-400" />
              Water Bodies
            </span>
            <button
              onClick={() => onToggleLayer('water')}
              className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                layerVisibility.water ? 'bg-blue-500' : 'bg-slate-800'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${layerVisibility.water ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
