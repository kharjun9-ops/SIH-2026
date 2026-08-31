import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WaterFeature } from '../../types';

interface WaterLayerProps {
  water: WaterFeature[];
  exaggeration: number;
  minElevation: number;
  visible: boolean;
  onWaterClick?: (water: WaterFeature) => void;
}

/**
 * Renders water body polygons as reflective semi-transparent meshes at the terrain surface level.
 */
export const WaterLayer: React.FC<WaterLayerProps> = ({
  water,
  exaggeration,
  minElevation,
  visible,
  onWaterClick,
}) => {
  const waterMeshes = useMemo(() => {
    if (!water || water.length === 0) return [];

    return water.map((w) => {
      const pts = w.polygon_metric;
      if (!pts || pts.length < 3) return null;

      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], -pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], -pts[i][1]);
      }
      shape.closePath();

      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);

      const rawZ = w.elevation || minElevation;
      const y = Math.max(0, (rawZ - minElevation) * exaggeration + 0.2);

      return {
        water: w,
        geometry,
        y,
      };
    }).filter(Boolean);
  }, [water, exaggeration, minElevation]);

  if (!visible || waterMeshes.length === 0) return null;

  return (
    <group name="water-layer">
      {waterMeshes.map((item: any, idx: number) => (
        <mesh
          key={item.water.id || idx}
          geometry={item.geometry}
          position={[0, item.y, 0]}
          receiveShadow
          onClick={(e) => {
            e.stopPropagation();
            onWaterClick?.(item.water);
          }}
        >
          <meshStandardMaterial
            color="#0284c7" // Deep cyan/blue water
            roughness={0.15}
            metalness={0.4}
            transparent
            opacity={0.78}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};
