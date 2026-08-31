import React from 'react';
import { 
  X, 
  ShieldCheck, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Database,
  BarChart3,
  Layers,
  Scale
} from 'lucide-react';
import { ValidationReport, GISMetadata } from '../../types';

interface AccuracyModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ValidationReport | null;
  gisMetadata?: GISMetadata;
  isLoading?: boolean;
}

export const AccuracyModal: React.FC<AccuracyModalProps> = ({
  isOpen,
  onClose,
  report,
  gisMetadata,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0c121e] border border-cyan-500/40 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight">
                Mesh-to-Source Raster Fidelity Validation
              </h3>
              <p className="text-xs text-slate-400">
                Rigorous statistical evaluation comparing raw source DEM raster against resampled 3D mesh (Validates raster preservation, not field survey)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 bg-[#070a10]">
          
          {isLoading ? (
            <div className="p-12 text-center space-y-3">
              <Activity className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-300 font-mono">Running statistical sampling across 100 coordinates...</p>
            </div>
          ) : report ? (
            <div className="space-y-6">
              
              {/* Top 4 Statistical KPI Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">MEAN ABSOLUTE ERROR</span>
                  <div className="text-2xl font-extrabold text-cyan-300 mt-0.5">
                    {report.mean_absolute_error_m} <span className="text-xs text-slate-400">m</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">MAE = 1/N Σ|z_mesh - z_raw|</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">ROOT MEAN SQUARE ERR</span>
                  <div className="text-2xl font-extrabold text-emerald-400 mt-0.5">
                    {report.root_mean_square_error_m} <span className="text-xs text-slate-400">m</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">RMSE = √(1/N Σ(Δz)²)</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">MAXIMUM DEVIATION</span>
                  <div className="text-2xl font-extrabold text-amber-400 mt-0.5">
                    {report.max_error_m} <span className="text-xs text-slate-400">m</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Peak topography delta</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">MEAN BIAS ERROR</span>
                  <div className="text-2xl font-extrabold text-white mt-0.5">
                    {report.mean_bias_m > 0 ? `+${report.mean_bias_m}` : report.mean_bias_m} <span className="text-xs text-slate-400">m</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Signed mean deviation</span>
                </div>

              </div>

              {/* Data Quality & Dataset Parameters Panel */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-300 font-bold text-[11px] pb-1 border-b border-slate-800">
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <Database className="w-4 h-4 text-cyan-400" />
                    DATA LINEAGE & CRS METADATA
                  </span>
                  <span className="text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                    {report.fidelity_assessment}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-slate-400 text-[11px]">
                  <div>Source: <strong className="text-slate-200">{report.source_dataset}</strong></div>
                  <div>Resolution: <strong className="text-cyan-300">{gisMetadata?.horizontal_resolution || '~30m (1 arc-sec)'}</strong></div>
                  <div>Vertical Datum: <strong className="text-slate-200">{gisMetadata?.vertical_datum || 'EGM96 Geoid (MSL)'}</strong></div>
                  <div>Projected CRS: <strong className="text-slate-200">Local Transverse Mercator (WGS84)</strong></div>
                  <div>Sample Count: <strong className="text-emerald-400">{report.sample_count} points</strong></div>
                  <div>Interpolation: <strong className="text-slate-300">Bilinear Resampling</strong></div>
                </div>
              </div>

              {/* Sample Table (Representative 15 sampled points) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Scale className="w-4 h-4 text-cyan-400" />
                    Representative Random Sample Points (Source DEM vs 3D Mesh)
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Showing top {report.sample_points_table.length} points
                  </span>
                </div>

                <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">#</th>
                        <th className="py-2 px-3">Latitude</th>
                        <th className="py-2 px-3">Longitude</th>
                        <th className="py-2 px-3">Mesh Elev</th>
                        <th className="py-2 px-3">Raw DEM</th>
                        <th className="py-2 px-3">Error (Δz)</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900 text-slate-300 text-[11px]">
                      {report.sample_points_table.map((pt, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3 text-slate-300">{pt.latitude}°</td>
                          <td className="py-2 px-3 text-slate-300">{pt.longitude}°</td>
                          <td className="py-2 px-3 font-semibold text-white">{pt.mesh_elevation_m}m</td>
                          <td className="py-2 px-3 text-cyan-300">{pt.raw_dem_elevation_m}m</td>
                          <td className="py-2 px-3 font-semibold text-emerald-400">
                            {pt.error_m.toFixed(2)}m
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                              ✓ {pt.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Accuracy Transparency Disclaimer */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-300 font-semibold text-[11px]">
                  <Info className="w-4 h-4 text-cyan-400" />
                  <span>Important Geospatial Accuracy Transparency Note:</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  {report.accuracy_notice} Source DEM resolution (~30m SRTM / Copernicus) establishes the baseline physical accuracy. Resampling creates smooth geometric visualization in Three.js but does not fabricate new sub-meter physical measurements.
                </p>
              </div>

            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              No validation report available.
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-mono">
            SIH26175 Geodetic Verification Module
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            Close Report
          </button>
        </div>

      </div>
    </div>
  );
};
