import React from 'react';
import { 
  BarChart3, 
  Mountain, 
  Compass, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Layers, 
  Globe2, 
  Maximize2, 
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Database
} from 'lucide-react';
import { TerrainReconstructResponse, SampleRegion } from '../types';
import { AnalysisPanel } from '../components/AnalysisPanel/AnalysisPanel';

interface AnalysisProps {
  terrainData: TerrainReconstructResponse | null;
  samples: SampleRegion[];
  onSelectSample: (sampleId: string) => void;
  onNavigateToReconstruct: () => void;
}

export const Analysis: React.FC<AnalysisProps> = ({
  terrainData,
  samples,
  onSelectSample,
  onNavigateToReconstruct,
}) => {
  if (!terrainData) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto shadow-xl shadow-cyan-500/10">
          <BarChart3 className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-extrabold text-white">Geospatial Analysis Dashboard</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Generate or select a terrain model to view topographic metrics, slope gradients, and elevation statistics.
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
            </button>
          ))}
        </div>

        <div className="pt-4">
          <button
            onClick={onNavigateToReconstruct}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm rounded-xl shadow-xl shadow-cyan-500/25 transition-all inline-flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Reconstruction</span>
          </button>
        </div>
      </div>
    );
  }

  const stats = terrainData.stats;
  const bounds = terrainData.bounds;
  const mb = terrainData.metric_bounds;
  const meta = terrainData.gis_metadata;

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-8">
      
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-mono text-emerald-400">AUTHORITATIVE GIS TERRAIN REPORT</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
            Topographic Analysis &mdash; {terrainData.region_name || 'Selected Bounds'}
          </h1>
        </div>

        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
          <span>Grid: <strong className="text-cyan-300">{terrainData.grid_resolution}×{terrainData.grid_resolution}</strong></span>
          <span className="text-slate-600">|</span>
          <span>Area: <strong className="text-emerald-400">{stats.area_sq_km} km²</strong></span>
        </div>
      </div>

      {/* Main Analysis Card Grid with Data Quality */}
      <AnalysisPanel
        stats={stats}
        bounds={bounds}
        metricBounds={mb}
        gisMetadata={meta}
        providerUsed={terrainData.provider_used}
        gridResolution={terrainData.grid_resolution}
      />

      {/* Deep Topographic Breakdown Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Metric & Geographic Bounds Card */}
        <div className="p-5 rounded-2xl bg-[#0d121f] border border-slate-800/80 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-200 font-bold text-sm">
            <Globe2 className="w-4 h-4 text-cyan-400" />
            <span>Local Metric Coordinate Bounds</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">METRIC WIDTH (X)</span>
              <strong className="text-slate-200">{mb.width_m} m ({mb.min_x_m}m to {mb.max_x_m}m)</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">METRIC LENGTH (Y)</span>
              <strong className="text-slate-200">{mb.height_m} m ({mb.min_y_m}m to {mb.max_y_m}m)</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">LATITUDE SPAN</span>
              <strong className="text-slate-200">{bounds.min_lat}° to {bounds.max_lat}°</strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-500 block">LONGITUDE SPAN</span>
              <strong className="text-slate-200">{bounds.min_lon}° to {bounds.max_lon}°</strong>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Center Coordinates (Origin 0,0):</span>
              <strong className="text-cyan-300 font-mono">{bounds.center_lat || ((bounds.min_lat + bounds.max_lat)/2).toFixed(4)}°, {bounds.center_lon || ((bounds.min_lon + bounds.max_lon)/2).toFixed(4)}°</strong>
            </div>
            <div className="flex justify-between">
              <span>True Aspect Ratio:</span>
              <strong className="text-emerald-400 font-mono">1.0 : {(mb.height_m / mb.width_m).toFixed(3)} (Isotropic Metric Plane)</strong>
            </div>
          </div>
        </div>

        {/* Mathematical Formulas Card */}
        <div className="p-5 rounded-2xl bg-[#0d121f] border border-slate-800/80 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-200 font-bold text-sm">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>GIS Computation Formulas</span>
          </div>

          <div className="space-y-2 text-xs font-mono text-slate-300">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
              <span className="text-[10px] text-slate-500 block">HORN'S SLOPE FORMULA (METERS)</span>
              <div className="text-cyan-300 font-semibold">
                Slope = arctan( √((∂z/∂x)² + (∂z/∂y)²) )
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
              <span className="text-[10px] text-slate-500 block">ASPECT (COMPASS HEADING)</span>
              <div className="text-cyan-300 font-semibold">
                Aspect = 90° - atan2(∂z/∂y, -∂z/∂x) mod 360°
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-0.5">
              <span className="text-[10px] text-slate-500 block">METRIC CONVERSION (WGS84)</span>
              <div className="text-cyan-300 font-semibold">
                ΔX = Δλ · 111320 · cos(φ), ΔY = Δφ · 111320
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
