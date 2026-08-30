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
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.2, 0.05, 8, 16]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.8} />
          </mesh>
          {/* Glowing Sphere Head */}
          <mesh position={[0, 8, 0]}>
            <sphereGeometry args={[1.2, 16, 16]} />
            <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.5} roughness={0.1} />
          </mesh>
          {/* Base beacon ring on terrain */}
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 1.8, 32]} />
            <meshBasicMaterial color="#00e5ff" side={THREE.DoubleSide} transparent opacity={0.6} />
          </mesh>

          {/* HTML Billboard Label */}
          {pointAData && (
            <Html position={[0, 11, 0]} center distanceFactor={80}>
              <div className="bg-slate-950/95 border border-cyan-400 rounded-xl px-3 py-2 text-[11px] shadow-2xl backdrop-blur-md pointer-events-none whitespace-nowrap space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <strong className="text-cyan-300 font-bold tracking-wider">POINT A</strong>
                </div>
                <div className="text-slate-200 font-mono text-xs font-semibold">
                  {pointAData.elevation} m
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {pointAData.latitude}°, {pointAData.longitude}°
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
          <mesh position={[0, 4, 0]}>
            <cylinderGeometry args={[0.2, 0.05, 8, 16]} />
            <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={0.8} />
          </mesh>
          {/* Glowing Sphere Head */}
          <mesh position={[0, 8, 0]}>
            <sphereGeometry args={[1.2, 16, 16]} />
            <meshStandardMaterial color="#f43f5e" emissive="#f43f5e" emissiveIntensity={1.5} roughness={0.1} />
          </mesh>
          {/* Base beacon ring on terrain */}
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.8, 1.8, 32]} />
            <meshBasicMaterial color="#f43f5e" side={THREE.DoubleSide} transparent opacity={0.6} />
          </mesh>

          {/* HTML Billboard Label */}
          {pointBData && (
            <Html position={[0, 11, 0]} center distanceFactor={80}>
              <div className="bg-slate-950/95 border border-rose-400 rounded-xl px-3 py-2 text-[11px] shadow-2xl backdrop-blur-md pointer-events-none whitespace-nowrap space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse" />
                  <strong className="text-rose-300 font-bold tracking-wider">POINT B</strong>
                </div>
                <div className="text-slate-200 font-mono text-xs font-semibold">
                  {pointBData.elevation} m
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {pointBData.latitude}°, {pointBData.longitude}°
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
            const start = pointAPos.clone().add(new THREE.Vector3(0, 8, 0));
            const end = pointBPos.clone().add(new THREE.Vector3(0, 8, 0));
            const mid = start.clone().lerp(end, 0.5);
            const dist = start.distanceTo(end);
            const dir = end.clone().sub(start).normalize();
            const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

            return (
              <group position={mid} quaternion={quat}>
                <mesh>
                  <cylinderGeometry args={[0.2, 0.2, dist, 8]} />
                  <meshBasicMaterial color="#38bdf8" transparent opacity={0.85} />
                </mesh>

                {/* Measurement Badge Floating at midpoint */}
                {measurement && (
                  <Html position={[0, 0, 0]} center distanceFactor={70}>
                    <div className="bg-slate-950/95 border border-cyan-400/80 rounded-xl px-4 py-2 text-center shadow-2xl backdrop-blur-md pointer-events-none whitespace-nowrap font-mono space-y-0.5">
                      <div className="text-xs font-bold text-cyan-300">
                        Δh: {measurement.height_difference > 0 ? `+${measurement.height_difference}` : measurement.height_difference} m
                      </div>
                      <div className="text-[10px] text-slate-300">
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
