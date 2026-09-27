import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line, Html } from '@react-three/drei';
import { CameraTrajectoryPoint } from '../../types';

interface CameraPath3DProps {
  trajectory: CameraTrajectoryPoint[];
  showFrustums?: boolean;
}

export const CameraPath3D: React.FC<CameraPath3DProps> = ({
  trajectory,
  showFrustums = true
}) => {
  const points = useMemo(() => {
    return trajectory.map((t) => new THREE.Vector3(...t.position));
  }, [trajectory]);

  if (trajectory.length < 2) return null;

  return (
    <group>
      {/* Trajectory Path Line */}
      <Line
        points={points}
        color="#38bdf8"
        lineWidth={3}
        dashed
        dashScale={2}
        dashSize={0.2}
        gapSize={0.1}
      />

      {/* Individual Camera Frustums / Nodes */}
      {showFrustums &&
        trajectory.map((cam, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === trajectory.length - 1;
          const color = isStart ? '#10b981' : isEnd ? '#ec4899' : '#38bdf8';

          return (
            <group key={cam.frame_index} position={cam.position}>
              {/* Camera Marker Sphere */}
              <mesh>
                <sphereGeometry args={[isStart || isEnd ? 0.08 : 0.05, 16, 16]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={0.6}
                  roughness={0.2}
                />
              </mesh>

              {/* Direction Indicator Cone */}
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.08]}>
                <coneGeometry args={[0.04, 0.1, 8]} />
                <meshBasicMaterial color={color} wireframe />
              </mesh>

              {/* Start & End HTML Badges */}
              {(isStart || isEnd) && (
                <Html position={[0, 0, 0.15]} center distanceFactor={8}>
                  <div
                    className="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white shadow-xl pointer-events-none select-none border backdrop-blur-md whitespace-nowrap"
                    style={{
                      backgroundColor: `${color}cc`,
                      borderColor: color
                    }}
                  >
                    {isStart ? 'START (Cam 0)' : `END (Cam ${cam.frame_index})`}
                  </div>
                </Html>
              )}
            </group>
          );
        })}
    </group>
  );
};
