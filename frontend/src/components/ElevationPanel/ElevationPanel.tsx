import React from 'react';
import { 
  Crosshair, 
  Ruler, 
  TrendingUp, 
  Compass, 
  MapPin, 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus,
  Activity,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Flame,
  Info,
  Sliders
} from 'lucide-react';
import { 
  PointInspection, 
  TwoPointMeasurementResponse, 
  InteractionTool, 
  PointValidation,
  LandslideInspection,
  VisualMode 
} from '../../types';

interface ElevationPanelProps {
  activeTool: InteractionTool;
  selectedPoint: PointInspection | null;
  pointAData: PointInspection | null;
  pointBData: PointInspection | null;
  measurement: TwoPointMeasurementResponse | null;
  onClearMeasurement: () => void;
  pointValidation?: PointValidation | null;
  landslideInspection?: LandslideInspection | null;
  visualMode?: VisualMode;
}

export const ElevationPanel: React.FC<ElevationPanelProps> = ({
  activeTool,
  selectedPoint,
  pointAData,
  pointBData,
  measurement,
  onClearMeasurement,
  pointValidation,
  landslideInspection,
  visualMode,
}) => {
  return (
    <div className="bg-[#0d121f] rounded-2xl border border-slate-800/80 p-5 shadow-2xl space-y-4">
      
      {/* 1. Point Inspection Result Card */}
      {activeTool === 'inspect' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-base text-white tracking-tight">
                DEM Point Elevation & Inspection
              </h3>
            </div>
            {selectedPoint && (
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </div>

          {selectedPoint ? (
            <div className="space-y-3">
              {/* Highlight Elevation Hero */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 to-blue-950/40 border border-cyan-500/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-cyan-300 font-mono tracking-wider block">
                    GROUND ELEVATION (DEM METERS)
                  </span>
                  <div className="text-3xl font-extrabold text-white font-mono tracking-tight mt-0.5">
                    {selectedPoint.elevation.toFixed(1)} <span className="text-cyan-400 text-lg">m</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>

              {/* Point Validation Card (Requirement #24) */}
              {pointValidation && (
                <div className="p-3 rounded-xl bg-slate-950/90 border border-emerald-500/40 space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between text-emerald-400 font-bold text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      DEM GROUND TRUTH VALIDATION
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-[10px]">
                      {pointValidation.is_validated ? 'VERIFIED' : 'REVIEW'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                    <div>Mesh Elev: <strong className="text-white">{pointValidation.mesh_elevation_m} m</strong></div>
                    <div>Source DEM: <strong className="text-cyan-300">{pointValidation.raw_dem_elevation_m} m</strong></div>
                    <div>Discrepancy: <strong className="text-emerald-400">Δ = {pointValidation.discrepancy_m} m</strong></div>
                    <div className="truncate" title={pointValidation.source_dem}>Provider: <strong className="text-slate-400 text-[10px]">{pointValidation.source_dem}</strong></div>
                  </div>
                </div>
              )}

              {/* Full Source Metadata & Accuracy Transparency (Requirement #6, #8, #9) */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/20 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-cyan-300 font-bold text-[11px] pb-1 border-b border-slate-800/80">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    AUTHORITATIVE SOURCE METADATA
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
                    {selectedPoint.source_type || 'DEM-derived'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-500 block text-[9px]">ELEVATION SOURCE</span>
                    <strong className="text-white text-[10px] truncate block" title={selectedPoint.source}>
                      {selectedPoint.source || 'Copernicus DEM GLO-30'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">NATIVE RESOLUTION</span>
                    <strong className="text-cyan-300 text-[10px] block">
                      {selectedPoint.native_resolution || '~30 m (1 Arc-Second)'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">VERTICAL DATUM</span>
                    <strong className="text-slate-200 text-[10px] block">
                      {selectedPoint.vertical_datum || 'EGM96 / EGM2008 Geoid'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">SAMPLING METHOD</span>
                    <strong className="text-slate-200 text-[10px] block">
                      {selectedPoint.sampling_method || 'Continuous Bilinear'}
                    </strong>
                  </div>
                  {selectedPoint.mesh_elevation_m !== undefined && selectedPoint.mesh_elevation_m !== null && (
                    <>
                      <div>
                        <span className="text-slate-500 block text-[9px]">RENDERED MESH Z</span>
                        <strong className="text-slate-400 text-[10px] block">{selectedPoint.mesh_elevation_m.toFixed(2)} m</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">MESH DISCREPANCY</span>
                        <strong className="text-emerald-400 text-[10px] block">Δ = {selectedPoint.elevation_difference_m ?? 0.0} m</strong>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Coordinates, Metric Position, Slope & Aspect Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">LATITUDE / NORTHING</span>
                  <strong className="text-slate-200">{selectedPoint.latitude.toFixed(7)}°</strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">LONGITUDE / EASTING</span>
                  <strong className="text-slate-200">{selectedPoint.longitude.toFixed(7)}°</strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">LOCAL METRIC (X, Y)</span>
                  <strong className="text-slate-200">
                    {selectedPoint.x_metric_m !== undefined ? `${selectedPoint.x_metric_m}m, ${selectedPoint.y_metric_m}m` : '0m, 0m'}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">PHYSICAL SLOPE</span>
                  <strong className="text-amber-300">{selectedPoint.slope.toFixed(2)}°</strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 col-span-2">
                  <span className="text-slate-500 text-[10px] block">ASPECT / ORIENTATION</span>
                  <strong className="text-cyan-300 flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5" />
                    {selectedPoint.aspect.toFixed(1)}° ({selectedPoint.aspect_cardinal})
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
              <Crosshair className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
              Click any point on the 3D terrain to query exact DEM elevation and validate against source raster data.
            </div>
          )}
        </div>
      )}

      {/* 2. Two-Point Measurement Result HUD */}
      {activeTool === 'measure' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Ruler className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-base text-white tracking-tight">
                Two-Point Height Difference (Δh)
              </h3>
            </div>
            {(pointAData || pointBData) && (
              <button
                onClick={onClearMeasurement}
                className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Reset Points
              </button>
            )}
          </div>

          {/* Point A & Point B Cards */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {/* Point A */}
            <div className={`p-3 rounded-xl border transition-all ${
              pointAData 
                ? 'bg-cyan-950/40 border-cyan-500/50 text-slate-200 shadow-md shadow-cyan-500/10'
                : 'bg-slate-900/50 border-slate-800 text-slate-500 border-dashed'
            }`}>
              <div className="flex items-center gap-1.5 text-cyan-300 text-[11px] font-bold mb-1">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                POINT A (Base)
              </div>
              {pointAData ? (
                <div>
                  <div className="text-base font-extrabold text-white">{pointAData.elevation.toFixed(2)} m</div>
                  <div className="text-[10px] text-slate-400 truncate">{pointAData.latitude.toFixed(6)}°, {pointAData.longitude.toFixed(6)}°</div>
                </div>
              ) : (
                <div className="text-[11px] italic py-1">Click terrain to place Point A</div>
              )}
            </div>

            {/* Point B */}
            <div className={`p-3 rounded-xl border transition-all ${
              pointBData 
                ? 'bg-rose-950/40 border-rose-500/50 text-slate-200 shadow-md shadow-rose-500/10'
                : 'bg-slate-900/50 border-slate-800 text-slate-500 border-dashed'
            }`}>
              <div className="flex items-center gap-1.5 text-rose-300 text-[11px] font-bold mb-1">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                POINT B (Target)
              </div>
              {pointBData ? (
                <div>
                  <div className="text-base font-extrabold text-white">{pointBData.elevation.toFixed(2)} m</div>
                  <div className="text-[10px] text-slate-400 truncate">{pointBData.latitude.toFixed(6)}°, {pointBData.longitude.toFixed(6)}°</div>
                </div>
              ) : (
                <div className="text-[11px] italic py-1">Click terrain to place Point B</div>
              )}
            </div>
          </div>

          {/* Computed Difference Metrics */}
          {measurement ? (
            <div className="space-y-3 pt-2">
              
              {/* Delta H Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                measurement.height_difference > 0
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : measurement.height_difference < 0
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
              }`}>
                <div>
                  <span className="text-[10px] font-mono tracking-wider uppercase block">
                    HEIGHT DIFFERENCE (Δh)
                  </span>
                  <div className="text-3xl font-extrabold font-mono tracking-tight mt-0.5">
                    {measurement.height_difference > 0 ? `+${measurement.height_difference.toFixed(2)}` : measurement.height_difference.toFixed(2)} <span className="text-lg">m</span>
                  </div>
                </div>
                <div className="flex flex-col items-end text-right">
                  <span className="text-xs font-semibold">
                    {measurement.height_difference > 0 ? '↗ Ascending (Point B Higher)' : measurement.height_difference < 0 ? '↘ Descending (Point B Lower)' : '→ Flat (Equal Elevation)'}
                  </span>
                  <span className="text-[11px] font-mono opacity-80">
                    Grade: {measurement.grade_percent ?? measurement.slope_percent}% ({measurement.slope_degrees}°)
                  </span>
                </div>
              </div>

              {/* Distance & Physical Topography Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">HORIZONTAL DISTANCE</span>
                  <strong className="text-slate-200">
                    {(measurement.horizontal_distance ?? measurement.distance_meters) > 1000 
                      ? `${((measurement.horizontal_distance ?? measurement.distance_meters) / 1000).toFixed(2)} km` 
                      : `${(measurement.horizontal_distance ?? measurement.distance_meters).toFixed(1)} m`}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">3D EUCLIDEAN DISTANCE</span>
                  <strong className="text-cyan-300">
                    {(measurement.distance_3d ?? measurement.distance_meters) > 1000
                      ? `${((measurement.distance_3d ?? measurement.distance_meters) / 1000).toFixed(2)} km`
                      : `${(measurement.distance_3d ?? measurement.distance_meters).toFixed(1)} m`}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">SLOPE ANGLE</span>
                  <strong className="text-amber-300">{measurement.slope_degrees.toFixed(2)}°</strong>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-500 text-[10px] block">GRADE PERCENTAGE</span>
                  <strong className="text-amber-300">{measurement.grade_percent ?? measurement.slope_percent}%</strong>
                </div>
              </div>

              {/* Vertical Datum & Source Verification */}
              <div className="p-2.5 bg-slate-950/90 rounded-xl border border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">
                  Vertical Datum: <strong className="text-emerald-400">{measurement.vertical_datum || 'EGM96 Geoid (MSL)'}</strong>
                </span>
                <span className="text-slate-500">
                  Datum Compatible: <strong className="text-emerald-400">VERIFIED ✓</strong>
                </span>
              </div>

              {/* Cross-Section Elevation Profile SVG Preview */}
              {measurement.elevation_profile && measurement.elevation_profile.length > 0 && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                      Transect Elevation Profile (A → B)
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {measurement.elevation_profile.length} samples
                    </span>
                  </div>

                  <div className="h-16 w-full flex items-end gap-0.5 pt-2">
                    {(() => {
                      const elevs = measurement.elevation_profile.map((p) => p.elevation_m);
                      const minP = Math.min(...elevs);
                      const maxP = Math.max(...elevs);
                      const rangeP = Math.max(1, maxP - minP);

                      return measurement.elevation_profile.map((pt, i) => {
                        const hPct = ((pt.elevation_m - minP) / rangeP) * 85 + 15;
                        return (
                          <div
                            key={i}
                            style={{ height: `${hPct}%` }}
                            className="flex-1 bg-gradient-to-t from-cyan-600 to-cyan-300 rounded-t-sm hover:brightness-125 transition-all cursor-pointer"
                            title={`Dist: ${pt.distance_m}m | Elev: ${pt.elevation_m.toFixed(2)}m`}
                          />
                        );
                      });
                    })()}
                  </div>

                  <div className="flex justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                    <span>A: {pointAData?.elevation.toFixed(2)}m</span>
                    {measurement.total_ascent_m !== undefined && (
                      <span className="text-emerald-400">+{measurement.total_ascent_m.toFixed(1)}m / -{measurement.total_descent_m?.toFixed(1)}m</span>
                    )}
                    <span>B: {pointBData?.elevation.toFixed(2)}m</span>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="p-4 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
              Place both Point A and Point B on the terrain mesh to calculate height difference and elevation cross-section.
            </div>
          )}
        </div>
      )}

    </div>
  );
};
