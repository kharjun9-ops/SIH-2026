import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Html } from '@react-three/drei';
import * as THREE from 'three';
import { DepthPipelineResponse } from '../../types';
import { resolveAssetUrl } from '../../services/api';
import {
  RotateCcw,
  Video,
  Pause,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  Mountain,
  Eye
} from 'lucide-react';

interface DepthViewer3DProps {
  pipelineResult: DepthPipelineResponse;
  exaggeration?: number;
  showTexture?: boolean;
  showWireframe?: boolean;
  colorMode?: 'texture' | 'elevation' | 'slope' | 'depth';
}

// ─── Elevation Colormap ──────────────────────────────────────────────────────

function getElevationColor(t: number): THREE.Color {
  // Turbo-inspired colormap
  const r = Math.max(0, Math.min(1, 0.135 + t * (5.19 - t * (18.39 - t * (27.72 - t * 14.78)))));
  const g = Math.max(0, Math.min(1, 0.0 + t * (2.89 - t * (5.84 - t * (3.95)))));
  const b = Math.max(0, Math.min(1, 0.533 + t * (-3.71 + t * (11.39 - t * (16.67 - t * 8.48)))));
  return new THREE.Color(r, g, b);
}

// ─── Terrain Mesh Component ─────────────────────────────────────────────────

const DepthTerrainMesh: React.FC<{
  elevationGrid: number[][];
  exaggeration: number;
  textureUrl?: string;
  showTexture: boolean;
  showWireframe: boolean;
  colorMode: string;
  isMetric: boolean;
  elevMin: number;
  elevMax: number;
  slopeGrid?: number[][];
}> = ({
  elevationGrid,
  exaggeration,
  textureUrl,
  showTexture,
  showWireframe,
  colorMode,
  isMetric,
  elevMin,
  elevMax,
  slopeGrid,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  const rows = elevationGrid.length;
  const cols = elevationGrid[0]?.length || 0;

  // Load texture
  useEffect(() => {
    if (textureUrl && showTexture && colorMode === 'texture') {
      const resolved = resolveAssetUrl(textureUrl);
      if (resolved) {
        const loader = new THREE.TextureLoader();
        loader.load(
          resolved,
          (tex) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            setTexture(tex);
          },
          undefined,
          () => setTexture(null)
        );
      }
    }
  }, [textureUrl, showTexture, colorMode]);

  const geometry = useMemo(() => {
    if (rows < 2 || cols < 2) return new THREE.PlaneGeometry(1, 1);

    const size = 10; // Normalized world size
    const geo = new THREE.PlaneGeometry(size, size, cols - 1, rows - 1);
    const positions = geo.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const uvs = geo.attributes.uv;

    const range = Math.max(elevMax - elevMin, 0.001);
    const heightScale = isMetric ? (size / Math.max(range, 1)) * 0.3 : size * 0.3;

    for (let i = 0; i < positions.count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const elev = elevationGrid[row]?.[col] ?? 0;
      const normalizedElev = (elev - elevMin) / range;

      // Set Y (height) based on elevation
      positions.setY(i, normalizedElev * heightScale * exaggeration);

      // Set vertex colors based on mode
      let color: THREE.Color;
      if (colorMode === 'slope' && slopeGrid) {
        const slopeVal = Math.min((slopeGrid[row]?.[col] ?? 0) / 60.0, 1.0);
        color = new THREE.Color().setHSL(0.33 - slopeVal * 0.33, 0.8, 0.35 + slopeVal * 0.3);
      } else if (colorMode === 'depth' || colorMode === 'elevation') {
        color = getElevationColor(normalizedElev);
      } else {
        color = new THREE.Color(1, 1, 1);
      }

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      // Fix UVs for proper texture mapping
      if (uvs) {
        uvs.setXY(i, col / (cols - 1), 1.0 - row / (rows - 1));
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    positions.needsUpdate = true;

    return geo;
  }, [elevationGrid, exaggeration, colorMode, isMetric, elevMin, elevMax, slopeGrid, rows, cols]);

  const material = useMemo(() => {
    if (colorMode === 'texture' && texture) {
      return new THREE.MeshStandardMaterial({
        map: texture,
        wireframe: showWireframe,
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      wireframe: showWireframe,
      roughness: 0.7,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
  }, [texture, colorMode, showWireframe]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      castShadow
      receiveShadow
    />
  );
};

// ─── Flythrough Camera Animation ─────────────────────────────────────────────

const FlythroughCamera: React.FC<{ active: boolean; speed?: number }> = ({
  active,
  speed = 0.15,
}) => {
  const { camera } = useThree();
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!active) return;
    timeRef.current += delta * speed;
    const t = timeRef.current;

    const radius = 8;
    const x = Math.sin(t * 0.4) * radius;
    const z = Math.cos(t * 0.4) * radius;
    const y = 4 + Math.sin(t * 0.2) * 2;

    camera.position.set(x, y, z);
    camera.lookAt(0, 0.5, 0);
  });

  return null;
};

// ─── Main 3D Viewer Component ────────────────────────────────────────────────

export const DepthViewer3D: React.FC<DepthViewer3DProps> = ({
  pipelineResult,
  exaggeration: extExaggeration,
  showTexture: extShowTexture,
  showWireframe: extShowWireframe,
  colorMode: extColorMode,
}) => {
  const [exaggeration, setExaggeration] = useState(extExaggeration ?? 1.5);
  const [showTexture, setShowTexture] = useState(extShowTexture ?? true);
  const [showWireframe, setShowWireframe] = useState(extShowWireframe ?? false);
  const [colorMode, setColorMode] = useState<string>(extColorMode ?? 'texture');
  const [isFlythrough, setIsFlythrough] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    elevation_grid,
    slope_grid,
    elevation_min,
    elevation_max,
    texture_url,
    dsm_type,
    dsm_label,
    depth_model_used,
    calibration,
    grid_resolution,
    mesh_vertex_count,
    mesh_face_count,
    elevation_unit,
  } = pipelineResult;

  const isMetric = dsm_type === 'METRIC';

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  // Sync external prop changes
  useEffect(() => { if (extExaggeration !== undefined) setExaggeration(extExaggeration); }, [extExaggeration]);
  useEffect(() => { if (extShowTexture !== undefined) setShowTexture(extShowTexture); }, [extShowTexture]);
  useEffect(() => { if (extShowWireframe !== undefined) setShowWireframe(extShowWireframe); }, [extShowWireframe]);
  useEffect(() => { if (extColorMode !== undefined) setColorMode(extColorMode); }, [extColorMode]);

  return (
    <div ref={containerRef} className="relative rounded-2xl overflow-hidden border border-slate-700/80 bg-[#06080e]">
      
      {/* 3D Canvas */}
      <div className="h-[520px] w-full">
        <Canvas shadows dpr={[1, 2]}>
          <PerspectiveCamera makeDefault position={[8, 6, 8]} fov={50} />
          
          {/* Lighting */}
          <ambientLight intensity={0.35} />
          <directionalLight
            position={[10, 15, 8]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <directionalLight position={[-5, 8, -5]} intensity={0.4} />
          <hemisphereLight
            args={[new THREE.Color('#87CEEB'), new THREE.Color('#2d1f0e'), 0.3]}
          />
          
          {/* Terrain Mesh */}
          <DepthTerrainMesh
            elevationGrid={elevation_grid}
            exaggeration={exaggeration}
            textureUrl={texture_url}
            showTexture={showTexture}
            showWireframe={showWireframe}
            colorMode={colorMode}
            isMetric={isMetric}
            elevMin={elevation_min}
            elevMax={elevation_max}
            slopeGrid={slope_grid}
          />
          
          {/* Ground grid */}
          <gridHelper args={[12, 24, '#1e293b', '#0f172a']} position={[0, -0.01, 0]} />
          
          {/* Controls */}
          {!isFlythrough && (
            <OrbitControls
              enableDamping
              dampingFactor={0.08}
              minDistance={3}
              maxDistance={25}
              maxPolarAngle={Math.PI * 0.45}
              target={[0, 0.5, 0]}
            />
          )}
          
          <FlythroughCamera active={isFlythrough} speed={0.15} />
        </Canvas>
      </div>

      {/* DSM Type Badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold font-mono shadow-lg backdrop-blur-sm ${
          isMetric
            ? 'bg-emerald-500/90 text-slate-950 border border-emerald-400/60'
            : 'bg-amber-500/90 text-slate-950 border border-amber-400/60'
        }`}>
          {dsm_type === 'METRIC' ? '📐 METRIC DSM' : '📊 RELATIVE DSM (rDSM)'}
        </span>
        <span className="px-2 py-1 bg-slate-900/80 backdrop-blur-sm text-[10px] font-mono text-cyan-300 rounded-lg border border-slate-700/60">
          {depth_model_used}
        </span>
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
        
        {/* Left: View controls */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700/60">
          {(['texture', 'elevation', 'slope', 'depth'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                colorMode === mode
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {mode === 'texture' ? '🖼️ RGB' : mode === 'elevation' ? '🏔️ Elevation' : mode === 'slope' ? '📐 Slope' : '🌊 Depth'}
            </button>
          ))}
          
          <div className="w-px h-5 bg-slate-700 mx-1" />
          
          <button
            onClick={() => setShowWireframe(!showWireframe)}
            className={`p-1.5 rounded-lg text-[10px] transition-all ${
              showWireframe ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle wireframe"
          >
            <Move className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {/* Right: Camera controls */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700/60">
          <button
            onClick={() => setIsFlythrough(!isFlythrough)}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-all ${
              isFlythrough
                ? 'bg-rose-500 text-white shadow-sm'
                : 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
            }`}
          >
            {isFlythrough ? <Pause className="w-3 h-3" /> : <Video className="w-3 h-3" />}
            {isFlythrough ? 'Stop' : 'Fly'}
          </button>
          
          {/* Exaggeration slider */}
          <div className="flex items-center gap-1.5 px-2">
            <Mountain className="w-3 h-3 text-slate-400" />
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={exaggeration}
              onChange={(e) => setExaggeration(parseFloat(e.target.value))}
              className="w-20 h-1 accent-cyan-400"
              title={`Vertical exaggeration: ${exaggeration.toFixed(1)}×`}
            />
            <span className="text-[10px] text-slate-400 font-mono w-7">{exaggeration.toFixed(1)}×</span>
          </div>
          
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Toggle fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {/* Mesh stats badge */}
      <div className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-700/60 text-[9px] font-mono text-slate-400">
        {mesh_vertex_count.toLocaleString()} verts · {mesh_face_count.toLocaleString()} faces · {grid_resolution}×{grid_resolution}
      </div>
    </div>
  );
};
