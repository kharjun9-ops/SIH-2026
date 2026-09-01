import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import { 
  TerrainReconstructResponse, 
  VisualMode, 
  ColormapMode, 
  PointInspection,
  LandslideAnalysisResponse
} from '../../types';
import { resolveAssetUrl } from '../../services/api';

interface TerrainMeshProps {
  terrainData: TerrainReconstructResponse;
  exaggeration: number;
  visualMode: VisualMode;
  colormap: ColormapMode;
  showWireframe: boolean;
  showSatelliteTexture: boolean;
  showContours?: boolean;
  landslideData?: LandslideAnalysisResponse | null;
  onPointClick?: (inspection: PointInspection, worldPos: THREE.Vector3) => void;
}

// Colormap interpolation helpers
export function getLandslideColor(score: number): THREE.Color {
  if (score < 0.20) return new THREE.Color('#10b981'); // VERY LOW (Emerald)
  if (score < 0.40) return new THREE.Color('#06b6d4'); // LOW (Cyan)
  if (score < 0.60) return new THREE.Color('#f59e0b'); // MODERATE (Amber)
  if (score < 0.80) return new THREE.Color('#f97316'); // HIGH (Orange)
  return new THREE.Color('#ef4444');                   // VERY HIGH (Crimson)
}
function getHypsometricColor(t: number): THREE.Color {
  if (t < 0.2) return new THREE.Color().lerpColors(new THREE.Color('#153e2e'), new THREE.Color('#2d6a4f'), t / 0.2);
  if (t < 0.45) return new THREE.Color().lerpColors(new THREE.Color('#2d6a4f'), new THREE.Color('#8b6d47'), (t - 0.2) / 0.25);
  if (t < 0.75) return new THREE.Color().lerpColors(new THREE.Color('#8b6d47'), new THREE.Color('#5c504a'), (t - 0.45) / 0.3);
  return new THREE.Color().lerpColors(new THREE.Color('#5c504a'), new THREE.Color('#f8fafc'), (t - 0.75) / 0.25);
}

function getViridisColor(t: number): THREE.Color {
  if (t < 0.25) return new THREE.Color().lerpColors(new THREE.Color('#440154'), new THREE.Color('#3b528b'), t / 0.25);
  if (t < 0.5) return new THREE.Color().lerpColors(new THREE.Color('#3b528b'), new THREE.Color('#21918c'), (t - 0.25) / 0.25);
  if (t < 0.75) return new THREE.Color().lerpColors(new THREE.Color('#21918c'), new THREE.Color('#5ec962'), (t - 0.5) / 0.25);
  return new THREE.Color().lerpColors(new THREE.Color('#5ec962'), new THREE.Color('#fde725'), (t - 0.75) / 0.25);
}

function getMagmaColor(t: number): THREE.Color {
  if (t < 0.25) return new THREE.Color().lerpColors(new THREE.Color('#000004'), new THREE.Color('#51127c'), t / 0.25);
  if (t < 0.5) return new THREE.Color().lerpColors(new THREE.Color('#51127c'), new THREE.Color('#b73779'), (t - 0.25) / 0.25);
  if (t < 0.75) return new THREE.Color().lerpColors(new THREE.Color('#b73779'), new THREE.Color('#fc8961'), (t - 0.5) / 0.25);
  return new THREE.Color().lerpColors(new THREE.Color('#fc8961'), new THREE.Color('#fcfdbf'), (t - 0.75) / 0.25);
}

function getThermalColor(t: number): THREE.Color {
  if (t < 0.33) return new THREE.Color().lerpColors(new THREE.Color('#001040'), new THREE.Color('#00ffff'), t / 0.33);
  if (t < 0.66) return new THREE.Color().lerpColors(new THREE.Color('#00ffff'), new THREE.Color('#ffcc00'), (t - 0.33) / 0.33);
  return new THREE.Color().lerpColors(new THREE.Color('#ffcc00'), new THREE.Color('#ff2200'), (t - 0.66) / 0.34);
}

function getEmeraldColor(t: number): THREE.Color {
  return new THREE.Color().lerpColors(new THREE.Color('#064e3b'), new THREE.Color('#34d399'), t);
}

function getSlopeColor(slopeDeg: number): THREE.Color {
  if (slopeDeg < 5.0) return new THREE.Color('#10b981'); // Gentle (Green)
  if (slopeDeg < 15.0) return new THREE.Color('#06b6d4'); // Moderate (Cyan)
  if (slopeDeg < 30.0) return new THREE.Color('#f59e0b'); // Steep (Amber)
  if (slopeDeg < 45.0) return new THREE.Color('#f97316'); // Very Steep (Orange)
  return new THREE.Color('#ef4444'); // Cliff (Red)
}

export const TerrainMesh: React.FC<TerrainMeshProps> = ({
  terrainData,
  exaggeration = 1.0,
  visualMode = 'elevation',
  colormap = 'hypsometric',
  showWireframe = false,
  showSatelliteTexture = true,
  showContours = false,
  landslideData,
  onPointClick,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const [satelliteTexture, setSatelliteTexture] = useState<THREE.Texture | null>(null);
  const [hillshadeTexture, setHillshadeTexture] = useState<THREE.Texture | null>(null);

  // Load satellite texture if available
  useEffect(() => {
    const rawUrl = terrainData.texture_url;
    if (rawUrl) {
      const url = resolveAssetUrl(rawUrl) || rawUrl;
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          setSatelliteTexture(tex);
        },
        undefined,
        (err) => console.log('Texture load error:', err)
      );
    } else {
      setSatelliteTexture(null);
    }
  }, [terrainData.texture_url]);

  // Load hillshade texture if available
  useEffect(() => {
    const rawUrl = terrainData.hillshade_url;
    if (rawUrl) {
      const url = resolveAssetUrl(rawUrl) || rawUrl;
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          setHillshadeTexture(tex);
        },
        undefined,
        (err) => console.log('Hillshade load error:', err)
      );
    } else {
      setHillshadeTexture(null);
    }
  }, [terrainData.hillshade_url]);

  // Construct 1:1 Metric BufferGeometry (X, Y, Z in meters)
  const { geometry, elevationGrid, minElev, maxElev, rows, cols, widthM, heightM } = useMemo(() => {
    const grid = terrainData.elevation_grid;
    const slopeGrid = terrainData.slope_grid;
    const r = grid.length;
    const c = grid[0].length;
    const minE = terrainData.stats.min_elevation;
    const maxE = terrainData.stats.max_elevation;
    const range = Math.max(1.0, maxE - minE);

    const mb = terrainData.metric_bounds;
    const halfW = mb.width_m / 2.0;
    const halfH = mb.height_m / 2.0;

    const geom = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Contour interval band step for contour lines
    const contourInterval = 20.0;

    for (let i = 0; i < r; i++) {
      for (let j = 0; j < c; j++) {
        // True Metric X and Z in meters
        const x_m = -halfW + (j / (c - 1)) * (halfW * 2);
        const z_m = -halfH + (i / (r - 1)) * (halfH * 2);
        const elev = grid[i][j];
        const slope = slopeGrid && slopeGrid[i] ? slopeGrid[i][j] : 0.0;

        // True Y in meters relative to min elevation
        const y_m = (elev - minE) * exaggeration;

        positions.push(x_m, y_m, z_m);
        uvs.push(j / (c - 1), 1.0 - (i / (r - 1)));

        // Colormap or Slope or Landslide Coloring
        const normElev = Math.min(1.0, Math.max(0.0, (elev - minE) / range));
        let col = new THREE.Color();

        if (visualMode === 'landslide' || colormap === 'landslide') {
          let score = 0.1;
          if (landslideData && landslideData.risk_grid && landslideData.risk_grid[i] && landslideData.risk_grid[i][j] !== undefined) {
            score = landslideData.risk_grid[i][j];
          } else {
            // Geotechnical screening fallback from slope
            if (slope < 5.0) score = 0.08;
            else if (slope < 15.0) score = 0.28;
            else if (slope < 25.0) score = 0.48;
            else if (slope < 35.0) score = 0.68;
            else score = 0.88;
          }
          col = getLandslideColor(score);
        } else if (visualMode === 'slope') {
          col = getSlopeColor(slope);
        } else if (colormap === 'viridis') {
          col = getViridisColor(normElev);
        } else if (colormap === 'magma') {
          col = getMagmaColor(normElev);
        } else if (colormap === 'thermal') {
          col = getThermalColor(normElev);
        } else if (colormap === 'emerald') {
          col = getEmeraldColor(normElev);
        } else {
          col = getHypsometricColor(normElev);
        }

        // Add subtle contour line darkening if contours enabled
        if (showContours) {
          const rem = Math.abs(elev % contourInterval);
          if (rem < 1.5 || rem > (contourInterval - 1.5)) {
            col.multiplyScalar(0.4); // Dark contour band
          }
        }

        colors.push(col.r, col.g, col.b);
      }
    }

    for (let i = 0; i < r - 1; i++) {
      for (let j = 0; j < c - 1; j++) {
        const i0 = i * c + j;
        const i1 = i * c + (j + 1);
        const i2 = (i + 1) * c + j;
        const i3 = (i + 1) * c + (j + 1);

        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return {
      geometry: geom,
      elevationGrid: grid,
      minElev: minE,
      maxElev: maxE,
      rows: r,
      cols: c,
      widthM: mb.width_m,
      heightM: mb.height_m,
    };
  }, [terrainData, exaggeration, colormap, visualMode, showContours, landslideData]);

  // Exact Raycasting Point Click -> Sub-pixel Continuous Bilinear DEM sampling
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!onPointClick || !e.point) return;

    const px = e.point.x;
    const pz = e.point.z;

    const halfW = widthM / 2.0;
    const halfH = heightM / 2.0;

    const normX = Math.min(1.0, Math.max(0.0, (px + halfW) / (halfW * 2.0)));
    const normZ = Math.min(1.0, Math.max(0.0, (pz + halfH) / (halfH * 2.0)));

    // Continuous floating-point cell positions
    const colF = Math.min(cols - 1, Math.max(0.0, normX * (cols - 1)));
    const rowF = Math.min(rows - 1, Math.max(0.0, normZ * (rows - 1)));

    const c0 = Math.floor(colF);
    const c1 = Math.min(cols - 1, c0 + 1);
    const r0 = Math.floor(rowF);
    const r1 = Math.min(rows - 1, r0 + 1);

    const dc = colF - c0;
    const dr = rowF - r0;

    // Bilinear continuous elevation interpolation from original source raster
    const bilinearElev = (
      elevationGrid[r0][c0] * (1 - dr) * (1 - dc) +
      elevationGrid[r0][c1] * (1 - dr) * dc +
      elevationGrid[r1][c0] * dr * (1 - dc) +
      elevationGrid[r1][c1] * dr * dc
    );

    const bounds = terrainData.bounds;
    const lat = bounds.max_lat - normZ * (bounds.max_lat - bounds.min_lat);
    const lon = bounds.min_lon + normX * (bounds.max_lon - bounds.min_lon);

    // Un-exaggerated true mesh intersection elevation
    const meshElev = (e.point.y / Math.max(0.1, exaggeration)) + minElev;

    const slope = terrainData.slope_grid[r0][c0] * (1 - dr) * (1 - dc) +
                  terrainData.slope_grid[r0][c1] * (1 - dr) * dc +
                  terrainData.slope_grid[r1][c0] * dr * (1 - dc) +
                  terrainData.slope_grid[r1][c1] * dr * dc;

    const aspect = terrainData.aspect_grid[Math.round(rowF)][Math.round(colF)];

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    const cardIdx = Math.floor(((aspect + 22.5) % 360) / 45);
    const aspectCard = directions[cardIdx];

    const sourceName = terrainData.provider_used || 'Copernicus DEM GLO-30';
    const isLidar = sourceName.toLowerCase().includes('lidar');

    const inspection: PointInspection = {
      latitude: Number(lat.toFixed(7)),
      longitude: Number(lon.toFixed(7)),
      elevation: Number(bilinearElev.toFixed(2)),
      mesh_elevation_m: Number(meshElev.toFixed(2)),
      elevation_difference_m: Number(Math.abs(meshElev - bilinearElev).toFixed(2)),
      slope: Number(slope.toFixed(2)),
      aspect: Number(aspect.toFixed(2)),
      aspect_cardinal: aspectCard,
      grid_x: Math.round(colF),
      grid_y: Math.round(rowF),
      x_metric_m: Number(px.toFixed(2)),
      y_metric_m: Number((-pz).toFixed(2)),
      source: sourceName,
      source_type: isLidar ? 'DTM (Bare-Earth Ground Filtered)' : 'DSM (Digital Surface Model)',
      native_resolution: isLidar ? '0.5m – 1.0m (High-Density LiDAR)' : '~30m (1 Arc-Second Nominal)',
      vertical_datum: isLidar ? 'NAVD88 / EGM96 Orthometric' : 'EGM96 / EGM2008 Geoid (MSL)',
      sampling_method: 'Continuous Bilinear Interpolation',
      coordinate_system: 'EPSG:4326 (WGS84) / Local Metric Equirectangular',
      measurement_quality: 'Source-consistent measurement',
      accuracy_statement: `Measured from authoritative ${sourceName} using continuous bilinear interpolation.`
    };

    onPointClick(inspection, e.point);
  };

  // Determine active texture based on material mode
  const activeTexture = useMemo(() => {
    if (visualMode === 'satellite' && satelliteTexture) return satelliteTexture;
    if (visualMode === 'hillshade' && hillshadeTexture) return hillshadeTexture;
    if (visualMode === 'hybrid' && satelliteTexture) return satelliteTexture;
    if (showSatelliteTexture && satelliteTexture && visualMode === 'elevation') return satelliteTexture;
    return null;
  }, [visualMode, satelliteTexture, hillshadeTexture, showSatelliteTexture]);

  const useVertexColors = !activeTexture || visualMode === 'slope' || visualMode === 'landslide';

  return (
    <group>
      {/* 3D Solid Mesh or Wireframe */}
      {visualMode !== 'pointcloud' && (
        <mesh
          ref={meshRef}
          geometry={geometry}
          onPointerDown={handlePointerDown}
          receiveShadow
          castShadow
        >
          <meshStandardMaterial
            vertexColors={useVertexColors}
            map={activeTexture || undefined}
            wireframe={visualMode === 'wireframe' || showWireframe}
            roughness={visualMode === 'hillshade' ? 0.9 : 0.65}
            metalness={0.05}
            flatShading={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 3D Point Cloud Mode */}
      {visualMode === 'pointcloud' && (
        <points
          ref={pointsRef}
          geometry={geometry}
          onPointerDown={handlePointerDown}
        >
          <pointsMaterial
            vertexColors
            size={Math.max(2.0, widthM / 300.0)}
            sizeAttenuation={true}
            transparent
            opacity={0.92}
          />
        </points>
      )}
    </group>
  );
};
