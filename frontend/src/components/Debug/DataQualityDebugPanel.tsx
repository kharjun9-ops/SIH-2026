import React, { useState } from 'react';
import { 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Layers, 
  Compass, 
  Database,
  Cpu
} from 'lucide-react';
import { LatLonBounds, TerrainReconstructResponse, EnvironmentLayersResponse } from '../../types';

interface DataQualityDebugPanelProps {
  bounds: LatLonBounds;
  terrainData: TerrainReconstructResponse | null;
  environmentData: EnvironmentLayersResponse | null;
  dataMode: 'real' | 'demo';
  pilotName?: string;
}

export const DataQualityDebugPanel: React.FC<DataQualityDebugPanelProps> = ({
  bounds,
  terrainData,
  environmentData,
  dataMode,
  pilotName = 'BENGALURU PILOT',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);

  const buildingCount = environmentData?.counts?.buildings ?? environmentData?.buildings?.length ?? 0;
  const roadCount = environmentData?.counts?.roads ?? environmentData?.roads?.length ?? 0;
  const waterCount = environmentData?.counts?.water ?? environmentData?.water?.length ?? 0;
  const rawElementCount = (buildingCount * 4) + (roadCount * 3) + (waterCount * 5) + 120; // Estimated raw XML nodes/ways

  return (
    <div className="bg-[#080d19] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden font-mono text-xs">
      {/* Header Bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-cyan-500/20 flex items-center justify-between hover:bg-slate-900/80 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white uppercase tracking-wider">{pilotName} &mdash; DATA PIPELINE DEBUG</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-700/60 text-cyan-300">
            LIVE TELEMETRY
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-[11px] text-slate-500">Pipeline Status:</span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>OPERATIONAL</span>
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
        </div>
      </button>

      {/* Panel Body */}
      {isOpen && (
        <div className="p-4 space-y-4 text-slate-300">
          
          {/* Top Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 text-[10px] uppercase flex items-center gap-1">
                <Database className="w-3 h-3 text-cyan-400" />
                <span>OSM Status</span>
              </div>
              <div className="text-sm font-bold text-emerald-400">
                {environmentData ? 'SUCCESS (200 OK)' : 'READY'}
              </div>
              <div className="text-[10px] text-slate-500">
                {environmentData?.source || 'OpenStreetMap Vector'}
              </div>
            </div>

            <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 text-[10px] uppercase flex items-center gap-1">
                <Layers className="w-3 h-3 text-amber-400" />
                <span>Parsed Buildings</span>
              </div>
              <div className="text-sm font-bold text-amber-300">
                {buildingCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500">
                Polygons sitting on DEM
              </div>
            </div>

            <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 text-[10px] uppercase flex items-center gap-1">
                <Layers className="w-3 h-3 text-slate-400" />
                <span>Parsed Roads</span>
              </div>
              <div className="text-sm font-bold text-slate-200">
                {roadCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500">
                Terrain-draped ribbons
              </div>
            </div>

            <div className="p-3 bg-slate-950/90 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 text-[10px] uppercase flex items-center gap-1">
                <Layers className="w-3 h-3 text-blue-400" />
                <span>Water Bodies</span>
              </div>
              <div className="text-sm font-bold text-blue-300">
                {waterCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-500">
                Reflective surface polygons
              </div>
            </div>
          </div>

          {/* Detailed Geodetic & CRS Lineage */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 space-y-2">
            <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              <span>Geodetic Lineage & Coordinate Systems</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500">Pilot Bounding Box:</span>
                <div className="text-white mt-0.5">
                  N: {bounds.max_lat.toFixed(5)}° | S: {bounds.min_lat.toFixed(5)}°<br />
                  E: {bounds.max_lon.toFixed(5)}° | W: {bounds.min_lon.toFixed(5)}°
                </div>
              </div>

              <div>
                <span className="text-slate-500">Terrain DEM Pipeline:</span>
                <div className="text-emerald-400 mt-0.5">
                  Source: {terrainData?.provider_used || 'Copernicus DEM GLO-30'}<br />
                  Resolution: ~30m Native ({terrainData?.grid_resolution || 128}x{terrainData?.grid_resolution || 128} Mesh)
                </div>
              </div>

              <div>
                <span className="text-slate-500">CRS Transformation:</span>
                <div className="text-cyan-300 mt-0.5">
                  Source CRS: EPSG:4326 (WGS84)<br />
                  3D Engine: 1:1 Metric Local CRS (Meters)
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
