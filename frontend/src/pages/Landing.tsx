import React from 'react';
import { 
  Mountain, 
  Layers, 
  Eye, 
  BarChart3, 
  Sparkles, 
  ArrowRight, 
  Compass, 
  ShieldCheck, 
  Cpu, 
  Globe2, 
  Ruler, 
  CheckCircle2 
} from 'lucide-react';
import { SampleRegion } from '../types';

interface LandingProps {
  onStartReconstruction: () => void;
  onViewDemo: (sampleId: string) => void;
  samples: SampleRegion[];
}

export const Landing: React.FC<LandingProps> = ({
  onStartReconstruction,
  onViewDemo,
  samples,
}) => {
  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col space-y-16 pb-20">
      
      {/* Hero Section */}
      <section className="relative pt-12 pb-16 px-4 lg:px-8 max-w-7xl mx-auto w-full text-center space-y-8 overflow-hidden">
        
        {/* Glowing Background Radial Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-cyan-500/15 via-blue-600/10 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />

        {/* SIH Hackathon Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-medium shadow-lg shadow-cyan-500/10">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Smart India Hackathon 2026 &mdash; Problem Statement SIH26175</span>
        </div>

        {/* Main Hero Title & Subtitle */}
        <div className="max-w-4xl mx-auto space-y-4">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
            3D Terrain <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">Reconstruction</span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto font-normal leading-relaxed">
            Transform geographic elevation data and Digital Elevation Models (DEM) into an interactive, high-fidelity 3D representation of the terrain in real-time.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            onClick={onStartReconstruction}
            className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm sm:text-base shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 transition-all flex items-center gap-2 group"
          >
            <span>Start Reconstruction</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() => onViewDemo('mount_fuji')}
            className="px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 text-sm sm:text-base font-semibold transition-all hover:border-cyan-500/50 flex items-center gap-2"
          >
            <Eye className="w-4 h-4 text-cyan-400" />
            <span>View Demo (Mount Fuji 3,776m)</span>
          </button>
        </div>

        {/* Quick Demo Location Badges */}
        <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Quick Explore:</span>
          {samples.map((s) => (
            <button
              key={s.id}
              onClick={() => onViewDemo(s.id)}
              className="px-3 py-1 bg-slate-900/60 hover:bg-cyan-950 hover:text-cyan-300 text-slate-400 border border-slate-800 hover:border-cyan-800 rounded-lg text-xs font-mono transition-all"
            >
              {s.name.split('(')[0]} ({s.peak_elevation}m)
            </button>
          ))}
        </div>

      </section>

      {/* Feature Cards Grid (Requirement #6) */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 w-full space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Core Geospatial & CV Capabilities
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            A comprehensive pipeline engineered for accuracy, responsiveness, and multi-modal terrain alignment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          
          {/* Card 1: Elevation Mapping */}
          <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Globe2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Elevation Mapping</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Retrieve real-time elevation grids from SRTM, Copernicus 30m, Open-Elevation, and local GeoTIFF tiles with bilinear and bicubic resampling.
            </p>
          </div>

          {/* Card 2: 3D Terrain Mesh */}
          <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Mountain className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">3D Terrain Mesh</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Convert elevation matrices into optimized Three.js BufferGeometry with dynamic hypsometric colormapping, wireframe, point cloud, and shadows.
            </p>
          </div>

          {/* Card 3: Terrain Analysis */}
          <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Terrain Analysis</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Calculate Horn's topographic slope, aspect orientation, contour intervals, and real-time raycasting inspection of any surface vertex.
            </p>
          </div>

          {/* Card 4: Two-Point Measurement */}
          <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Ruler className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Two-Point Height Difference</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pick reference points A & B to compute height differences ($\Delta h$), surface distances, slope gradients, and cross-section profiles.
            </p>
          </div>

          {/* Card 5: Single-Image Depth */}
          <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Single-Image Support</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Upload landscape photos to extract OpenCV ORB keypoints, terrain horizon lines, and AI monocular relative depth heatmaps.
            </p>
          </div>

          {/* Card 6: Export & Verification */}
          <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">3D Asset Export</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Export generated terrain models directly into standard GLTF/GLB or OBJ format for downstream CAD, GIS, or Unreal/Unity game engine workflows.
            </p>
          </div>

        </div>
      </section>

      {/* Technical Architecture Highlight */}
      <section className="max-w-7xl mx-auto px-4 lg:px-8 w-full">
        <div className="p-8 rounded-3xl bg-gradient-to-b from-[#0d121f] to-[#080b12] border border-slate-800/80 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono text-cyan-400 tracking-wider uppercase font-semibold">
                END-TO-END PIPELINE ARCHITECTURE
              </span>
              <h3 className="text-2xl font-bold text-white mt-1">
                Deterministic GIS Elevation + Computer Vision
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-xl w-fit">
              <CheckCircle2 className="w-4 h-4" />
              <span>Full Stack MVP Ready</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            {[
              { step: '01', title: 'Location Pick', sub: 'Search or Lat/Lon' },
              { step: '02', title: 'Area Bounding', sub: 'Calculated km²' },
              { step: '03', title: 'DEM Retrieval', sub: 'SRTM / GeoTIFF' },
              { step: '04', title: 'GIS Processing', sub: 'Slope & Aspect' },
              { step: '05', title: 'Triangulation', sub: 'BufferGeometry' },
              { step: '06', title: 'Interactive 3D', sub: 'Three.js & Drei' },
            ].map((p, idx) => (
              <div key={idx} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono text-cyan-400 font-bold block">{p.step}</span>
                <div className="text-xs font-bold text-slate-200">{p.title}</div>
                <div className="text-[10px] text-slate-500">{p.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
};
