import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoadFeature } from '../../types';

interface RoadsLayerProps {
  roads: RoadFeature[];
  exaggeration: number;
  minElevation: number;
  visible: boolean;
  onRoadClick?: (road: RoadFeature) => void;
}

const ROAD_COLORS: Record<string, string> = {
  motorway: '#334155',
  trunk: '#334155',
  primary: '#475569',
  secondary: '#475569',
  tertiary: '#64748b',
  residential: '#64748b',
  unclassified: '#64748b',
  service: '#94a3b8',
  living_street: '#94a3b8',
  pedestrian: '#a1a1aa',
  footway: '#cbd5e1',
  cycleway: '#059669',
  track: '#78350f',
  path: '#92400e',
  steps: '#71717a',
};

/**
 * Renders roads as 3D ribbon strips draped on the terrain surface.
 * Elevation at each vertex is (vertex_z - minElevation) * exaggeration + 0.4m (to prevent z-fighting).
 */
export const RoadsLayer: React.FC<RoadsLayerProps> = ({
  roads,
  exaggeration,
  minElevation,
  visible,
  onRoadClick,
}) => {
  const roadMeshes = useMemo(() => {
    if (!roads || roads.length === 0) return [];

    return roads.map((road) => {
      const pts = road.coords_metric;
      if (!pts || pts.length < 2) return null;

      const halfWidth = (road.width / 2.0) * Math.max(1, exaggeration * 0.2 + 0.8);

      const vertices: number[] = [];
      const indices: number[] = [];

      for (let i = 0; i < pts.length; i++) {
        const x = pts[i][0];
        const z = pts[i][1];
        // Relative elevation above terrain base + 0.4m offset
        const rawZ = pts[i][2] || minElevation;
        const y = (rawZ - minElevation) * exaggeration + 0.4;

        // Compute tangent direction
        let dx = 0, dz = 0;
        if (i < pts.length - 1) {
          dx = pts[i + 1][0] - x;
          dz = pts[i + 1][1] - z;
        } else if (i > 0) {
          dx = x - pts[i - 1][0];
          dz = z - pts[i - 1][1];
        }
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        // Perpendicular normal in XZ plane
        const px = -dz / len * halfWidth;
        const pz = dx / len * halfWidth;

        // Left vertex
        vertices.push(x + px, y, z + pz);
        // Right vertex
        vertices.push(x - px, y, z - pz);

        if (i < pts.length - 1) {
          const vi = i * 2;
          indices.push(vi, vi + 1, vi + 2);
          indices.push(vi + 1, vi + 3, vi + 2);
        }
      }

      if (vertices.length < 6) return null;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const color = ROAD_COLORS[road.road_type] || '#64748b';

      return {
        road,
        geometry,
        color,
      };
    }).filter(Boolean);
  }, [roads, exaggeration, minElevation]);

  if (!visible || roadMeshes.length === 0) return null;

  return (
    <group name="roads-layer">
      {roadMeshes.map((item: any, idx: number) => (
        <mesh
          key={item.road.id || idx}
          geometry={item.geometry}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onRoadClick?.(item.road);
          }}
        >
          <meshStandardMaterial
            color={item.color}
            roughness={0.9}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};
