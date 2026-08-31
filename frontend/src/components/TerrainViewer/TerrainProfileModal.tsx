import React from 'react';
import { 
  X, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Mountain, 
  Compass, 
  Ruler,
  Download
} from 'lucide-react';
import { TwoPointMeasurementResponse } from '../../types';

interface TerrainProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  measurement: TwoPointMeasurementResponse | null;
}

export const TerrainProfileModal: React.FC<TerrainProfileModalProps> = ({
  isOpen,
  onClose,
  measurement,
}) => {
  if (!isOpen || !measurement || !measurement.elevation_profile || measurement.elevation_profile.length === 0) {
    return null;
  }

  const profile = measurement.elevation_profile;
  const elevs = profile.map((p) => p.elevation_m);
  const minElev = Math.min(...elevs);
  const maxElev = Math.max(...elevs);
  const rangeElev = Math.max(1.0, maxElev - minElev);
  const totalDist = measurement.distance_meters;

  // Calculate cumulative gain and loss
  let totalGain = 0;
  let totalLoss = 0;
  for (let i = 1; i < profile.length; i++) {
    const diff = profile[i].elevation_m - profile[i - 1].elevation_m;
    if (diff > 0) totalGain += diff;
    else totalLoss += Math.abs(diff);
  }

  // SVG Chart Dimensions
  const svgWidth = 700;
  const svgHeight = 220;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const pointsStr = profile.map((p, i) => {
    const x = padLeft + (p.distance_m / Math.max(1, totalDist)) * chartW;
    const y = padTop + chartH - ((p.elevation_m - minElev) / rangeElev) * chartH;
    return `${x},${y}`;
  }).join(' ');

  const areaStr = `${padLeft},${padTop + chartH} ${pointsStr} ${padLeft + chartW},${padTop + chartH}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0c121e] border border-cyan-500/40 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-tight">
                Cross-Section Terrain Elevation Profile
              </h3>
              <p className="text-xs text-slate-400">
                Point A ({measurement.point_a.elevation}m) &rarr; Point B ({measurement.point_b.elevation}m) along {(totalDist / 1000).toFixed(2)} km surface line
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

        {/* 6 Profile Metric Cards (Requirement #14) */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 bg-slate-950/60 border-b border-slate-800/80">
          
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono block">HORIZ. DISTANCE</span>
            <strong className="text-white text-base font-mono">
              {(totalDist / 1000).toFixed(2)} <span className="text-xs text-slate-400">km</span>
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono block">SURFACE DISTANCE</span>
            <strong className="text-cyan-300 text-base font-mono">
              {((measurement.surface_distance_m || totalDist) / 1000).toFixed(2)} <span className="text-xs text-cyan-400">km</span>
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono block">TOTAL ASCENT</span>
            <strong className="text-emerald-400 text-base font-mono flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> +{(measurement.total_ascent_m || totalGain).toFixed(1)}m
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono block">TOTAL DESCENT</span>
            <strong className="text-rose-400 text-base font-mono flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" /> -{(measurement.total_descent_m || totalLoss).toFixed(1)}m
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono block">MIN / MAX ELEV.</span>
            <strong className="text-slate-200 text-xs font-mono block truncate">
              {minElev.toFixed(0)}m &mdash; {maxElev.toFixed(0)}m
            </strong>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <span className="text-[10px] text-slate-500 font-mono block">AVERAGE GRADE</span>
            <strong className="text-amber-300 text-base font-mono">
              {measurement.slope_percent}% ({measurement.slope_degrees}°)
            </strong>
          </div>

        </div>

        {/* SVG Profile Chart */}
        <div className="p-6 flex-1 overflow-x-auto flex flex-col items-center justify-center bg-[#070a10]">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full max-w-3xl h-auto"
          >
            <defs>
              <linearGradient id="profileGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Background Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((t, i) => {
              const y = padTop + chartH * (1 - t);
              const elevVal = minElev + rangeElev * t;
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + chartW}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padLeft - 10}
                    y={y + 4}
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {elevVal.toFixed(0)}m
                  </text>
                </g>
              );
            })}

            {/* Filled Profile Area */}
            <polygon points={areaStr} fill="url(#profileGradient)" />

            {/* Stroke Line */}
            <polyline
              points={pointsStr}
              fill="none"
              stroke="#00e5ff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* X-axis distance labels */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((t, i) => {
              const x = padLeft + chartW * t;
              const distVal = (totalDist * t) / 1000;
              return (
                <text
                  key={i}
                  x={x}
                  y={padTop + chartH + 20}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {distVal.toFixed(1)} km
                </text>
              );
            })}

            {/* Start Pin */}
            <circle cx={padLeft} cy={padTop + chartH - ((profile[0].elevation_m - minElev) / rangeElev) * chartH} r="4.5" fill="#38bdf8" stroke="#fff" strokeWidth="1.5" />
            
            {/* End Pin */}
            <circle cx={padLeft + chartW} cy={padTop + chartH - ((profile[profile.length - 1].elevation_m - minElev) / rangeElev) * chartH} r="4.5" fill="#f43f5e" stroke="#fff" strokeWidth="1.5" />
          </svg>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono">
            Generated from authoritative source DEM resolution (~30m cell sampling)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors"
          >
            Close Profile
          </button>
        </div>

      </div>
    </div>
  );
};
