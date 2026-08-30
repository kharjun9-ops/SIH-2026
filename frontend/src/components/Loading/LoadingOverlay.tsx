import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  isLoading: boolean;
  stepMessage?: string;
}

const STEPS = [
  'Location & bounds determined',
  'Querying Digital Elevation Model (DEM)',
  'Processing raster & resampling elevation grid',
  'Computing slope & aspect matrices',
  'Triangulating 3D mesh geometry',
  'Compiling Three.js shaders & materials',
  'Preparing interactive 3D visualization'
];

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isLoading }) => {
  const [completedSteps, setCompletedSteps] = useState<number>(0);

  useEffect(() => {
    if (!isLoading) {
      setCompletedSteps(0);
      return;
    }

    const interval = setInterval(() => {
      setCompletedSteps((prev) => {
        if (prev < STEPS.length - 1) return prev + 1;
        return prev;
      });
    }, 280);

    return () => clearInterval(interval);
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#070a10]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0d121f] border border-cyan-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl shadow-cyan-500/10 space-y-5 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white tracking-tight">
              Processing 3D Terrain
            </h3>
            <p className="text-xs text-slate-400">
              Generating topographic mesh & GIS calculations...
            </p>
          </div>
        </div>

        {/* Progress Checklist */}
        <div className="space-y-2.5 bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-xs font-mono">
          {STEPS.map((step, index) => {
            const isDone = index < completedSteps;
            const isCurrent = index === completedSteps;

            return (
              <div
                key={index}
                className={`flex items-center gap-2.5 transition-all duration-300 ${
                  isDone 
                    ? 'text-emerald-400' 
                    : isCurrent 
                    ? 'text-cyan-300 font-semibold' 
                    : 'text-slate-600'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                )}
                <span>{step}</span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${Math.min(100, ((completedSteps + 1) / STEPS.length) * 100)}%` }}
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>SIH26175 Pipeline</span>
            <span>{Math.round(((completedSteps + 1) / STEPS.length) * 100)}%</span>
          </div>
        </div>

      </div>
    </div>
  );
};
