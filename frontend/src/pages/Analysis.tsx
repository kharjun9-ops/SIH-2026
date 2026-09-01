import React, { useState, useEffect } from 'react';
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
  Database,
  AlertTriangle,
  Flame,
  Download,
  RefreshCw,
  Building2,
  Route
} from 'lucide-react';
import { TerrainReconstructResponse, SampleRegion, LandslideAnalysisResponse } from '../types';
import { AnalysisPanel } from '../components/AnalysisPanel/AnalysisPanel';
import { api } from '../services/api';

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
  const [landslideData, setLandslideData] = useState<LandslideAnalysisResponse | null>(null);
  const [landslideLoading, setLandslideLoading] = useState<boolean>(false);
  const [isExportingGeoJson, setIsExportingGeoJson] = useState<boolean>(false);

  useEffect(() => {
    if (terrainData) {
      setLandslideLoading(true);
      api.runLandslideAnalysis({
        bounds: terrainData.bounds,
        terrain_id: terrainData.terrain_id,
        grid_resolution: terrainData.grid_resolution,
        provider: terrainData.provider_used,
      })
      .then((data) => setLandslideData(data))
      .catch((err) => console.error('Failed to load landslide analysis:', err))
      .finally(() => setLandslideLoading(false));
    }
  }, [terrainData]);

  const handleExportGeoJson = async () => {
    if (!terrainData) return;
    setIsExportingGeoJson(true);
    try {
      const blob = await api.exportLandslideHotspots({
        bounds: terrainData.bounds,
        terrain_id: terrainData.terrain_id,
        grid_resolution: terrainData.grid_resolution,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `landslide_hotspots_${terrainData.region_name?.replace(/\s+/g, '_') || 'region'}.geojson`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('GeoJSON export failed:', err);
    } finally {
      setIsExportingGeoJson(false);
    }
  };

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

      {/* ─── Landslide Susceptibility & Exposure Screening Section ─── */}
      <div className="p-6 rounded-2xl bg-[#0d121f] border border-amber-500/40 space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">Landslide Susceptibility & Exposure Screening</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono">
                  Screening Model
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Multi-criteria GIS screening model combining physical DEM slope, curvature, and land cover evidence.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportGeoJson}
              disabled={isExportingGeoJson || !landslideData?.hotspots.length}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/40 text-amber-300 text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${isExportingGeoJson ? 'animate-bounce' : ''}`} />
              <span>Export Hotspots GeoJSON</span>
            </button>
          </div>
        </div>

        {landslideLoading && (
          <div className="py-12 text-center space-y-2 font-mono text-sm text-slate-400">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
            <div>Calculating Landslide Susceptibility & Curvature matrices...</div>
          </div>
        )}

        {!landslideLoading && landslideData && (
          <div className="space-y-6">

            {/* 3. Machine Learning Benchmark & Spatial Validation Table */}
            {landslideData.model_comparison && landslideData.model_comparison.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-medium font-mono flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <span>Machine Learning Model Benchmark (5-Fold Spatial Cross-Validation):</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">Held-out Spatial Partitioning (Zero Pixel Leakage)</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs font-mono text-left">
                    <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Algorithm</th>
                        <th className="py-2.5 px-3">ROC-AUC</th>
                        <th className="py-2.5 px-3">PR-AUC</th>
                        <th className="py-2.5 px-3">Precision</th>
                        <th className="py-2.5 px-3">Recall</th>
                        <th className="py-2.5 px-3">F1-Score</th>
                        <th className="py-2.5 px-3">Brier Score</th>
                        <th className="py-2.5 px-3">Validation Protocol</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 bg-slate-950/60">
                      {landslideData.model_comparison.map((item) => (
                        <tr key={item.model_id} className={`hover:bg-slate-900/80 transition-colors ${item.is_active ? 'bg-cyan-950/30' : ''}`}>
                          <td className="py-2.5 px-3 font-bold flex items-center gap-2">
                            {item.is_active && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                            <span className={item.is_active ? 'text-cyan-300' : 'text-slate-300'}>{item.model_name}</span>
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400 font-bold">{item.roc_auc.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-cyan-300">{item.pr_auc.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-slate-300">{item.precision.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-slate-300">{item.recall.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-amber-300 font-bold">{item.f1_score.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-slate-400">{item.brier_score.toFixed(3)}</td>
                          <td className="py-2.5 px-3 text-slate-500 text-[10px]">{item.validation_strategy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. Feature Importance Breakdown */}
            {landslideData.feature_importances && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono">
                <div className="flex items-center justify-between text-xs text-slate-300 font-bold pb-2 border-b border-slate-900">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    Feature Importance Ranking (Permutation & Impurity)
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Relative contribution to susceptibility model</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries(landslideData.feature_importances).map(([fname, imp]) => (
                    <div key={fname} className="p-2 rounded bg-slate-900 border border-slate-800 space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">{fname.replace('_', ' ')}:</span>
                        <strong className="text-cyan-300">{(imp * 100).toFixed(1)}%</strong>
                      </div>
                      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full" style={{ width: `${Math.min(100, imp * 300)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Real Historical Landslide Inventory Catalog Table */}
            {landslideData.historical_events && landslideData.historical_events.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-medium font-mono flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-rose-500" />
                    <span>Real Historical Landslide Events (NASA GLC & ISRO Landslide Atlas):</span>
                  </label>
                  {landslideData.historical_capture && (
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      Captured: {landslideData.historical_capture.captured_count}/{landslideData.historical_capture.total_in_bounds} ({landslideData.historical_capture.capture_rate_pct}%)
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs font-mono text-left">
                    <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Catalog ID</th>
                        <th className="py-2.5 px-3">Region / Location</th>
                        <th className="py-2.5 px-3">Event Date</th>
                        <th className="py-2.5 px-3">Trigger Mechanism</th>
                        <th className="py-2.5 px-3">Confidence</th>
                        <th className="py-2.5 px-3">Source Provenance</th>
                        <th className="py-2.5 px-3">Predicted Class</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 bg-slate-950/60">
                      {landslideData.historical_events.map((ev) => (
                        <tr key={ev.id} className="hover:bg-slate-900/80 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-rose-300 flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            <span>{ev.id}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{ev.state_region || 'Study Domain'}</td>
                          <td className="py-2.5 px-3 text-slate-400">{ev.event_date || 'Historical'}</td>
                          <td className="py-2.5 px-3 text-slate-300">{ev.trigger}</td>
                          <td className="py-2.5 px-3 text-emerald-400 font-semibold">{ev.confidence}</td>
                          <td className="py-2.5 px-3 text-slate-400 text-[10px]">{ev.source}</td>
                          <td className="py-2.5 px-3">
                            {ev.predicted_risk_class ? (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                ev.is_captured ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' : 'bg-amber-950 text-amber-300 border border-amber-500'
                              }`}>
                                {ev.predicted_risk_class} ({ev.predicted_score}) {ev.is_captured ? '✓ Captured' : '— Missed'}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Buffer Extent</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. Hotspot Clusters Table */}
            {landslideData.hotspots.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-medium font-mono">
                    Detected Hotspot Clusters ({landslideData.hotspots.length}):
                  </label>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs font-mono text-left">
                    <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Hotspot ID</th>
                        <th className="py-2.5 px-3">Risk Class</th>
                        <th className="py-2.5 px-3">Area (m²)</th>
                        <th className="py-2.5 px-3">Mean Slope</th>
                        <th className="py-2.5 px-3">Max Slope</th>
                        <th className="py-2.5 px-3">Peak Score</th>
                        <th className="py-2.5 px-3">Centroid (Lat, Lon)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 bg-slate-950/60">
                      {landslideData.hotspots.map((hs) => (
                        <tr key={hs.id} className="hover:bg-slate-900/80 transition-colors">
                          <td className="py-2.5 px-3 text-white font-bold">{hs.name}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              hs.risk_class === 'VERY HIGH'
                                ? 'bg-rose-950 text-rose-300 border border-rose-500'
                                : 'bg-orange-950 text-orange-300 border border-orange-500'
                            }`}>
                              {hs.risk_class}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">{hs.area_sq_m.toLocaleString()} m²</td>
                          <td className="py-2.5 px-3 text-amber-300">{hs.mean_slope_deg}°</td>
                          <td className="py-2.5 px-3 text-rose-400">{hs.max_slope_deg}°</td>
                          <td className="py-2.5 px-3 text-cyan-300 font-bold">{hs.peak_susceptibility}</td>
                          <td className="py-2.5 px-3 text-slate-400">{hs.centroid_lat.toFixed(5)}°, {hs.centroid_lon.toFixed(5)}°</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. Model Lineage & Scientific Notice */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-400 text-[11px] pb-1 border-b border-slate-900">
                <span>MODEL LINEAGE & DATA PROVENANCE</span>
                <span className="text-cyan-400">{landslideData.model_info.validation_status}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-300">
                <div>Model: <strong className="text-cyan-400">{landslideData.model_info.model_type}</strong></div>
                <div>Elevation/Slope: <strong className="text-emerald-400">Copernicus DEM (30m) ✓</strong></div>
                <div>Inventory: <strong className="text-emerald-400">NASA GLC / ISRO LAI ✓</strong></div>
                <div>Validation: <strong className="text-emerald-400">Spatial Block CV ✓</strong></div>
              </div>
              <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-900 italic">
                {landslideData.model_info.scientific_notice}
              </div>
            </div>
          </div>
        )}
      </div>

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
              <span className="text-[10px] text-slate-500 block">PROFILE & PLAN CURVATURE (FINITE DIFFERENCE)</span>
              <div className="text-cyan-300 font-semibold">
                K_prof = -(p²r + 2pqs + q²t) / (p²+q²)(1+p²+q²)^{3/2}
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
