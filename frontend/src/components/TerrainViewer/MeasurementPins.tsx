import React from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { PointInspection, TwoPointMeasurementResponse } from '../../types';

interface MeasurementPinsProps {
  pointAPos?: THREE.Vector3 | null;
  pointAData?: PointInspection | null;
  pointBPos?: THREE.Vector3 | null;
  pointBData?: PointInspection | null;
  measurement?: TwoPointMeasurementResponse | null;
}

export const MeasurementPins: React.FC<MeasurementPinsProps> = ({
  pointAPos,
  pointAData,
  pointBPos,
  pointBData,
  measurement,
}) => {
  // Calculate laser line points if both positions exist
  const linePoints = React.useMemo(() => {
    if (!pointAPos || !pointBPos) return null;
    return [pointAPos, pointBPos];
  }, [pointAPos, pointBPos]);

  return (
    <group>
      {/* Point A Marker Pin */}
      {pointAPos && (
        <group position={[pointAPos.x, pointAPos.y, pointAPos.z]}>
          {/* Vertical Pin Needle */}
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.12, 0.03, 5, 12]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.8} />
          </mesh>
          {/* Glowing Sphere Head */}
          <mesh position={[0, 5, 0]}>
            <sphereGeometry args={[0.6, 16, 16]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.5} roughness={0.1} />
          </mesh>
          {/* Base beacon ring on terrain */}
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 1.2, 24]} />
            <meshBasicMaterial color="#00e5ff" side={THREE.DoubleSide} transparent opacity={0.6} />
          </mesh>

          {/* HTML Billboard Label - Ultra Compact 50% Sized */}
          {pointAData && (
            <Html position={[0, 7, 0]} center>
              <div className="transform scale-[0.55] origin-bottom bg-slate-950/90 border border-cyan-400/80 px-2.5 py-1 rounded-md font-mono shadow-xl backdrop-blur-md pointer-events-none whitespace-nowrap text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <strong className="text-cyan-300 font-bold text-[9px] tracking-wider uppercase">
                    {measurement || pointBData ? 'POINT A' : 'POINT'}
                  </strong>
                  <span className="text-white font-bold text-[10px]">{pointAData.elevation} m</span>
                </div>
                <div className="text-[8px] text-slate-400">
                  {pointAData.latitude.toFixed(6)}°, {pointAData.longitude.toFixed(6)}°
                </div>
              </div>
            </Html>
          )}
        </group>
      )}

      {/* Point B Marker Pin */}
      {pointBPos && (
        <group position={[pointBPos.x, pointBPos.y, pointBPos.z]}>
          {/* Vertical Pin Needle */}
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.12, 0.03, 5, 12]} />
            <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={0.8} />
          </mesh>
          {/* Glowing Sphere Head */}
          <mesh position={[0, 5, 0]}>
            <sphereGeometry args={[0.6, 16, 16]} />
            <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1.5} roughness={0.1} />
          </mesh>
          {/* Base beacon ring on terrain */}
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 1.2, 24]} />
            <meshBasicMaterial color="#f43f5e" side={THREE.DoubleSide} transparent opacity={0.6} />
          </mesh>

          {/* HTML Billboard Label - Ultra Compact 50% Sized */}
          {pointBData && (
            <Html position={[0, 7, 0]} center>
              <div className="transform scale-[0.55] origin-bottom bg-slate-950/90 border border-rose-400/80 px-2.5 py-1 rounded-md font-mono shadow-xl backdrop-blur-md pointer-events-none whitespace-nowrap text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                  <strong className="text-rose-300 font-bold text-[9px] tracking-wider uppercase">POINT B</strong>
                  <span className="text-white font-bold text-[10px]">{pointBData.elevation} m</span>
                </div>
                <div className="text-[8px] text-slate-400">
                  {pointBData.latitude.toFixed(6)}°, {pointBData.longitude.toFixed(6)}°
                </div>
              </div>
            </Html>
          )}
        </group>
      )}

      {/* 3D Laser Beam connecting Point A & Point B */}
      {pointAPos && pointBPos && linePoints && (
        <group>
          {/* 3D Cylinder laser beam */}
          {(() => {
            const start = pointAPos.clone().add(new THREE.Vector3(0, 5, 0));
            const end = pointBPos.clone().add(new THREE.Vector3(0, 5, 0));
            const mid = start.clone().lerp(end, 0.5);
            const dist = start.distanceTo(end);
            const dir = end.clone().sub(start).normalize();
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

            return (
              <group position={mid} quaternion={quat}>
                <mesh>
                  <cylinderGeometry args={[0.12, 0.12, dist, 8]} />
                  <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} />
                </mesh>

                {/* Measurement Badge Floating at midpoint - Ultra Compact 50% Sized */}
                {measurement && (
                  <Html position={[0, 0, 0]} center>
                    <div className="transform scale-[0.55] origin-center bg-slate-950/90 border border-cyan-400/80 px-2.5 py-1 rounded-md font-mono text-cyan-300 shadow-xl backdrop-blur-md pointer-events-none whitespace-nowrap text-center">
                      <div className="text-[9px] font-bold">
                        Δh: <span className="text-white">{measurement.height_difference > 0 ? `+${measurement.height_difference}` : measurement.height_difference} m</span>
                      </div>
                      <div className="text-[8px] text-slate-300 font-normal">
                        Dist: {(measurement.distance_meters / 1000).toFixed(2)} km ({measurement.slope_percent}%)
                      </div>
                    </div>
                  </Html>
                )}
              </group>
            );
          })()}
        </group>
      )}
    </group>
  );
};
