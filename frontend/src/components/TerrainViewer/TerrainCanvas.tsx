import React, { useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import { 
  RotateCcw, 
  Compass, 
  Sun, 
  Grid as GridIcon, 
  Maximize2, 
  MapPin, 
  Ruler, 
  Eye, 
  Download,
  Crosshair,
  Layers,
  ArrowUp,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { 
  TerrainReconstructResponse, 
  VisualMode, 
  ColormapMode, 
  InteractionTool, 
  PointInspection, 
  TwoPointMeasurementResponse,
  PointValidation 
} from '../../types';
import { TerrainMesh } from './TerrainMesh';
import { MeasurementPins } from './MeasurementPins';
import { EnvironmentManager } from '../Environment/EnvironmentManager';
import { api } from '../../services/api';

interface TerrainCanvasProps {
  terrainData: TerrainReconstructResponse;
  exaggeration: number;
  visualMode: VisualMode;
  colormap: ColormapMode;
  showWireframe: boolean;
  showSatelliteTexture: boolean;
  showContours?: boolean;
  showGrid: boolean;
  activeTool: InteractionTool;
  onToolChange: (tool: InteractionTool) => void;
  selectedPoint: PointInspection | null;
  onSelectPoint: (pt: PointInspection | null) => void;
  pointAPos: THREE.Vector3 | null;
  pointAData: PointInspection | null;
  pointBPos: THREE.Vector3 | null;
  pointBData: PointInspection | null;
  measurement: TwoPointMeasurementResponse | null;
  onSetMeasurementPoints: (
    ptA: PointInspection | null, 
    posA: THREE.Vector3 | null, 
    ptB: PointInspection | null, 
    posB: THREE.Vector3 | null,
    meas: TwoPointMeasurementResponse | null
  ) => void;
  pointValidation?: PointValidation | null;
  onSetPointValidation?: (val: PointValidation | null) => void;
  onOpenAccuracyModal?: () => void;
  onOpenProfileModal?: () => void;
  environmentData?: any;
  layerVisibility?: { buildings: boolean; roads: boolean; water: boolean; landmarks: boolean };
  colorBySource?: boolean;
  onBuildingClick?: (building: any) => void;
  onRoadClick?: (road: any) => void;
  onWaterClick?: (water: any) => void;
}

// 3D North Compass Indicator Widget Component
const NorthIndicator: React.FC<{ terrainWidthM: number }> = ({ terrainWidthM }) => {
  const pos = useMemo(() => {
    return new THREE.Vector3(-terrainWidthM * 0.45, 10, -terrainWidthM * 0.45);
  }, [terrainWidthM]);

  return (
    <group position={pos}>
      <mesh position={[0, 0, -terrainWidthM * 0.04]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[terrainWidthM * 0.015, terrainWidthM * 0.04, 16]} />
        <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[terrainWidthM * 0.004, terrainWidthM * 0.004, terrainWidthM * 0.05, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <Html position={[0, terrainWidthM * 0.02, -terrainWidthM * 0.06]} center>
        <div className="bg-slate-950/90 border border-rose-500/80 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold text-rose-400 shadow-xl pointer-events-none flex items-center gap-1">
          <ArrowUp className="w-3 h-3 text-rose-400" />
          <span>TRUE NORTH</span>
        </div>
      </Html>
    </group>
  );
};

// 3D Metric Scale Bar Component
const MetricScaleBar: React.FC<{ terrainWidthM: number }> = ({ terrainWidthM }) => {
  const scaleLengthM = useMemo(() => {
    if (terrainWidthM >= 20000) return 5000;
    if (terrainWidthM >= 10000) return 2000;
    if (terrainWidthM >= 4000) return 1000;
    return 500;
  }, [terrainWidthM]);

  const pos = useMemo(() => {
    return new THREE.Vector3(terrainWidthM * 0.45 - scaleLengthM / 2.0, 5, terrainWidthM * 0.45);
  }, [terrainWidthM, scaleLengthM]);

  return (
    <group position={pos}>
      <mesh position={[-scaleLengthM / 4.0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[terrainWidthM * 0.003, terrainWidthM * 0.003, scaleLengthM / 2.0, 8]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[scaleLengthM / 4.0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[terrainWidthM * 0.003, terrainWidthM * 0.003, scaleLengthM / 2.0, 8]} />
        <meshBasicMaterial color="#00e5ff" />
      </mesh>
      <Html position={[0, terrainWidthM * 0.02, 0]} center>
        <div className="bg-slate-950/90 border border-cyan-400/80 px-2.5 py-0.5 rounded-md font-mono text-[11px] font-bold text-cyan-300 shadow-xl pointer-events-none whitespace-nowrap">
          {scaleLengthM >= 1000 ? `${scaleLengthM / 1000} km Scale` : `${scaleLengthM} m Scale`}
        </div>
      </Html>
    </group>
  );
};

export const TerrainCanvas: React.FC<TerrainCanvasProps> = ({
  terrainData,
  exaggeration = 1.0,
  visualMode = 'elevation',
  colormap,
  showWireframe,
  showSatelliteTexture,
  showContours = false,
  showGrid,
  activeTool,
  onToolChange,
  selectedPoint,
  onSelectPoint,
  pointAPos,
  pointAData,
  pointBPos,
  pointBData,
  measurement,
  onSetMeasurementPoints,
  pointValidation,
  onSetPointValidation,
  onOpenAccuracyModal,
  onOpenProfileModal,
  environmentData,
  layerVisibility,
  colorBySource = true,
  onBuildingClick,
  onRoadClick,
  onWaterClick,
}) => {
  const controlsRef = useRef<any>(null);
  const [selectedPointPos, setSelectedPointPos] = useState<THREE.Vector3 | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const metricWidth = terrainData.metric_bounds.width_m;
  const metricHeight = terrainData.metric_bounds.height_m;
  const maxDimension = Math.max(metricWidth, metricHeight);

  const cameraInitialPos: [number, number, number] = [
    0,
    maxDimension * 0.55,
    maxDimension * 0.85
  ];

  const handlePointClick = async (inspection: PointInspection, worldPos: THREE.Vector3) => {
    if (activeTool === 'inspect') {
      onSelectPoint(inspection);
      setSelectedPointPos(worldPos);

      try {
        const fullInsp = await api.inspectPoint(
          inspection.latitude,
          inspection.longitude,
          inspection.mesh_elevation_m,
          terrainData.bounds
        );
        if (fullInsp) {
          onSelectPoint(fullInsp);
        }
      } catch (err) {
        console.warn('Authoritative inspectPoint backend query:', err);
      }

      if (onSetPointValidation) {
        try {
          const valRes = await api.validatePoint(inspection.latitude, inspection.longitude, inspection.elevation);
          onSetPointValidation(valRes);
        } catch {
          onSetPointValidation(null);
        }
      }
    } else if (activeTool === 'measure') {
      if (!pointAData || (pointAData && pointBData)) {
        onSetMeasurementPoints(inspection, worldPos, null, null, null);
      } else if (pointAData && !pointBData) {
        try {
          const measRes = await api.measurePoints(
            pointAData.latitude, pointAData.longitude,
            inspection.latitude, inspection.longitude,
            terrainData.bounds
          );
          onSetMeasurementPoints(pointAData, pointAPos, inspection, worldPos, measRes);
        } catch {
          const dH = Number((inspection.elevation - pointAData.elevation).toFixed(2));
          const midLat = ((pointAData.latitude + inspection.latitude) / 2.0) * (Math.PI / 180);
          const dx = (inspection.longitude - pointAData.longitude) * 111320.0 * Math.cos(midLat);
          const dz = (inspection.latitude - pointAData.latitude) * 111320.0;
          const hDist = Number(Math.max(0.1, Math.sqrt(dx**2 + dz**2)).toFixed(2));
          const d3D = Number(Math.sqrt(hDist**2 + dH**2).toFixed(2));
          const slopeDeg = Number((Math.atan2(Math.abs(dH), hDist) * (180.0 / Math.PI)).toFixed(2));
          const gradePct = Number(((Math.abs(dH) / hDist) * 100.0).toFixed(2));
          const dir = dH > 0.05 ? 'Ascending' : dH < -0.05 ? 'Descending' : 'Flat';

          onSetMeasurementPoints(pointAData, pointAPos, inspection, worldPos, {
            point_a: pointAData,
            point_b: inspection,
            height_difference: dH,
            horizontal_distance: hDist,
            distance_meters: hDist,
            distance_3d: d3D,
            surface_distance_m: d3D,
            slope_percent: gradePct,
            slope_degrees: slopeDeg,
            grade_percent: gradePct,
            direction: dir,
            average_gradient_pct: gradePct,
            total_ascent_m: dH > 0 ? dH : 0,
            total_descent_m: dH < 0 ? Math.abs(dH) : 0,
            min_elevation_m: Math.min(pointAData.elevation, inspection.elevation),
            comparison_text: `Point B is ${Math.abs(dH).toFixed(2)}m ${dH >= 0 ? 'Higher' : 'Lower'} than Point A (${gradePct}% grade)`,
            source: terrainData.provider_used || 'Copernicus DEM GLO-30',
            source_resolution: '~30m',
            vertical_datum_compatible: true,
            vertical_datum: 'EGM96 / EGM2008 Geoid (MSL)',
            elevation_profile: []
          });
        }
      }
    }
  };

  const setCameraView = (type: 'iso' | 'top' | 'side' | 'reset') => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;
    if (type === 'iso') {
      controls.object.position.set(0, maxDimension * 0.6, maxDimension * 0.8);
      controls.target.set(0, 0, 0);
    } else if (type === 'top') {
      controls.object.position.set(0, maxDimension * 1.3, 0.1);
      controls.target.set(0, 0, 0);
    } else if (type === 'side') {
      controls.object.position.set(0, maxDimension * 0.15, maxDimension * 0.9);
      controls.target.set(0, 0, 0);
    } else {
      controls.reset();
    }
    controls.update();
  };

  const handleExport = async (format: 'glb' | 'obj') => {
    setIsExporting(true);
    try {
      const blob = await api.export3DModel(
        {
          sample_id: terrainData.region_name,
          bounds: terrainData.bounds,
          grid_resolution: terrainData.grid_resolution,
        },
        format,
        exaggeration
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terrain_${terrainData.region_name || 'custom'}_metric.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to export 3D model.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[520px] bg-[#070a10] rounded-2xl border border-slate-800/80 overflow-hidden shadow-2xl flex flex-col">
      
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="flex items-center bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl">
          <button
            onClick={() => onToolChange('inspect')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTool === 'inspect'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Point Inspect</span>
          </button>

          <button
            onClick={() => onToolChange('measure')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTool === 'measure'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Two-Point Δh</span>
          </button>
        </div>

        {/* Action Buttons: Accuracy Validation Modal & Terrain Profile */}
        <div className="flex items-center gap-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl text-xs">
          {onOpenAccuracyModal && (
            <button
              onClick={onOpenAccuracyModal}
              className="px-2.5 py-1.5 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-950/50 rounded-lg transition-colors flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Accuracy Report</span>
            </button>
          )}

          {measurement && onOpenProfileModal && (
            <button
              onClick={onOpenProfileModal}
              className="px-2.5 py-1.5 text-cyan-300 hover:text-cyan-200 hover:bg-cyan-950/50 rounded-lg transition-colors flex items-center gap-1 animate-pulse"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Elevation Profile</span>
            </button>
          )}
        </div>

        <div className="hidden sm:flex items-center bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl text-xs">
          <button
            onClick={() => setCameraView('iso')}
            className="px-2.5 py-1.5 text-slate-300 hover:text-cyan-300 hover:bg-slate-800/60 rounded-lg transition-colors"
          >
            Perspective
          </button>
          <button
            onClick={() => setCameraView('top')}
            className="px-2.5 py-1.5 text-slate-300 hover:text-cyan-300 hover:bg-slate-800/60 rounded-lg transition-colors"
          >
            Top-Down
          </button>
          <button
            onClick={() => setCameraView('side')}
            className="px-2.5 py-1.5 text-slate-300 hover:text-cyan-300 hover:bg-slate-800/60 rounded-lg transition-colors"
          >
            Profile
          </button>
          <button
            onClick={() => setCameraView('reset')}
            className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Top Right: True Metric Status & 3D Export */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2 pointer-events-auto">
        <div className="hidden md:flex items-center gap-2 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-slate-300">1:1 Metric ({(metricWidth / 1000).toFixed(1)} × {(metricHeight / 1000).toFixed(1)} km)</span>
        </div>

        <button
          onClick={() => handleExport('glb')}
          disabled={isExporting}
          className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800/90 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-medium backdrop-blur-md shadow-lg flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExporting ? 'Exporting...' : 'Export Metric 3D (.glb)'}</span>
        </button>
      </div>

      {/* Interactive Tool Banner Guide */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        {activeTool === 'inspect' && (
          <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 rounded-xl px-4 py-2 text-xs text-slate-300 shadow-xl flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>Click any 3D vertex to sample true DEM elevation and validate against source raster.</span>
          </div>
        )}
        {activeTool === 'measure' && (
          <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 rounded-xl px-4 py-2 text-xs text-slate-300 shadow-xl flex items-center gap-2">
            <Ruler className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>
              {!pointAData 
                ? "Click on terrain to place Point A (Starting Reference)" 
                : !pointBData 
                ? "Click another point to place Point B (Target Reference)" 
                : "Points set! Click 'Elevation Profile' button above for full cross-section graph."}
            </span>
          </div>
        )}
      </div>

      {/* Main Three.js R3F Canvas Viewport */}
      <div className="w-full h-full flex-1">
        <Canvas
          shadows
          camera={{ 
            position: cameraInitialPos, 
            fov: 42, 
            near: 10, 
            far: maxDimension * 10 
          }}
          gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[maxDimension * 0.8, maxDimension * 1.2, maxDimension * 0.6]}
            intensity={1.5}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={maxDimension * 4}
            shadow-camera-left={-maxDimension * 0.7}
            shadow-camera-right={maxDimension * 0.7}
            shadow-camera-top={maxDimension * 0.7}
            shadow-camera-bottom={-maxDimension * 0.7}
          />
          <directionalLight 
            position={[-maxDimension * 0.6, maxDimension * 0.5, -maxDimension * 0.8]} 
            intensity={0.4} 
            color="#88ccff" 
          />

          <color attach="background" args={['#070a10']} />
          <fog attach="fog" args={['#070a10', maxDimension * 1.2, maxDimension * 3.5]} />
          <Stars radius={maxDimension * 2} depth={maxDimension} count={3000} factor={4} saturation={0} fade speed={1} />

          {/* Metric Spatial Grid */}
          {showGrid && (
            <Grid
              position={[0, -1, 0]}
              args={[maxDimension * 1.4, maxDimension * 1.4]}
              cellSize={Math.max(100, maxDimension / 40.0)}
              cellThickness={0.5}
              cellColor="#1e293b"
              sectionSize={Math.max(500, maxDimension / 10.0)}
              sectionThickness={1.2}
              sectionColor="#00e5ff"
              fadeDistance={maxDimension * 2}
              fadeStrength={1.5}
            />
          )}

          {/* 3D Reconstructed Metric Terrain Mesh with 7 Material Modes */}
          <TerrainMesh
            terrainData={terrainData}
            exaggeration={exaggeration}
            visualMode={visualMode}
            colormap={colormap}
            showWireframe={showWireframe}
            showSatelliteTexture={showSatelliteTexture}
            showContours={showContours}
            onPointClick={handlePointClick}
          />

          {/* Environment Reconstruction Layers (Buildings, Roads, Water) */}
          {environmentData && layerVisibility && (
            <EnvironmentManager
              environmentData={environmentData}
              layerVisibility={layerVisibility}
              exaggeration={exaggeration}
              minElevation={terrainData.stats.min_elevation}
              colorBySource={colorBySource}
              onBuildingClick={onBuildingClick}
              onRoadClick={onRoadClick}
              onWaterClick={onWaterClick}
            />
          )}

          {/* 3D North Arrow Indicator */}
          <NorthIndicator terrainWidthM={maxDimension} />

          {/* 3D Metric Scale Bar */}
          <MetricScaleBar terrainWidthM={maxDimension} />

          {/* Measurement & Inspection Pins */}
          {activeTool === 'inspect' && selectedPoint && selectedPointPos && (
            <MeasurementPins
              pointAPos={selectedPointPos}
              pointAData={selectedPoint}
            />
          )}

          {activeTool === 'measure' && (
            <MeasurementPins
              pointAPos={pointAPos}
              pointAData={pointAData}
              pointBPos={pointBPos}
              pointBData={pointBData}
              measurement={measurement}
            />
          )}

          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.06}
            maxPolarAngle={Math.PI / 2 - 0.02}
            minDistance={100}
            maxDistance={maxDimension * 4}
          />
        </Canvas>
      </div>

    </div>
  );
};
