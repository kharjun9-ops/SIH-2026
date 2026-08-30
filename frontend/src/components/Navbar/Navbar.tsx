import React from 'react';
import { 
  Layers, 
  Mountain, 
  Eye, 
  BarChart3, 
  Info, 
  Compass, 
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { SampleRegion } from '../../types';

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  samples: SampleRegion[];
  selectedSample?: string;
  onSelectSample: (sampleId: string) => void;
  hasReconstructedData: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  onNavigate,
  samples,
  selectedSample,
  onSelectSample,
  hasReconstructedData
}) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#0a0d14]/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Brand Logo & SIH ID */}
        <div 
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Mountain className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight group-hover:text-cyan-300 transition-colors">
                TERRAIN<span className="text-cyan-400">3D</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-mono font-medium">
                SIH26175
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              GIS Elevation & 3D Reconstruction Pipeline
            </p>
          </div>
        </div>

        {/* Quick Sample Preset Dropdown */}
        <div className="hidden md:flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-lg px-3 py-1.5">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span className="text-xs text-slate-400 font-medium">Preset:</span>
          <select
            value={selectedSample || ''}
            onChange={(e) => onSelectSample(e.target.value)}
            aria-label="Preset Sample Region"
            className="bg-transparent text-xs text-cyan-200 font-medium focus:outline-none cursor-pointer"
          >
            <option value="" className="bg-slate-900 text-slate-300">Choose Region Preset...</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id} className="bg-slate-900 text-slate-200">
                {s.name} ({s.country})
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => onNavigate('landing')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
              currentPage === 'landing'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            Overview
          </button>

          <button
            onClick={() => onNavigate('reconstruction')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
              currentPage === 'reconstruction'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Reconstruct</span>
          </button>

          <button
            onClick={() => onNavigate('viewer')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
              currentPage === 'viewer'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>3D Studio</span>
            {hasReconstructedData && (
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => onNavigate('analysis')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
              currentPage === 'analysis'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analysis</span>
          </button>

          <button
            onClick={() => onNavigate('about')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
              currentPage === 'about'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Info className="w-4 h-4" />
            <span className="hidden sm:inline">About</span>
          </button>
        </nav>

      </div>
    </header>
  );
};
