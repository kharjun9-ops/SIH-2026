import React, { useEffect, useRef, useState } from 'react';
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
  CheckCircle2,
  ChevronDown
} from 'lucide-react';
import { SampleRegion } from '../types';
import '../depthwizard.css';

import mountain from '../assets/mountain.png';
import depthMountain from '../assets/mountain-aligned-3d.png';

interface LandingProps {
  onStartReconstruction: () => void;
  onViewDemo: (sampleId: string) => void;
  samples: SampleRegion[];
  onNavigate?: (page: string) => void;
}

const layers = ["RGB", "DEPTH MAP", "POINT CLOUD", "MESH"];

export const Landing: React.FC<LandingProps> = ({
  onStartReconstruction,
  onViewDemo,
  samples,
  onNavigate = () => {},
}) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 50, y: 50 });
  const [inside, setInside] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [activeLayer, setActiveLayer] = useState<number>(0);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;

    const move = (event: MouseEvent) => {
      const rect = hero.getBoundingClientRect();
      setMouse({
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100
      });
      setInside(true);
    };

    const leave = () => setInside(false);

    hero.addEventListener('mousemove', move);
    hero.addEventListener('mouseleave', leave);

    return () => {
      hero.removeEventListener('mousemove', move);
      hero.removeEventListener('mouseleave', leave);
    };
  }, []);

  const handleStartWithTransition = () => {
    if (transitioning) return;
    setTransitioning(true);

    setTimeout(() => {
      onStartReconstruction();
    }, 2800);

    setTimeout(() => setTransitioning(false), 3800);
  };

  const scrollToContent = () => {
    contentRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="depthwizard-container min-h-screen bg-[#050b11] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* ============================================================== */}
      {/* 1. CINEMATIC DEPTHWIZARD HERO (Friend's Interactive Experience) */}
      {/* ============================================================== */}
      <section
        ref={heroRef}
        className={transitioning ? "depthwizard-hero transitioning" : "depthwizard-hero"}
        style={{
          // @ts-ignore
          "--mx": `${mouse.x}%`,
          "--my": `${mouse.y}%`
        }}
      >
        {/* Base Mountain Photo */}
        <div className="mountain">
          <img src={mountain} alt="Mountain landscape" />
        </div>

        {/* Real-time Cursor Depth Revealer */}
        <div className={inside ? "cursor-depth visible" : "cursor-depth"}>
          <img src={depthMountain} alt="Depth map representation" />
          <div className="depth-blue" />
          <div className="depth-lines" />
          <div className="depth-dots" />
        </div>

        {/* DepthWizard Top Bar Navigation */}
        <header className="dw-header">
          <div className="dw-brand" onClick={() => onNavigate('landing')}>
            <div className="dw-brand-symbol">
              <span />
              <span />
              <span />
            </div>
            <span className="tracking-widest font-bold">DEPTHWIZARD</span>
            <span className="text-[10px] text-cyan-400 font-mono px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/40">
              SIH26175
            </span>
          </div>

          <nav>
            <button onClick={() => onStartReconstruction()}>3D RECONSTRUCTION</button>
            <button onClick={() => onNavigate('depth')}>DEPTH PIPELINE</button>
            <button onClick={() => onNavigate('analysis')}>GIS ANALYSIS</button>
            <button onClick={() => onNavigate('about')}>ABOUT</button>
          </nav>

          <button className="dw-start-button flex items-center gap-1.5" onClick={handleStartWithTransition}>
            <span>START RECONSTRUCTION</span>
            <span className="text-cyan-400">↗</span>
          </button>
        </header>

        {/* Hero Spatial Intelligence Typography */}
        <div className="dw-hero-text">
          <div className="dw-eyebrow">
            <span className="dw-eyebrow-line" />
            <span>SPATIAL INTELLIGENCE / SIH26175</span>
          </div>

          <h1>
            THE WORLD
            <br />
            <span>IN DEPTH</span>
          </h1>

          <p>
            Transform geographic elevation data and Digital Elevation Models (DEM)
            <br />
            into interactive, high-fidelity 3D terrain in real-time.
          </p>

          <div className="flex items-center gap-6 mt-8">
            <button className="dw-explore-button" onClick={scrollToContent}>
              EXPLORE CAPABILITIES <span>↓</span>
            </button>
            <button 
              onClick={handleStartWithTransition}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs tracking-wider uppercase shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-2 hover:scale-105"
            >
              <span>Launch 3D Pipeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Layer Selector */}
        <div className="dw-visualize">
          <div className="dw-visualize-heading">
            <span>VISUALIZE</span>
            <span>04</span>
          </div>
          {layers.map((item, index) => (
            <div
              key={item}
              className={activeLayer === index ? "dw-visual-item active" : "dw-visual-item"}
              onClick={() => {
                setActiveLayer(index);
                if (index > 0) {
                  onStartReconstruction();
                }
              }}
            >
              <span>0{index + 1}</span>
              <strong>{item}</strong>
            </div>
          ))}
        </div>

        {/* Mouse Scanning Reticle */}
        {inside && (
          <>
            <div
              className="scanner"
              style={{ left: `${mouse.x}%`, top: `${mouse.y}%` }}
            >
              <div className="scanner-ring" />
              <div className="scanner-center" />
            </div>
            <div
              className="scan-text"
              style={{
                left: `calc(${mouse.x}% + 15px)`,
                top: `calc(${mouse.y}% + 15px)`
              }}
            >
              HOVER TO SCAN DEPTH
            </div>
          </>
        )}

        {/* Key Metrics */}
        <div className="dw-metrics">
          <div>
            <strong>2.4M+</strong>
            <span>SCANS PROCESSED</span>
          </div>
          <div>
            <strong>CM-LEVEL</strong>
            <span>PRECISION</span>
          </div>
          <div>
            <strong>REAL-TIME</strong>
            <span>3D RECONSTRUCTION</span>
          </div>
        </div>

        {/* Scroll CTA indicator */}
        <div className="dw-scroll" onClick={scrollToContent}>
          <span>SCROLL DOWN</span>
          <i />
        </div>

        {/* Cinematic Particle Dissolve & Warp Transition Overlay */}
        <div className="dw-transition">
          <div className="dw-transition-photo">
            <img src={mountain} alt="" />
          </div>

          <div className="dw-transition-depth">
            <img src={depthMountain} alt="" />
          </div>

          <div className="dw-particle-field">
            {Array.from({ length: 260 }, (_, index) => {
              const x = (index * 37 + 11) % 100;
              const y = (index * 61 + 7) % 100;
              const dx = ((index * 17) % 141) - 70;
              const dy = ((index * 29) % 121) - 60;
              const delay = (index % 45) * 0.012;
              const size = index % 7 === 0 ? 2 : 1;

              return (
                <i
                  key={index}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    animationDelay: `${delay}s`,
                    // @ts-ignore
                    "--dx": `${dx}px`,
                    "--dy": `${dy}px`
                  }}
                />
              );
            })}
          </div>

          <div className="dw-energy-sweep" />
          <div className="dw-transition-grid" />
          <div className="dw-transition-glow" />
          <div className="dw-transition-vignette" />
        </div>
      </section>

      {/* ============================================================== */}
      {/* 2. ORIGINAL PROJECT CORE: QUICK DEMOS, CAPABILITIES & PIPELINE  */}
      {/* ============================================================== */}
      <div ref={contentRef} className="max-w-7xl mx-auto px-4 lg:px-8 w-full space-y-20 py-20">
        
        {/* Quick Demo Locations & Presets */}
        <section className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-medium shadow-lg shadow-cyan-500/10">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Interactive Terrain Presets</span>
          </div>

          <div className="space-y-2 max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Explore High-Resolution Terrains
            </h2>
            <p className="text-sm text-slate-400">
              Click any region to instantly load authoritative GIS elevation grids, satellite textures, and 3D meshes.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {samples.map((s) => (
              <button
                key={s.id}
                onClick={() => onViewDemo(s.id)}
                className="group px-4 py-2.5 bg-slate-900/90 hover:bg-cyan-950/80 text-slate-300 hover:text-cyan-200 border border-slate-800 hover:border-cyan-500/60 rounded-xl text-xs font-mono font-medium transition-all shadow-md hover:shadow-cyan-500/20 hover:-translate-y-0.5 flex items-center gap-2"
              >
                <Mountain className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span>{s.name.split('(')[0]}</span>
                <span className="text-[10px] text-slate-500 group-hover:text-cyan-400/80 font-mono">
                  ({s.peak_elevation}m)
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Feature Cards Grid (Geospatial & CV Capabilities) */}
        <section className="space-y-8">
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
            <div 
              onClick={() => onStartReconstruction()}
              className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                <Globe2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                Elevation Mapping
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Retrieve real-time elevation grids from SRTM, Copernicus 30m, Open-Elevation, and local GeoTIFF tiles with bilinear and bicubic resampling.
              </p>
            </div>

            {/* Card 2: 3D Terrain Mesh */}
            <div 
              onClick={() => onStartReconstruction()}
              className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <Mountain className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
                3D Terrain Mesh & Cesium
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Convert elevation matrices into optimized Three.js BufferGeometry and Cesium 3D Globe with dynamic hypsometric colormapping and wireframe.
              </p>
            </div>

            {/* Card 3: Terrain Analysis */}
            <div 
              onClick={() => onNavigate('analysis')}
              className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                Terrain Analysis & Landslide Risk
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Calculate Horn's topographic slope, aspect orientation, contour intervals, and machine learning landslide hazard scores.
              </p>
            </div>

            {/* Card 4: Two-Point Measurement */}
            <div 
              onClick={() => onStartReconstruction()}
              className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                <Ruler className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors">
                Two-Point Height Difference
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Pick reference points A & B to compute height differences, true 3D surface distances, slope gradients, and interactive elevation cross-sections.
              </p>
            </div>

            {/* Card 5: Single-Image Depth */}
            <div 
              onClick={() => onNavigate('depth')}
              className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                AI Monocular Depth Pipeline
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Upload landscape photos to extract OpenCV ORB keypoints, terrain horizon lines, and dense depth heatmaps with Structure-from-Motion.
              </p>
            </div>

            {/* Card 6: 3D Asset Export */}
            <div 
              onClick={() => onStartReconstruction()}
              className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 transition-all space-y-3 cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-110 transition-transform">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-rose-300 transition-colors">
                3D Asset Export (GLTF & OBJ)
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Export generated terrain models directly into standard GLTF/GLB or OBJ format for downstream CAD, GIS, or Unreal/Unity game engine workflows.
              </p>
            </div>
          </div>
        </section>

        {/* Technical Architecture Highlight */}
        <section className="p-8 rounded-3xl bg-gradient-to-b from-[#0d121f] to-[#080b12] border border-slate-800/80 space-y-6">
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
        </section>

        {/* Ready to Reconstruct Call to Action */}
        <section className="text-center py-12 px-6 rounded-3xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-950/50 border border-cyan-800/40 space-y-5">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Ready to Reconstruct Any Terrain on Earth?
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto text-sm">
            Select custom coordinates anywhere on the globe or choose from our curated presets with real SRTM elevation.
          </p>
          <button
            onClick={onStartReconstruction}
            className="px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-base shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-105 transition-all inline-flex items-center gap-3"
          >
            <span>Launch 3D Reconstruction</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </section>

      </div>

    </div>
  );
};

export default Landing;
