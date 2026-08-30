import React from 'react';
import { 
  Mountain, 
  Layers, 
  Cpu, 
  Globe2, 
  ShieldCheck, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Code2,
  FileText
} from 'lucide-react';

export const About: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 space-y-10">
      
      {/* Title */}
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 text-xs font-mono">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Smart India Hackathon SIH26175 &mdash; Project Documentation</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          3D Terrain Reconstruction & Analysis Architecture
        </h1>
        <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
          A full-stack geospatial platform designed to transform multi-source elevation data and landscape imagery into interactive 3D terrain meshes with real-time inspection, measurement, and computer-vision depth analysis.
        </p>
      </div>

      {/* 1. Core Objectives */}
      <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Mountain className="w-5 h-5 text-cyan-400" />
          Core Objectives & System Requirements
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
          {[
            'Geographic location and coordinate selection with interactive maps',
            'Dynamic Digital Elevation Model (DEM) data retrieval and cropping',
            'Raster validation, no-data interpolation, and grid downsampling',
            'Optimized 3D mesh triangulation with Three.js BufferGeometry',
            'Interactive OrbitControls with rotation, zooming, panning, and view presets',
            'Raycasting point inspection for Lat, Lon, Elevation, Slope, and Aspect',
            'Two-point height difference (Δh) tool with 3D laser indicator',
            'Dynamic elevation exaggeration slider (1x to 5x vertical scaling)',
            'Single-image terrain feature extraction with OpenCV ORB keypoints',
            'Pretrained monocular relative depth estimation with explicit relative labeling'
          ].map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Critical Technical Decision Notice */}
      <div className="p-6 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 space-y-3 shadow-xl">
        <h2 className="text-lg font-bold text-cyan-300 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-cyan-400" />
          Key Technical Decision: Single-Image Depth vs. Absolute Elevation
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          In accordance with scientific photogrammetry and computer-vision principles, <strong>monocular AI depth models estimate relative depth only</strong> (relative depth map $D(x, y) \in [0, 1]$), not calibrated absolute meters. Accurate real-world metric elevation requires georeferenced spatial baselines (DEM).
        </p>
        <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-xs font-mono text-cyan-200">
          Single Image + Geographic Coordinates + DEM Elevation + Computer Vision = Accurate 3D Reconstructed Terrain
        </div>
      </div>

      {/* 3. Pipeline Diagram */}
      <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-cyan-400" />
          MVP Processing Pipeline
        </h2>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 space-y-2 overflow-x-auto">
          <div className="text-cyan-400 font-bold">USER INPUT</div>
          <div className="text-slate-400">├── Location Selection (Geocoding Search / Coordinates / Image EXIF GPS)</div>
          <div className="text-slate-400">├── Area Bounding Box Determination (Radius / km²)</div>
          <div className="text-cyan-400 font-bold">DEM & GIS PIPELINE</div>
          <div className="text-slate-400">├── Digital Elevation Model Query (SRTM / Copernicus / Local GeoTIFF)</div>
          <div className="text-slate-400">├── Resampling & No-Data Interpolation (128x128 Grid)</div>
          <div className="text-slate-400">├── Horn's Algorithm (Slope & Aspect Computation)</div>
          <div className="text-slate-400">├── Topographic Statistics & Contours Calculation</div>
          <div className="text-cyan-400 font-bold">3D GRAPHICS & THREE.JS</div>
          <div className="text-slate-400">├── BufferGeometry Triangulation (Vertices, Normals, UVs)</div>
          <div className="text-slate-400">├── Hypsometric Colormap Shaders (Earth, Viridis, Magma, Thermal)</div>
          <div className="text-slate-400">└── Interactive Viewport (OrbitControls, Point Raycasting, Δh Laser Beacons)</div>
        </div>
      </div>

      {/* 4. Tech Stack */}
      <div className="p-6 rounded-2xl bg-[#0d121f] border border-slate-800/80 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Code2 className="w-5 h-5 text-cyan-400" />
          Technology Stack
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-cyan-400 font-bold block font-mono">FRONTEND</span>
            <div className="text-slate-200">React 18 + TypeScript</div>
            <div className="text-slate-400">Vite + Tailwind CSS</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-blue-400 font-bold block font-mono">3D RENDERING</span>
            <div className="text-slate-200">Three.js</div>
            <div className="text-slate-400">React Three Fiber + Drei</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-emerald-400 font-bold block font-mono">BACKEND API</span>
            <div className="text-slate-200">Python 3.11 + FastAPI</div>
            <div className="text-slate-400">Uvicorn + Pydantic</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
            <span className="text-purple-400 font-bold block font-mono">GIS & CV</span>
            <div className="text-slate-200">Rasterio + SciPy + NumPy</div>
            <div className="text-slate-400">OpenCV + Trimesh</div>
          </div>
        </div>
      </div>

    </div>
  );
};
