import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
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
  Activity, 
  AlertTriangle, 
  Flame, 
  Info,
  Navigation
} from 'lucide-react';
import { 
  TerrainReconstructResponse, 
  VisualMode, 
  ColormapMode, 
  InteractionTool, 
  PointInspection, 
  TwoPointMeasurementResponse,
  PointValidation,
  LandslideAnalysisResponse,
  LandslideHotspot,
  HistoricalLandslideEvent
} from '../../types';
import { TerrainMesh } from './TerrainMesh';
import { MeasurementPins } from './MeasurementPins';
import { EnvironmentManager } from '../Environment/EnvironmentManager';
import { FlyDroneControls, DroneTelemetry } from './FlyDroneControls';
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
  layerVisibility?: { buildings: boolean; roads: boolean; water: boolean; landmarks: boolean; landslide?: boolean };
  colorBySource?: boolean;
  onBuildingClick?: (building: any) => void;
  onRoadClick?: (road: any) => void;
  onWaterClick?: (water: any) => void;
  landslideData?: LandslideAnalysisResponse | null;
  onHotspotClick?: (hotspot: LandslideHotspot) => void;
  showHistoricalLandslides?: boolean;
  onSelectHistoricalEvent?: (event: HistoricalLandslideEvent) => void;
}

// 3D Historical Landslide Marker Pins Component
const HistoricalLandslideMarkers: React.FC<{
  events: HistoricalLandslideEvent[];
  bounds: any;
  onSelectEvent?: (ev: HistoricalLandslideEvent) => void;
}> = ({ events, bounds, onSelectEvent }) => {
  if (!events || events.length === 0) return null;
  const midLat = (bounds.min_lat + bounds.max_lat) / 2.0;
  const midLon = (bounds.min_lon + bounds.max_lon) / 2.0;

  return (
    <group>
      {events.map((ev) => {
        const mx = (ev.longitude - midLon) * (111320.0 * Math.cos((midLat * Math.PI) / 180));
        const mz = (bounds.max_lat - ev.latitude - (bounds.max_lat - bounds.min_lat) / 2.0) * 111320.0;

        return (
          <group key={ev.id} position={[mx, 35, -mz]}>
            <mesh position={[0, 8, 0]}>
              <sphereGeometry args={[14, 16, 16]} />
              <meshStandardMaterial 
                color={ev.is_captured ? "#ef4444" : "#f59e0b"} 
                emissive={ev.is_captured ? "#ef4444" : "#f59e0b"} 
                emissiveIntensity={0.8} 
              />
            </mesh>
            <mesh position={[0, -8, 0]}>
              <cylinderGeometry args={[2, 2, 28, 8]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <Html position={[0, 26, 0]} center>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectEvent) onSelectEvent(ev);
                }}
                className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold text-white shadow-2xl flex items-center gap-1 border transition-transform hover:scale-110 cursor-pointer whitespace-nowrap pointer-events-auto ${
                  ev.is_captured ? 'bg-rose-950/95 border-rose-500 text-rose-200' : 'bg-amber-950/95 border-amber-500 text-amber-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>{ev.id} &bull; {ev.trigger.slice(0, 22)}</span>
              </button>
            </Html>
          </group>
        );
      })}
    </group>
  );
};

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

// 3D Hotspot Highlight Ring Component (Top 3 Critical Hotspots)
const HotspotMarkers: React.FC<{
  hotspots: LandslideHotspot[];
  onSelectHotspot?: (hs: LandslideHotspot) => void;
}> = ({ hotspots, onSelectHotspot }) => {
  return (
    <group>
      {hotspots.slice(0, 3).map((hs) => (
        <group key={hs.id} position={[hs.centroid_x_m, 20, -hs.centroid_z_m]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(20, Math.sqrt(hs.area_sq_m) * 0.25), Math.max(26, Math.sqrt(hs.area_sq_m) * 0.3), 32]} />
            <meshBasicMaterial 
              color={hs.risk_class === 'VERY HIGH' ? '#ef4444' : '#f97316'} 
              transparent 
              opacity={0.8} 
              side={THREE.DoubleSide} 
            />
          </mesh>
          <Html position={[0, 15, 0]} center>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onSelectHotspot) onSelectHotspot(hs);
              }}
              className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold text-white shadow-xl flex items-center gap-1 border transition-transform hover:scale-110 cursor-pointer whitespace-nowrap pointer-events-auto ${
                hs.risk_class === 'VERY HIGH' 
                  ? 'bg-rose-950/95 border-rose-500 text-rose-300' 
                  : 'bg-amber-950/95 border-amber-500 text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span>{hs.name} ({hs.risk_class})</span>
            </button>
          </Html>
        </group>
      ))}
    </group>
  );
};

// Helper component tracking camera heading in degrees when OrbitControls is active
const OrbitHeadingTracker: React.FC<{ onHeadingChange: (deg: number) => void }> = ({ onHeadingChange }) => {
  const { camera } = useThree();
  useFrame(() => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // Heading in degrees: 0 = North (-Z), 90 = East (+X), 180 = South (+Z), 270 = West (-X)
    const rad = Math.atan2(-dir.x, -dir.z);
    const deg = ((rad * 180.0) / Math.PI + 360) % 360;
    onHeadingChange(Math.round(deg));
  });
  return null;
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
  landslideData,
  onHotspotClick,
  showHistoricalLandslides = true,
  onSelectHistoricalEvent,
}) => {
  const controlsRef = useRef<any>(null);
  const [selectedPointPos, setSelectedPointPos] = useState<THREE.Vector3 | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Dual Camera Navigation Modes: Orbit vs Drone Fly
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fly'>('orbit');
  const [telemetry, setTelemetry] = useState<DroneTelemetry | null>(null);
  const [cameraHeading, setCameraHeading] = useState<number>(0);

  const metricWidth = terrainData.metric_bounds.width_m;
  const metricHeight = terrainData.metric_bounds.height_m;
  const maxDimension = Math.max(metricWidth, metricHeight);

  const cameraInitialPos: [number, number, number] = [
    0,
    maxDimension * 0.55,
    maxDimension * 0.85
  ];

  // Auto-frame terrain whenever a new region loads
  useEffect(() => {
    if (controlsRef.current && cameraMode === 'orbit') {
      const controls = controlsRef.current;
      controls.object.position.set(0, maxDimension * 0.55, maxDimension * 0.85);
      const elevCenter = ((terrainData.stats.max_elevation - terrainData.stats.min_elevation) * 0.25) * exaggeration;
      controls.target.set(0, elevCenter, 0);
      controls.update();
    }
  }, [terrainData.terrain_id, terrainData.region_name]);

  const fitCameraToTerrain = () => {
    if (cameraMode === 'fly') {
      setCameraMode('orbit');
    }
    if (controlsRef.current) {
      const controls = controlsRef.current;
      controls.object.position.set(0, maxDimension * 0.55, maxDimension * 0.85);
      const elevCenter = ((terrainData.stats.max_elevation - terrainData.stats.min_elevation) * 0.25) * exaggeration;
      controls.target.set(0, elevCenter, 0);
      controls.update();
    }
  };

  const resetToNorth = () => {
    if (cameraMode === 'fly') {
      setCameraMode('orbit');
    }
    if (controlsRef.current) {
      const controls = controlsRef.current;
      const pos = controls.object.position;
      const radius = Math.sqrt(pos.x * pos.x + pos.z * pos.z) || maxDimension * 0.85;
      controls.object.position.set(0, pos.y, radius);
      controls.target.set(0, controls.target.y, 0);
      controls.update();
    }
  };

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
          const dMode = terrainData.gis_metadata?.data_status === 'SYNTHETIC DEMO DATA' ? 'demo' : 'real';
          const measRes = await api.measurePoints(
            pointAData.latitude, pointAData.longitude,
            inspection.latitude, inspection.longitude,
            terrainData.bounds,
            dMode
          );
          onSetMeasurementPoints(pointAData, pointAPos, inspection, worldPos, measRes);
        } catch {
          const dH = Number((inspection.elevation - pointAData.elevation).toFixed(2));
          const lat1 = (pointAData.latitude * Math.PI) / 180;
          const lat2 = (inspection.latitude * Math.PI) / 180;
          const dLat = ((inspection.latitude - pointAData.latitude) * Math.PI) / 180;
          const dLon = ((inspection.longitude - pointAData.longitude) * Math.PI) / 180;
          const ha = Math.sin(dLat / 2.0) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2.0) ** 2;
          const hc = 2.0 * Math.atan2(Math.sqrt(ha), Math.sqrt(1.0 - ha));
          const hDist = Number(Math.max(0.1, 6371000.0 * hc).toFixed(2));
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
            max_elevation_m: Math.max(pointAData.elevation, inspection.elevation),
            comparison_text: `Point B is ${Math.abs(dH).toFixed(2)}m ${dH >= 0 ? 'Higher' : 'Lower'} than Point A (${gradePct}% grade)`,
            source: terrainData.provider_used || 'Copernicus DEM GLO-30',
            source_resolution: terrainData.gis_metadata?.native_resolution || '~30m',
            vertical_datum_compatible: true,
            vertical_datum: terrainData.gis_metadata?.vertical_datum || 'Orthometric Height above MSL',
            elevation_profile: []
          });
        }
      }
    }
  };

  const setCameraView = (type: 'iso' | 'top' | 'side' | 'reset') => {
    if (cameraMode === 'fly') setCameraMode('orbit');
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
        {/* Interaction Tool Selector */}
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

        {/* Camera Navigation Mode Switcher: Orbit vs Drone Fly */}
        <div className="flex items-center bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl p-1 shadow-xl text-xs">
          <button
            onClick={() => setCameraMode('orbit')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
              cameraMode === 'orbit'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Orbit Mode</span>
          </button>
          <button
            onClick={() => setCameraMode('fly')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
              cameraMode === 'fly'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Drone Fly</span>
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

        {/* Orbit Preset Angles */}
        {cameraMode === 'orbit' && (
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
              title="Reset camera view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Top Right: Fit Terrain & 3D Export */}
      <div className="absolute top-4 right-4 z-20 flex items-start gap-2.5 pointer-events-auto">
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={fitCameraToTerrain}
              className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800/90 text-cyan-300 border border-slate-700 rounded-xl text-xs font-medium backdrop-blur-md shadow-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Fit full terrain to screen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fit Terrain</span>
            </button>

            <button
              onClick={() => handleExport('glb')}
              disabled={isExporting}
              className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800/90 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-medium backdrop-blur-md shadow-lg flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporting...' : 'Export Metric 3D (.glb)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Non-Geographic Exaggeration Alert Banner */}
      {exaggeration !== 1.0 && (
        <div className="absolute top-16 left-4 z-20 pointer-events-none bg-amber-950/90 border border-amber-500/80 rounded-xl px-3 py-1 text-xs text-amber-200 shadow-xl flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>EXAGGERATED VIEW ({exaggeration.toFixed(1)}×) — Non-Geographic Vertical Scale</span>
        </div>
      )}

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

      {/* Drone Flight Telemetry HUD (Active in Fly Mode) */}
      {cameraMode === 'fly' && telemetry && (
        <div className="absolute bottom-4 right-4 z-20 pointer-events-auto bg-slate-950/90 backdrop-blur-md border border-cyan-500/50 rounded-xl p-3 shadow-2xl font-mono text-xs text-slate-200 space-y-2 min-w-[240px]">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              DRONE RECON HUD
            </span>
            <span className="text-[10px] text-slate-400">{telemetry.speed} m/s</span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div>
              <span className="text-slate-500 block text-[9px]">ALT AGL</span>
              <span className="text-white font-bold">{telemetry.altitudeAGL} m</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px]">ALT MSL</span>
              <span className="text-cyan-300 font-bold">{telemetry.altitudeMSL} m</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px]">HEADING</span>
              <span className="text-amber-300 font-bold">{telemetry.headingDeg}°</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px]">PITCH</span>
              <span className="text-slate-300 font-bold">{telemetry.pitchDeg}°</span>
            </div>
          </div>

          <div className="pt-1 border-t border-slate-800/80 text-[9px] text-slate-400 flex flex-wrap gap-x-2">
            <span>[W/A/S/D] Move</span>
            <span>[Q/E] Alt</span>
            <span>[Shift] Boost</span>
            <span>[Drag] Look</span>
            <span>[Scroll] Speed</span>
          </div>
        </div>
      )}

      {/* Main Three.js R3F Canvas Viewport */}
      <div className="w-full h-full flex-1">
        <Canvas
          shadows
          camera={{ 
            position: cameraInitialPos, 
            fov: 42, 
            near: 5, 
            far: maxDimension * 10 
          }}
          gl={{ 
            antialias: true, 
            alpha: false, 
            preserveDrawingBuffer: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15
          }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[maxDimension * 0.8, maxDimension * 1.2, maxDimension * 0.6]}
            intensity={1.6}
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
          <fog attach="fog" args={['#070a10', maxDimension * 1.5, maxDimension * 4.5]} />
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

          {/* 3D Reconstructed Metric Terrain Mesh with 7+ Material Modes */}
          <TerrainMesh
            terrainData={terrainData}
            exaggeration={exaggeration}
            visualMode={visualMode}
            colormap={colormap}
            showWireframe={showWireframe}
            showSatelliteTexture={showSatelliteTexture}
            showContours={showContours}
            landslideData={landslideData}
            onPointClick={handlePointClick}
          />

          {/* 3D Landslide Hotspot Indicators */}
          {(visualMode === 'landslide' || layerVisibility?.landslide) && landslideData?.hotspots && (
            <HotspotMarkers 
              hotspots={landslideData.hotspots} 
              onSelectHotspot={onHotspotClick} 
            />
          )}

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

          {/* 3D Historical Landslide Marker Pins */}
          {showHistoricalLandslides && landslideData?.historical_events && (
            <HistoricalLandslideMarkers
              events={landslideData.historical_events}
              bounds={terrainData.bounds}
              onSelectEvent={onSelectHistoricalEvent}
            />
          )}

          {/* 3D North Arrow Indicator on Terrain */}
          <NorthIndicator terrainWidthM={maxDimension} />

          {/* 3D Metric Scale Bar on Terrain */}
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

          {/* Orbit Navigation Mode */}
          {cameraMode === 'orbit' && (
            <>
              <OrbitControls 
                ref={controlsRef}
                enableDamping
                dampingFactor={0.06}
                maxPolarAngle={Math.PI / 2 - 0.02}
                minDistance={50}
                maxDistance={maxDimension * 4}
              />
              <OrbitHeadingTracker onHeadingChange={setCameraHeading} />
            </>
          )}

          {/* Drone / Fly Navigation Mode */}
          {cameraMode === 'fly' && (
            <FlyDroneControls
              terrainData={terrainData}
              exaggeration={exaggeration}
              enabled={cameraMode === 'fly'}
              onTelemetry={(t) => {
                setTelemetry(t);
                setCameraHeading(t.headingDeg);
              }}
            />
          )}
        </Canvas>
      </div>

    </div>
  );
};
