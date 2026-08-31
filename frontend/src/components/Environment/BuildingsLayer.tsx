import React, { useMemo } from 'react';
import * as THREE from 'three';
import { BuildingFeature } from '../../types';

interface BuildingsLayerProps {
  buildings: BuildingFeature[];
  exaggeration: number;
  minElevation: number;
  visible: boolean;
  colorBySource?: boolean;
  onBuildingClick?: (building: BuildingFeature) => void;
}

/**
 * Renders 3D extruded building footprint geometries placed directly on the terrain mesh.
 * Base of every building sits at (ground_elevation - minElevation) * exaggeration.
 * Supports distinct visual materials for LiDAR-derived, Mapped OSM, and Estimated heights.
 */
export const BuildingsLayer: React.FC<BuildingsLayerProps> = ({
  buildings,
  exaggeration,
  minElevation,
  visible,
  colorBySource = true,
  onBuildingClick,
}) => {
  const buildingMeshes = useMemo(() => {
    if (!buildings || buildings.length === 0) return [];

    return buildings.map((b) => {
      const pts = b.footprint_metric;
      if (!pts || pts.length < 3) return null;

      // 2D shape in local metric space (X = East, -Z for -90deg X rotation mapping)
      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], -pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], -pts[i][1]);
      }
      shape.closePath();

      const height = Math.max(3.0, (b.height || 8.0) * exaggeration);
      const groundY = Math.max(0, (b.ground_elevation - minElevation) * exaggeration);

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: height,
        bevelEnabled: false,
      };

      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // Rotate -90 deg on X to bring XY shape onto XZ ground and extrude upward (+Y)
      geometry.rotateX(-Math.PI / 2);
      geometry.computeVertexNormals();

      return {
        building: b,
        geometry,
        position: [0, groundY, 0] as [number, number, number],
      };
    }).filter(Boolean);
  }, [buildings, exaggeration, minElevation]);

  // Materials based on height source
  const materials = useMemo(() => {
    return {
      lidarHigh: new THREE.MeshStandardMaterial({
        color: '#06b6d4', // Bright cyan for high-precision LiDAR
        emissive: '#083344',
        emissiveIntensity: 0.25,
        roughness: 0.45,
        metalness: 0.25,
        flatShading: true,
      }),
      lidarMedium: new THREE.MeshStandardMaterial({
        color: '#0284c7', // Deep sky blue for medium LiDAR
        roughness: 0.55,
        metalness: 0.2,
        flatShading: true,
      }),
      mapped: new THREE.MeshStandardMaterial({
        color: '#f59e0b', // Warm amber for mapped OSM height
        roughness: 0.65,
        metalness: 0.15,
        flatShading: true,
      }),
      levels: new THREE.MeshStandardMaterial({
        color: '#64748b', // Slate blue-grey for floor levels estimate
        roughness: 0.75,
        metalness: 0.1,
        flatShading: true,
      }),
      estimated: new THREE.MeshStandardMaterial({
        color: '#94a3b8', // Slate grey for heuristic estimate
        roughness: 0.8,
        metalness: 0.05,
        flatShading: true,
        transparent: true,
        opacity: 0.9,
      }),
      unifiedSandstone: new THREE.MeshStandardMaterial({
        color: '#d4b483', // Realistic warm sandstone architectural material
        roughness: 0.65,
        metalness: 0.15,
        flatShading: true,
      }),
    };
  }, []);

  if (!visible || buildingMeshes.length === 0) return null;

  const getMaterial = (b: BuildingFeature) => {
    if (!colorBySource) {
      return materials.unifiedSandstone;
    }
    const src = (b.height_source || '').toUpperCase();
    if (src === 'LIDAR' || src === 'LIDAR-DERIVED') {
      return b.height_quality === 'HIGH' ? materials.lidarHigh : materials.lidarMedium;
    }
    if (src === 'OSM_HEIGHT' || src === 'MAPPED') {
      return materials.mapped;
    }
    if (src === 'OSM_LEVELS') {
      return materials.levels;
    }
    return materials.estimated;
  };

  return (
    <group name="buildings-layer">
      {buildingMeshes.map((item: any, idx: number) => (
        <mesh
          key={item.building.id || idx}
          geometry={item.geometry}
          position={item.position}
          material={getMaterial(item.building)}
          castShadow
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onBuildingClick?.(item.building);
          }}
        />
      ))}
    </group>
  );
};
