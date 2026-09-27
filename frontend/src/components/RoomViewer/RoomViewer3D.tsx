import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { RoomReconstructResponse, RoomDimensionCallout } from '../../types';
import {
  RotateCcw,
  Maximize2,
  Eye,
  Ruler,
  Compass,
  Layers,
  Box,
  LayoutGrid,
  CheckCircle2,
  X,
  Sparkles,
  Smartphone
} from 'lucide-react';
import { CameraPath3D } from './CameraPath3D';

interface RoomViewer3DProps {
  roomData: RoomReconstructResponse;
  unit?: 'metric' | 'imperial';
}

// ─── 3D Dimension Vector Component ─────────────────────────────────────────

const DimensionLine3D: React.FC<{
  callout: RoomDimensionCallout;
  unit: 'metric' | 'imperial';
}> = ({ callout, unit }) => {
  const start = new THREE.Vector3(...callout.start_pos);
  const end = new THREE.Vector3(...callout.end_pos);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  const points = useMemo(() => [start, end], [start, end]);

  return (
    <group>
      {/* Dimension Line */}
      <Line
        points={points}
        color={callout.color}
        lineWidth={3}
        dashed={false}
      />
      {/* End Caps */}
      <mesh position={start}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color={callout.color} />
      </mesh>
      <mesh position={end}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial color={callout.color} />
      </mesh>
      {/* Floating 3D Label */}
      <Html position={[mid.x, mid.y, mid.z + 0.08]} center distanceFactor={8} zIndexRange={[100, 0]}>
        <div
          className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white shadow-lg pointer-events-none select-none border backdrop-blur-md whitespace-nowrap"
          style={{
            backgroundColor: `${callout.color}33`,
            borderColor: callout.color,
            color: '#f8fafc',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)'
          }}
        >
          {callout.label}
        </div>
      </Html>
    </group>
  );
};

// ─── Interactive Measurement Tool ──────────────────────────────────────────

const InteractiveMeasureRuler: React.FC<{
  points: THREE.Vector3[];
  onAddPoint: (pt: THREE.Vector3) => void;
  unit: 'metric' | 'imperial';
}> = ({ points, onAddPoint, unit }) => {
  if (points.length < 2) {
    return points.length === 1 ? (
      <mesh position={points[0]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#f43f5e" />
      </mesh>
    ) : null;
  }

  const p1 = points[0];
  const p2 = points[1];
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const distM = p1.distanceTo(p2);
  const distFt = distM * 3.28084;
  const label = unit === 'metric' ? `${distM.toFixed(2)} m` : `${distFt.toFixed(2)} ft`;

  return (
    <group>
      <Line points={[p1, p2]} color="#f43f5e" lineWidth={4} />
      <mesh position={p1}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#f43f5e" />
      </mesh>
      <mesh position={p2}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#f43f5e" />
      </mesh>
      <Html position={[mid.x, mid.y, mid.z + 0.1]} center distanceFactor={8}>
        <div className="px-2 py-1 rounded bg-rose-600/90 text-white font-mono text-xs font-bold border border-rose-300 shadow-xl whitespace-nowrap">
          📏 Measure: {label}
        </div>
      </Html>
    </group>
  );
};

// ─── Room 3D Mesh Component ────────────────────────────────────────────────

const RoomMeshScene: React.FC<{
  roomData: RoomReconstructResponse;
  viewMode: 'mesh' | 'dollhouse' | 'interior' | 'wireframe' | 'pointcloud';
  showDimensions: boolean;
  showCameraPath: boolean;
  unit: 'metric' | 'imperial';
  measureMode: boolean;
  measurePoints: THREE.Vector3[];
  onMeasureClick: (pt: THREE.Vector3) => void;
}> = ({
  roomData,
  viewMode,
  showDimensions,
  showCameraPath,
  unit,
  measureMode,
  measurePoints,
  onMeasureClick
}) => {
  const { dimensions, dimension_callouts, points_3d, mesh_vertices, mesh_indices, camera_trajectory } = roomData;
  const hw = dimensions.width_m / 2.0;
  const hl = dimensions.length_m / 2.0;
  const h = dimensions.height_m;

  const handlePointerDown = (e: any) => {
    if (measureMode) {
      e.stopPropagation();
      onMeasureClick(e.point.clone());
    }
  };

  // Convert points_3d into buffer geometry
  const pointCloudGeo = useMemo(() => {
    if (!points_3d || points_3d.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(points_3d.length * 3);
    const col = new Float32Array(points_3d.length * 3);

    for (let i = 0; i < points_3d.length; i++) {
      const p = points_3d[i];
      pos[i * 3] = p[0];
      pos[i * 3 + 1] = p[1];
      pos[i * 3 + 2] = p[2];

      col[i * 3] = p[3] ?? 0.4;
      col[i * 3 + 1] = p[4] ?? 0.6;
      col[i * 3 + 2] = p[5] ?? 0.8;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }, [points_3d]);

  // Convert reconstructed surface mesh into BufferGeometry
  const reconstructedMeshGeo = useMemo(() => {
    if (!mesh_vertices || mesh_vertices.length === 0) return null;
    if (!mesh_indices || mesh_indices.length === 0) return null;

    try {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(mesh_vertices.flat());
      const idx = new Uint32Array(mesh_indices.flat());

      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals();
      return geo;
    } catch (err) {
      console.warn('Failed to parse reconstructed mesh geometry:', err);
      return null;
    }
  }, [mesh_vertices, mesh_indices]);

  const hasMesh = !!reconstructedMeshGeo;

  return (
    <group onPointerDown={handlePointerDown}>
      {/* 1. Point Cloud Mode */}
      {viewMode === 'pointcloud' && pointCloudGeo && (
        <points geometry={pointCloudGeo}>
          <pointsMaterial size={0.05} vertexColors sizeAttenuation />
        </points>
      )}

      {/* 2. Reconstructed Surface Mesh Mode */}
      {viewMode === 'mesh' && hasMesh && (
        <group>
          <mesh geometry={reconstructedMeshGeo} castShadow receiveShadow>
            <meshStandardMaterial
              color="#64748b"
              roughness={0.65}
              metalness={0.15}
              side={THREE.DoubleSide}
            />
          </mesh>
          <gridHelper
            args={[
              Math.max(dimensions.width_m, dimensions.length_m) * 1.4,
              Math.round(Math.max(dimensions.width_m, dimensions.length_m)),
              '#38bdf8',
              '#1e293b'
            ]}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.005]}
          />
        </group>
      )}

      {/* 3. Solid / Wireframe / Dollhouse Room Structure */}
      {(viewMode !== 'pointcloud' && (!hasMesh || viewMode !== 'mesh')) && (
        <group>
          {/* Floor Plane */}
          <mesh position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[dimensions.width_m, dimensions.length_m]} />
            <meshStandardMaterial
              color="#2a2520"
              roughness={0.6}
              metalness={0.1}
              wireframe={viewMode === 'wireframe'}
            />
          </mesh>

          {/* Floor Tile Grid Line Overlay */}
          <gridHelper
            args={[
              Math.max(dimensions.width_m, dimensions.length_m) * 1.2,
              Math.round(Math.max(dimensions.width_m, dimensions.length_m)),
              '#38bdf8',
              '#1e293b'
            ]}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, 0.005]}
          />

          {/* South Wall (Front - semi-transparent in dollhouse mode so user sees inside) */}
          <mesh position={[0, -hl, h / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[dimensions.width_m, h]} />
            <meshStandardMaterial
              color="#334155"
              roughness={0.8}
              transparent={viewMode === 'dollhouse'}
              opacity={viewMode === 'dollhouse' ? 0.25 : 0.95}
              wireframe={viewMode === 'wireframe'}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* North Wall (Back) */}
          <mesh position={[0, hl, h / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[dimensions.width_m, h]} />
            <meshStandardMaterial
              color="#1e293b"
              roughness={0.8}
              wireframe={viewMode === 'wireframe'}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* West Wall (Left) */}
          <mesh position={[-hw, 0, h / 2]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[h, dimensions.length_m]} />
            <meshStandardMaterial
              color="#1e293b"
              roughness={0.8}
              wireframe={viewMode === 'wireframe'}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* East Wall (Right) */}
          <mesh position={[hw, 0, h / 2]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[h, dimensions.length_m]} />
            <meshStandardMaterial
              color="#334155"
              roughness={0.8}
              wireframe={viewMode === 'wireframe'}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Ceiling (only visible in interior / wireframe view) */}
          {viewMode !== 'dollhouse' && (
            <mesh position={[0, 0, h]} rotation={[Math.PI, 0, 0]}>
              <planeGeometry args={[dimensions.width_m, dimensions.length_m]} />
              <meshStandardMaterial
                color="#0f172a"
                roughness={0.9}
                wireframe={viewMode === 'wireframe'}
                side={THREE.DoubleSide}
              />
            </mesh>
          )}

          {/* Bounding Box Wireframe Skeleton */}
          <lineSegments>
            <edgesGeometry
              args={[
                new THREE.BoxGeometry(
                  dimensions.width_m,
                  dimensions.length_m,
                  dimensions.height_m
                )
              ]}
            />
            <lineBasicMaterial color="#38bdf8" linewidth={2} />
          </lineSegments>
        </group>
      )}

      {/* 4. Camera Trajectory Path & Frustums */}
      {showCameraPath && camera_trajectory && camera_trajectory.length > 0 && (
        <CameraPath3D trajectory={camera_trajectory} />
      )}

      {/* 3. Dimension Lines & Callout Arrows */}
      {showDimensions &&
        dimension_callouts.map((callout, idx) => (
          <DimensionLine3D key={idx} callout={callout} unit={unit} />
        ))}

      {/* 4. Interactive Measurement Line */}
      {measureMode && (
        <InteractiveMeasureRuler
          points={measurePoints}
          onAddPoint={onMeasureClick}
          unit={unit}
        />
      )}
    </group>
  );
};

// ─── Main RoomViewer3D Component ───────────────────────────────────────────

export const RoomViewer3D: React.FC<RoomViewer3DProps> = ({
  roomData,
  unit = 'metric'
}) => {
  const hasReconstructedMesh = Boolean(roomData.mesh_vertices && roomData.mesh_vertices.length > 0);
  const [viewMode, setViewMode] = useState<'mesh' | 'dollhouse' | 'interior' | 'wireframe' | 'pointcloud'>(
    hasReconstructedMesh ? 'mesh' : 'dollhouse'
  );
  const [showDimensions, setShowDimensions] = useState(true);
  const [showCameraPath, setShowCameraPath] = useState(true);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);
  const [activeTab, setActiveTab] = useState<'3d' | 'floorplan'>('3d');

  const controlsRef = useRef<any>(null);

  const resetCamera = useCallback(() => {
    if (controlsRef.current) {
      if (viewMode === 'interior') {
        controlsRef.current.target.set(0, 0, 1.4);
        controlsRef.current.object.position.set(0, -0.5, 1.4);
      } else {
        controlsRef.current.target.set(0, 0, roomData.dimensions.height_m / 2);
        controlsRef.current.object.position.set(
          roomData.dimensions.width_m * 1.5,
          -roomData.dimensions.length_m * 1.5,
          roomData.dimensions.height_m * 1.8
        );
      }
      controlsRef.current.update();
    }
  }, [viewMode, roomData]);

  useEffect(() => {
    resetCamera();
  }, [viewMode, resetCamera]);

  const handleMeasureClick = (pt: THREE.Vector3) => {
    if (measurePoints.length >= 2) {
      setMeasurePoints([pt]);
    } else {
      setMeasurePoints((prev) => [...prev, pt]);
    }
  };

  const clearMeasure = () => {
    setMeasurePoints([]);
    setMeasureMode(false);
  };

  const { dimensions } = roomData;

  return (
    <div className="relative w-full h-[540px] sm:h-[620px] rounded-2xl overflow-hidden border border-slate-800 bg-[#070b14] shadow-2xl flex flex-col">
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: View Mode Toggles */}
        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 pointer-events-auto shadow-lg">
          <button
            onClick={() => setActiveTab('3d')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === '3d'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D Model</span>
          </button>

          <button
            onClick={() => setActiveTab('floorplan')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'floorplan'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Floor Plan 2D</span>
          </button>
        </div>

        {/* Center: 3D View Angles */}
        {activeTab === '3d' && (
          <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 pointer-events-auto shadow-lg overflow-x-auto max-w-full">
            {hasReconstructedMesh && (
              <button
                onClick={() => setViewMode('mesh')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'mesh'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Mesh
              </button>
            )}
            <button
              onClick={() => setViewMode('dollhouse')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'dollhouse'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Dollhouse
            </button>
            <button
              onClick={() => setViewMode('interior')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'interior'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Interior
            </button>
            <button
              onClick={() => setViewMode('wireframe')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'wireframe'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Wireframe
            </button>
            <button
              onClick={() => setViewMode('pointcloud')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'pointcloud'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Points ({roomData.points_3d?.length ?? 0})
            </button>
          </div>
        )}

        {/* Right: Tools & Actions */}
        <div className="flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800 pointer-events-auto shadow-lg">
          {roomData.camera_trajectory && roomData.camera_trajectory.length > 0 && (
            <button
              onClick={() => setShowCameraPath(!showCameraPath)}
              title="Toggle Camera Trajectory Path"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                showCameraPath
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Path</span>
            </button>
          )}

          <button
            onClick={() => setShowDimensions(!showDimensions)}
            title="Toggle 3D Dimension Rulers"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              showDimensions
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rulers</span>
          </button>

          <button
            onClick={() => {
              setMeasureMode(!measureMode);
              if (measureMode) setMeasurePoints([]);
            }}
            title="Interactive Point-to-Point Measurement"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
              measureMode
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{measureMode ? 'Measuring...' : 'Tape Measure'}</span>
          </button>

          <button
            onClick={resetCamera}
            title="Reset View"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Measurement Mode Helper Banner */}
      {measureMode && activeTab === '3d' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-rose-950/90 border border-rose-500/40 text-rose-200 px-4 py-1.5 rounded-full text-xs font-medium backdrop-blur-md shadow-xl flex items-center gap-2">
          <span>Click Point 1 on any wall or floor, then click Point 2 to measure distance.</span>
          <button onClick={clearMeasure} className="p-0.5 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === '3d' ? (
        <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing">
          <Canvas
            shadows
            camera={{
              position: [
                dimensions.width_m * 1.4,
                -dimensions.length_m * 1.4,
                dimensions.height_m * 1.6
              ],
              fov: 50,
              near: 0.1,
              far: 100
            }}
          >
            <ambientLight intensity={0.9} />
            <directionalLight
              position={[5, 8, 10]}
              intensity={1.2}
              castShadow
              shadow-mapSize-width={1024}
              shadow-mapSize-height={1024}
            />
            <pointLight position={[0, 0, dimensions.height_m - 0.2]} intensity={0.8} color="#fef08a" />

            <RoomMeshScene
              roomData={roomData}
              viewMode={viewMode}
              showDimensions={showDimensions}
              showCameraPath={showCameraPath}
              unit={unit}
              measureMode={measureMode}
              measurePoints={measurePoints}
              onMeasureClick={handleMeasureClick}
            />

            <OrbitControls
              ref={controlsRef}
              enableDamping
              dampingFactor={0.08}
              maxPolarAngle={viewMode === 'interior' ? Math.PI : Math.PI / 2 + 0.1}
              minDistance={0.5}
              maxDistance={35}
            />
          </Canvas>
        </div>
      ) : (
        /* 2D Architectural Floor Plan Schematic */
        <div className="flex-1 w-full h-full p-6 flex flex-col items-center justify-center bg-[#060a12]">
          <div className="relative w-full max-w-lg aspect-[4/3] bg-slate-950 border-2 border-cyan-500/40 rounded-xl p-6 shadow-2xl flex flex-col justify-between">
            {/* Top / North */}
            <div className="text-center font-mono text-xs text-cyan-400 font-bold border-b border-dashed border-cyan-500/30 pb-2 flex items-center justify-center gap-2">
              <span>NORTH WALL &mdash; {unit === 'metric' ? `${dimensions.width_m} m` : `${dimensions.width_ft} ft`}</span>
            </div>

            {/* Room Center Info */}
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-2">
                <Box className="w-6 h-6" />
              </div>
              <span className="text-lg font-extrabold text-white">{roomData.room_name}</span>
              <span className="text-xs text-slate-400 mt-1">
                {unit === 'metric'
                  ? `${dimensions.length_m} m × ${dimensions.width_m} m × ${dimensions.height_m} m`
                  : `${dimensions.length_ft} ft × ${dimensions.width_ft} ft × ${dimensions.height_ft} ft`}
              </span>
              <div className="mt-3 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold">
                Floor Area: {unit === 'metric' ? `${dimensions.floor_area_sqm} m²` : `${dimensions.floor_area_sqft} sq ft`}
              </div>
            </div>

            {/* Bottom / South */}
            <div className="text-center font-mono text-xs text-cyan-400 font-bold border-t border-dashed border-cyan-500/30 pt-2">
              <span>SOUTH WALL &mdash; {unit === 'metric' ? `${dimensions.width_m} m` : `${dimensions.width_ft} ft`}</span>
            </div>

            {/* Left Dimension Label */}
            <div className="absolute left-2 top-1/2 -translate-y-1/2 -rotate-90 origin-center font-mono text-[11px] text-violet-400 font-bold">
              WEST &mdash; {unit === 'metric' ? `${dimensions.length_m} m` : `${dimensions.length_ft} ft`}
            </div>

            {/* Right Dimension Label */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 origin-center font-mono text-[11px] text-violet-400 font-bold">
              EAST &mdash; {unit === 'metric' ? `${dimensions.length_m} m` : `${dimensions.length_ft} ft`}
            </div>
          </div>
          <span className="text-xs text-slate-500 font-mono mt-3">2D Top-Down CAD Blueprint &bull; Scale 1:1 Metric Projection</span>
        </div>
      )}

      {/* Bottom Information Footer with Photogrammetric SfM Stats */}
      <div className="absolute bottom-2 left-3 right-3 z-10 flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 bg-slate-950/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-semibold">1:1 Metric Scale</span>
          </div>
          {roomData.registered_cameras_count !== undefined && (
            <>
              <span>&bull;</span>
              <span>Cams: <strong className="text-cyan-300">{roomData.registered_cameras_count}</strong></span>
            </>
          )}
          <span>&bull;</span>
          <span>Points: <strong className="text-cyan-300">{(roomData.dense_point_count || roomData.sparse_point_count || roomData.points_3d?.length || 0).toLocaleString()}</strong></span>
          {roomData.reprojection_error_px != null && (
            <>
              <span>&bull;</span>
              <span>Reproj Err: <strong className="text-amber-300">{roomData.reprojection_error_px.toFixed(2)}px</strong></span>
            </>
          )}
          {roomData.scale_source && (
            <>
              <span>&bull;</span>
              <span>Datum: <strong className="text-emerald-300">{roomData.scale_source}</strong></span>
            </>
          )}
          {roomData.loop_closure_detected && (
            <>
              <span>&bull;</span>
              <span className="text-emerald-400 font-semibold">Loop Closed</span>
            </>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 text-slate-500">
          <span>Drag: Rotate</span>
          <span>Right Click: Pan</span>
          <span>Scroll: Zoom</span>
        </div>
      </div>
    </div>
  );
};
