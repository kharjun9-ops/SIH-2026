import React, { useRef, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TerrainReconstructResponse } from '../../types';

export interface DroneTelemetry {
  speed: number;
  altitudeAGL: number;
  altitudeMSL: number;
  headingDeg: number;
  pitchDeg: number;
  x_m: number;
  z_m: number;
}

interface FlyDroneControlsProps {
  terrainData: TerrainReconstructResponse;
  exaggeration?: number;
  enabled: boolean;
  onTelemetry?: (telemetry: DroneTelemetry) => void;
  initialSpeed?: number;
}

export const FlyDroneControls: React.FC<FlyDroneControlsProps> = ({
  terrainData,
  exaggeration = 1.0,
  enabled,
  onTelemetry,
  initialSpeed = 60,
}) => {
  const { camera, gl } = useThree();

  const keys = useRef<{ [key: string]: boolean }>({});
  const speedRef = useRef<number>(initialSpeed);
  const isDragging = useRef<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Camera orientation angles in radians
  const yawRef = useRef<number>(0);
  const pitchRef = useRef<number>(-0.3);

  // Synchronize initial Euler angles from current camera direction
  useEffect(() => {
    if (!enabled) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // Yaw: horizontal angle (in XZ plane)
    yawRef.current = Math.atan2(-dir.x, -dir.z);
    // Pitch: vertical angle
    pitchRef.current = Math.asin(Math.max(-0.99, Math.min(0.99, dir.y)));
  }, [enabled, camera]);

  // Sample local ground elevation at (x, z)
  const sampleGroundY = useCallback((x: number, z: number): number => {
    const mb = terrainData.metric_bounds;
    const grid = terrainData.elevation_grid;
    if (!grid || grid.length === 0) return 0;

    const r = grid.length;
    const c = grid[0].length;
    const halfW = mb.width_m / 2.0;
    const halfH = mb.height_m / 2.0;

    const normX = Math.min(1.0, Math.max(0.0, (x + halfW) / (halfW * 2.0)));
    const normZ = Math.min(1.0, Math.max(0.0, (z + halfH) / (halfH * 2.0)));

    const colF = Math.min(c - 1, Math.max(0.0, normX * (c - 1)));
    const rowF = Math.min(r - 1, Math.max(0.0, normZ * (r - 1)));

    const c0 = Math.floor(colF);
    const c1 = Math.min(c - 1, c0 + 1);
    const r0 = Math.floor(rowF);
    const r1 = Math.min(r - 1, r0 + 1);

    const dc = colF - c0;
    const dr = rowF - r0;

    const rawElev = (
      grid[r0][c0] * (1 - dr) * (1 - dc) +
      grid[r0][c1] * (1 - dr) * dc +
      grid[r1][c0] * dr * (1 - dc) +
      grid[r1][c1] * dr * dc
    );

    const minE = terrainData.stats.min_elevation;
    return (rawElev - minE) * exaggeration;
  }, [terrainData, exaggeration]);

  // Keyboard Event Listeners
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent browser scrolling with arrow keys / space
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      keys.current[e.code] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [enabled]);

  // Mouse drag look & wheel speed listeners
  useEffect(() => {
    if (!enabled) return;
    const domElement = gl.domElement;

    const handleMouseDown = (e: MouseEvent) => {
      // Allow primary or secondary mouse button for look
      if (e.button === 0 || e.button === 2) {
        isDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      const sensitivity = 0.003;
      yawRef.current += dx * sensitivity;
      pitchRef.current -= dy * sensitivity;

      // Clamp pitch so camera doesn't flip upside down (-85 to +85 deg)
      const maxPitch = (85 * Math.PI) / 180;
      pitchRef.current = Math.max(-maxPitch, Math.min(maxPitch, pitchRef.current));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scroll adjusts drone flight speed (10 m/s to 500 m/s)
      const step = speedRef.current > 100 ? 25 : 10;
      if (e.deltaY < 0) {
        speedRef.current = Math.min(500, speedRef.current + step);
      } else {
        speedRef.current = Math.max(10, speedRef.current - step);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    domElement.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    domElement.addEventListener('wheel', handleWheel, { passive: false });
    domElement.addEventListener('contextmenu', handleContextMenu);

    return () => {
      domElement.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      domElement.removeEventListener('wheel', handleWheel);
      domElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, gl]);

  // Frame update loop: moves camera and updates telemetry
  const lastTelemetryTime = useRef<number>(0);

  useFrame((_, delta) => {
    if (!enabled) return;

    // Apply rotation from yaw & pitch
    const euler = new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Compute forward, right, up vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);

    const isBoost = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
    const currentSpeed = speedRef.current * (isBoost ? 2.5 : 1.0);
    const moveDist = currentSpeed * Math.min(delta, 0.1);

    const moveVector = new THREE.Vector3();

    // W / S (Forward / Backward)
    if (keys.current['KeyW'] || keys.current['ArrowUp']) moveVector.add(forward);
    if (keys.current['KeyS'] || keys.current['ArrowDown']) moveVector.sub(forward);

    // A / D (Strafe Left / Right)
    if (keys.current['KeyA'] || keys.current['ArrowLeft']) moveVector.sub(right);
    if (keys.current['KeyD'] || keys.current['ArrowRight']) moveVector.add(right);

    // E / Space (Ascend)
    if (keys.current['KeyE'] || keys.current['Space']) moveVector.add(up);

    // Q / Ctrl / C (Descend)
    if (keys.current['KeyQ'] || keys.current['ControlLeft'] || keys.current['KeyC']) moveVector.sub(up);

    if (moveVector.lengthSq() > 0.0001) {
      moveVector.normalize().multiplyScalar(moveDist);
      camera.position.add(moveVector);
    }

    // Minimum Altitude Clamping: keep drone at least 5m above terrain
    const groundY = sampleGroundY(camera.position.x, camera.position.z);
    const minDroneY = groundY + 5.0;
    if (camera.position.y < minDroneY) {
      camera.position.y = minDroneY;
    }

    // Calculate Telemetry
    const now = performance.now();
    if (now - lastTelemetryTime.current > 60 && onTelemetry) {
      lastTelemetryTime.current = now;

      // Heading in degrees: 0 = North (-Z), 90 = East (+X), 180 = South (+Z), 270 = West (-X)
      const headingRad = (Math.PI - yawRef.current) % (Math.PI * 2);
      const headingDeg = (headingRad * 180.0) / Math.PI;
      const normalizedHeading = (headingDeg + 360) % 360;

      const pitchDeg = (pitchRef.current * 180.0) / Math.PI;
      const altitudeAGL = Math.max(0, camera.position.y - groundY);
      const altitudeMSL = terrainData.stats.min_elevation + (camera.position.y / Math.max(0.1, exaggeration));

      onTelemetry({
        speed: Math.round(currentSpeed),
        altitudeAGL: Math.round(altitudeAGL),
        altitudeMSL: Math.round(altitudeMSL),
        headingDeg: Math.round(normalizedHeading),
        pitchDeg: Math.round(pitchDeg),
        x_m: Math.round(camera.position.x),
        z_m: Math.round(camera.position.z),
      });
    }
  });

  return null;
};
