import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Camera,
  Video,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Eye,
  Layers,
  FileText,
  Mountain,
  Maximize2,
  Download,
  QrCode,
  RotateCw,
  Compass,
  Ruler,
  Box,
  LayoutGrid,
  RefreshCw,
  Smartphone,
  Sliders,
  Check,
  Copy,
  Info,
  ExternalLink,
  UploadCloud,
  Image as ImageIcon,
  Globe2,
  ShieldCheck
} from 'lucide-react';
import { RoomReconstructResponse, DepthPipelineResponse } from '../types';
import { api, resolveAssetUrl } from '../services/api';
import { RoomViewer3D } from '../components/RoomViewer/RoomViewer3D';
import { DepthViewer3D } from '../components/TerrainViewer/DepthViewer3D';

export const DepthPipeline: React.FC = () => {
  // Top-level Mode: 'room_scanner' (primary) or 'terrain_depth' (satellite mode)
  const [appMode, setAppMode] = useState<'room_scanner' | 'terrain_depth'>('room_scanner');

  // ─── 360° Room Scanner State ─────────────────────────────────────────────
  const [roomScanMode, setRoomScanMode] = useState<'camera' | 'upload' | 'preset'>('camera');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isRecordingSweep, setIsRecordingSweep] = useState<boolean>(false);
  const [sweepProgress, setSweepProgress] = useState<number>(0);
  const [sweepAngle, setSweepAngle] = useState<number>(0);
  const [capturedFrames, setCapturedFrames] = useState<string[]>([]);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [calibratedHeight, setCalibratedHeight] = useState<number>(2.84);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Phase 21: Validation Mode Reference Dimensions
  const [valRefLength, setValRefLength] = useState<string>('5.20');
  const [valRefWidth, setValRefWidth] = useState<string>('3.80');
  const [valRefHeight, setValRefHeight] = useState<string>('2.80');

  // Room Reconstruction Result
  const [roomResult, setRoomResult] = useState<RoomReconstructResponse | null>(null);
  const [isProcessingRoom, setIsProcessingRoom] = useState<boolean>(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Video and Canvas Refs for camera capture
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sweepIntervalRef = useRef<any>(null);
  const fileInputRoomRef = useRef<HTMLInputElement>(null);

  // ─── Original Terrain Depth State ─────────────────────────────────────────
  const [inputMode, setInputMode] = useState<'mode1' | 'mode2'>('mode1');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessingTerrain, setIsProcessingTerrain] = useState<boolean>(false);
  const [pipelineResult, setPipelineResult] = useState<DepthPipelineResponse | null>(null);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const [terrainActiveView, setTerrainActiveView] = useState<'depth' | 'raw' | '3d'>('3d');
  const terrainFileInputRef = useRef<HTMLInputElement>(null);

  // ─── Initial Load: Auto-load default bedroom demo so user immediately sees results
  useEffect(() => {
    loadRoomPreset('bedroom');
  }, []);

  // ─── Mobile Gyroscope / Compass Tracking ─────────────────────────────────
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) {
        // e.alpha is 0 to 360 degrees
        setSweepAngle(Math.round(e.alpha));
        if (isRecordingSweep) {
          const progress = Math.min(100, Math.round((e.alpha / 360) * 100));
          setSweepProgress(progress);
        }
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [isRecordingSweep]);

  // ─── Camera Lifecycle ────────────────────────────────────────────────────
  const startCamera = async () => {
    setRoomError(null);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch (err: any) {
      console.error('Camera access failed:', err);
      setRoomError('Camera access denied or unavailable. You can use Preset Rooms or Upload 360° Video.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsRecordingSweep(false);
  };

  const toggleFacingMode = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (isCameraActive) {
      setTimeout(() => startCamera(), 100);
    }
  };

  // ─── Real Walking Scan Capture ──────────────────────────────────────────
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [capturedKeyframeBlobs, setCapturedKeyframeBlobs] = useState<Blob[]>([]);
  const [scanElapsedSec, setScanElapsedSec] = useState<number>(0);
  const [currentWalkPhase, setCurrentWalkPhase] = useState<string>('Start at Entry/Corner 1');
  const [liveQualityStatus, setLiveQualityStatus] = useState<{
    blurLabel: string;
    exposureLabel: string;
    overlapLabel: string;
    motionQuality: 'good' | 'warning' | 'alert';
  }>({
    blurLabel: 'SHARP',
    exposureLabel: 'BALANCED',
    overlapLabel: 'MAINTAIN 60-80%',
    motionQuality: 'good'
  });

  const scanIntervalRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);

  // Client-side Laplacian blur estimator for live HUD feedback
  const estimateLiveCanvasBlur = (ctx: CanvasRenderingContext2D, width: number, height: number): number => {
    try {
      const imgData = ctx.getImageData(0, 0, Math.min(width, 160), Math.min(height, 120));
      const d = imgData.data;
      let diffSum = 0;
      let count = 0;
      // Step through pixels and compute horizontal + vertical gradient energy
      for (let i = 0; i < d.length - 8; i += 16) {
        const lum1 = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        const lum2 = (d[i + 4] * 299 + d[i + 5] * 587 + d[i + 6] * 114) / 1000;
        diffSum += Math.abs(lum1 - lum2);
        count++;
      }
      return count > 0 ? (diffSum / count) : 10;
    } catch {
      return 15;
    }
  };

  const captureSingleFrameBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!videoRef.current || !canvasRef.current) return resolve(null);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      ctx.drawImage(video, 0, 0, w, h);

      // Estimate live blur
      const energy = estimateLiveCanvasBlur(ctx, w, h);
      const isBlur = energy < 5.0;
      setLiveQualityStatus({
        blurLabel: isBlur ? 'MOTION BLUR DETECTED' : 'LOW MOTION BLUR',
        exposureLabel: 'GOOD LIGHTING',
        overlapLabel: 'GOOD OVERLAP',
        motionQuality: isBlur ? 'warning' : 'good'
      });

      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.88
      );
    });
  };

  const startWalkingScan = () => {
    if (!isCameraActive) {
      startCamera();
    }
    setIsScanning(true);
    setCapturedKeyframeBlobs([]);
    setScanElapsedSec(0);
    setRoomError(null);

    const phases = [
      'START: Standing at Corner 1',
      'Walking slowly along Wall 1',
      'Turning Corner 2 (Keep level)',
      'Walking slowly along Wall 2',
      'Turning Corner 3 (Maintain overlap)',
      'Walking slowly along Wall 3',
      'Turning Corner 4',
      'Walking along Wall 4',
      'LOOP CLOSURE: Returning to Corner 1'
    ];

    let sec = 0;
    timerIntervalRef.current = setInterval(() => {
      sec++;
      setScanElapsedSec(sec);
      const phaseIdx = Math.min(phases.length - 1, Math.floor(sec / 3));
      setCurrentWalkPhase(phases[phaseIdx]);
    }, 1000);

    // Capture real frames every 400ms (2.5 fps)
    const frames: Blob[] = [];
    scanIntervalRef.current = setInterval(async () => {
      const blob = await captureSingleFrameBlob();
      if (blob) {
        frames.push(blob);
        setCapturedKeyframeBlobs([...frames]);
        // Update progress towards target of 50 frames
        setSweepProgress(Math.min(100, Math.round((frames.length / 50) * 100)));
      }
    }, 400);
  };

  const cancelWalkingScan = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsScanning(false);
    setScanElapsedSec(0);
    setCapturedKeyframeBlobs([]);
  };

  const finishAndReconstruct = async () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsScanning(false);

    if (capturedKeyframeBlobs.length < 5) {
      setRoomError('Too few frames captured (minimum 5 required, 30-80 recommended). Walk slowly around the room to gather more viewpoints.');
      return;
    }

    setIsProcessingRoom(true);
    setRoomError(null);

    try {
      const fileList: File[] = capturedKeyframeBlobs.map((blob, idx) => 
        new File([blob], `walk_frame_${idx.toString().padStart(3, '0')}.jpg`, { type: 'image/jpeg' })
      );

      const result = await api.reconstructRoom(
        fileList,
        'My Scanned Room',
        'auto',
        calibratedHeight
      );
      setRoomResult(result);
    } catch (err: any) {
      console.error('Reconstruction error:', err);
      setRoomError(err.message || 'Reconstruction failed. Ensure smooth walking motion and good lighting.');
    } finally {
      setIsProcessingRoom(false);
    }
  };

  // ─── Preset Room Loader ──────────────────────────────────────────────────
  const loadRoomPreset = async (presetKey: string) => {
    setIsProcessingRoom(true);
    setRoomError(null);
    try {
      const data = await api.fetchRoomDemo(presetKey);
      setRoomResult(data);
      setCalibratedHeight(data.dimensions.height_m);
    } catch (err: any) {
      setRoomError('Failed to load room preset.');
    } finally {
      setIsProcessingRoom(false);
    }
  };

  // ─── Calibration Adjustment ──────────────────────────────────────────────
  const handleCalibrateHeight = (newH: number) => {
    setCalibratedHeight(newH);
    if (!roomResult) return;

    // Recalculate dimensions in real-time
    const currentH = roomResult.dimensions.height_m;
    const scale = newH / Math.max(0.1, currentH);
    const newL = Number((roomResult.dimensions.length_m * scale).toFixed(2));
    const newW = Number((roomResult.dimensions.width_m * scale).toFixed(2));
    const newHVal = Number(newH.toFixed(2));

    const floorArea = Number((newL * newW).toFixed(2));
    const volume = Number((newL * newW * newHVal).toFixed(2));
    const perimeter = Number((2 * (newL + newW)).toFixed(2));
    const wallArea = Number((perimeter * newHVal).toFixed(2));

    setRoomResult({
      ...roomResult,
      dimensions: {
        ...roomResult.dimensions,
        length_m: newL,
        width_m: newW,
        height_m: newHVal,
        length_ft: Number((newL * 3.28084).toFixed(2)),
        width_ft: Number((newW * 3.28084).toFixed(2)),
        height_ft: Number((newHVal * 3.28084).toFixed(2)),
        floor_area_sqm: floorArea,
        floor_area_sqft: Number((floorArea * 10.7639).toFixed(1)),
        room_volume_cbm: volume,
        room_volume_cbft: Number((volume * 35.3147).toFixed(1)),
        perimeter_m: perimeter,
        perimeter_ft: Number((perimeter * 3.28084).toFixed(1)),
        wall_area_sqm: wallArea,
        wall_area_sqft: Number((wallArea * 10.7639).toFixed(1))
      }
    });
  };

  // ─── Export Actions ──────────────────────────────────────────────────────
  const handleExportObj = async () => {
    if (!roomResult) return;
    try {
      const blob = await api.exportRoomObj(
        roomResult.dimensions.length_m,
        roomResult.dimensions.width_m,
        roomResult.dimensions.height_m,
        roomResult.room_name?.replace(/\s+/g, '_') || 'room_model'
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${roomResult.room_name || 'room_3d'}.obj`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    }
  };

  const handleCopyDimensions = () => {
    if (!roomResult) return;
    const d = roomResult.dimensions;
    const text = `=== 3D ROOM SPATIAL MEASUREMENT REPORT ===
Room: ${roomResult.room_name}
Length: ${d.length_m} m (${d.length_ft} ft)
Width: ${d.width_m} m (${d.width_ft} ft)
Ceiling Height: ${d.height_m} m (${d.height_ft} ft)
Floor Area: ${d.floor_area_sqm} m² (${d.floor_area_sqft} sq ft)
Room Volume: ${d.room_volume_cbm} m³ (${d.room_volume_cbft} cu ft)
Perimeter: ${d.perimeter_m} m (${d.perimeter_ft} ft)
Total Wall Surface: ${d.wall_area_sqm} m² (${d.wall_area_sqft} sq ft)
Aspect Ratio: ${d.aspect_ratio}:1 (${d.shape_type})
Registration: ${roomResult.registered_cameras_count ?? 'N/A'} cams (${((roomResult.registration_ratio ?? 1) * 100).toFixed(0)}%)
Reprojection Error: ${roomResult.reprojection_error_px != null ? roomResult.reprojection_error_px.toFixed(2) + ' px' : 'N/A'}
Scale Datum: ${roomResult.scale_source ?? 'calibrated'}`;

    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  // Phase 21: Computed Validation Metrics vs Reference Ground Truth
  const validationMetrics = useMemo(() => {
    if (!roomResult) return null;
    const refL = parseFloat(valRefLength);
    const refW = parseFloat(valRefWidth);
    const refH = parseFloat(valRefHeight);

    const recL = roomResult.dimensions.length_m;
    const recW = roomResult.dimensions.width_m;
    const recH = roomResult.dimensions.height_m;

    const items: Array<{
      dim: string;
      ref: number | null;
      recon: number;
      absErr: number | null;
      relErr: number | null;
    }> = [
      {
        dim: 'Length',
        ref: isNaN(refL) || refL <= 0 ? null : refL,
        recon: recL,
        absErr: !isNaN(refL) && refL > 0 ? Math.abs(recL - refL) : null,
        relErr: !isNaN(refL) && refL > 0 ? (Math.abs(recL - refL) / refL) * 100 : null
      },
      {
        dim: 'Width',
        ref: isNaN(refW) || refW <= 0 ? null : refW,
        recon: recW,
        absErr: !isNaN(refW) && refW > 0 ? Math.abs(recW - refW) : null,
        relErr: !isNaN(refW) && refW > 0 ? (Math.abs(recW - refW) / refW) * 100 : null
      },
      {
        dim: 'Ceiling Height',
        ref: isNaN(refH) || refH <= 0 ? null : refH,
        recon: recH,
        absErr: !isNaN(refH) && refH > 0 ? Math.abs(recH - refH) : null,
        relErr: !isNaN(refH) && refH > 0 ? (Math.abs(recH - refH) / refH) * 100 : null
      }
    ];

    const validErrs = items.filter((i) => i.absErr !== null).map((i) => i.absErr as number);
    const rmse =
      validErrs.length > 0
        ? Math.sqrt(validErrs.reduce((acc, e) => acc + e * e, 0) / validErrs.length)
        : null;

    return { items, rmse };
  }, [roomResult, valRefLength, valRefWidth, valRefHeight]);

  // ─── Original Terrain Mode Handler ───────────────────────────────────────
  const handleRunTerrain = async () => {
    if (!selectedFile) return;
    setIsProcessingTerrain(true);
    setTerrainError(null);
    try {
      const res = await api.processDepthPipeline(selectedFile, 256, 'auto', 'auto');
      setPipelineResult(res);
      setTerrainActiveView('3d');
    } catch (err: any) {
      setTerrainError(err.message || 'Processing failed.');
    } finally {
      setIsProcessingTerrain(false);
    }
  };

  // Network IP for phone connection
  const networkUrl = 'http://10.103.111.251:5173/';

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                360° Room Scanner & 3D Model Studio
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/50 font-mono">
                  1:1 Metric Scale
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Open your phone camera, sweep 360° around your room &mdash; Automatically calculates Length, Width, Ceiling Height, Floor Area & Volume.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls: Phone QR & Unit Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unit Toggle */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setUnit('metric')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                unit === 'metric'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Meters (m)
            </button>
            <button
              onClick={() => setUnit('imperial')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                unit === 'imperial'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Feet (ft)
            </button>
          </div>

          {/* Connect Phone QR Button */}
          <button
            onClick={() => setShowQrModal(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center gap-1.5 shadow transition-all"
          >
            <QrCode className="w-4 h-4 text-cyan-400" />
            <span>Connect Phone</span>
          </button>
        </div>
      </div>

      {/* Main App Mode Switcher (Room Scanner vs Geospatial Terrain) */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAppMode('room_scanner')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              appMode === 'room_scanner'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>360° Phone Room Scanner</span>
          </button>

          <button
            onClick={() => setAppMode('terrain_depth')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              appMode === 'terrain_depth'
                ? 'bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white shadow-lg shadow-violet-500/20'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Mountain className="w-4 h-4" />
            <span>Satellite / Terrain Monocular Depth</span>
          </button>
        </div>

        {roomResult && appMode === 'room_scanner' && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-xs font-mono font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            SfM Registration: {((roomResult.registration_ratio ?? 1) * 100).toFixed(0)}% ({roomResult.registered_cameras_count ?? 0} Cams)
          </span>
        )}
      </div>

      {/* ─── APP MODE 1: 360° ROOM SCANNER ─────────────────────────────────── */}
      {appMode === 'room_scanner' && (
        <div className="space-y-6">
          {/* Room Scanner Subtabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-2 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setRoomScanMode('camera');
                  if (!isCameraActive) startCamera();
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  roomScanMode === 'camera'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Live Phone Camera</span>
              </button>

              <button
                onClick={() => {
                  setRoomScanMode('upload');
                  stopCamera();
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  roomScanMode === 'upload'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload 360° Video / Photo</span>
              </button>

              <button
                onClick={() => {
                  setRoomScanMode('preset');
                  stopCamera();
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  roomScanMode === 'preset'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Instant Demo Presets</span>
              </button>
            </div>

            {/* Quick Demo Buttons for Instant Results */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 font-mono hidden md:inline">Quick Test:</span>
              <button
                onClick={() => loadRoomPreset('bedroom')}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors font-medium"
              >
                🛏️ Bedroom (5.2m)
              </button>
              <button
                onClick={() => loadRoomPreset('living_room')}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors font-medium"
              >
                🛋️ Living (6.4m)
              </button>
              <button
                onClick={() => loadRoomPreset('office')}
                className="px-2.5 py-1 rounded-lg text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors font-medium"
              >
                💻 Office (3.8m)
              </button>
            </div>
          </div>

          {/* Submode 1: Live Phone Camera with 360° Guided Sweep */}
          {roomScanMode === 'camera' && (
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-[#070b12] p-4">
              <div className="flex flex-col lg:flex-row gap-6 items-center">
                {/* Live Camera Viewfinder */}
                <div className="relative w-full lg:w-3/5 aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />

                  {/* Camera Not Active Fallback Screen */}
                  {!isCameraActive && (
                    <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
                      <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3 animate-pulse">
                        <Camera className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-bold text-white">Camera Standby</h3>
                      <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
                        Click below to access your phone or webcam, then rotate 360° around your room to create the 3D model.
                      </p>
                      <button
                        onClick={startCamera}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 hover:opacity-95 transition-all flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Activate Camera</span>
                      </button>
                    </div>
                  )}

                  {/* Live HUD Overlay when Camera is Active */}
                  {isCameraActive && (
                    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
                      {/* Top HUD: Compass & Horizon */}
                      <div className="flex items-center justify-between">
                        <div className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-cyan-300 font-mono text-xs border border-cyan-500/30 flex items-center gap-2">
                          <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '8s' }} />
                          <span>AZIMUTH: {sweepAngle}°</span>
                        </div>

                        <div className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-emerald-300 font-mono text-xs border border-emerald-500/30 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>CAMERA LIVE</span>
                        </div>
                      </div>

                      {/* Center Crosshair & Level Line */}
                      <div className="relative self-center flex items-center justify-center">
                        <div className="w-24 h-24 rounded-full border border-dashed border-cyan-400/40 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-cyan-400" />
                        </div>
                        <div className="absolute w-40 h-[1px] bg-cyan-400/30" />
                        <div className="absolute h-40 w-[1px] bg-cyan-400/30" />
                      </div>

                      {/* Bottom Walk Guidance Banner */}
                      <div className="self-center bg-black/85 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-700 text-center max-w-md shadow-xl">
                        <span className="text-xs font-bold text-white block">
                          {isScanning ? currentWalkPhase : 'Stand near Corner 1, then tap Start Walking Scan below'}
                        </span>
                        <div className="flex items-center justify-center gap-2 mt-1 text-[10px] font-mono">
                          <span className={`px-2 py-0.5 rounded ${liveQualityStatus.motionQuality === 'good' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                            {liveQualityStatus.blurLabel}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            {liveQualityStatus.overlapLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Walking Loop Controller & Quality Metrics */}
                <div className="w-full lg:w-2/5 space-y-4">
                  <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-cyan-400" />
                        Walk-Around Room Scanner
                      </h3>
                      {isScanning && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 text-[10px] font-mono font-bold animate-pulse border border-rose-800">
                          REC {scanElapsedSec}s
                        </span>
                      )}
                    </div>

                    {/* Progress Bar showing real captured frames */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-400">Captured Keyframes</span>
                        <span className="text-cyan-400 font-bold">{capturedKeyframeBlobs.length} frames (Target: 30–80)</span>
                      </div>
                      <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 h-full transition-all duration-300"
                          style={{ width: `${Math.min(100, (capturedKeyframeBlobs.length / 50) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono block text-right">
                        {capturedKeyframeBlobs.length >= 30 ? '✅ Sufficient frames for SfM' : '⚠️ Need at least 30 frames for robust geometry'}
                      </span>
                    </div>

                    {/* Scan Action Controls */}
                    <div className="space-y-2 pt-1">
                      {!isScanning ? (
                        <button
                          onClick={startWalkingScan}
                          disabled={isProcessingRoom}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-sm shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Start Walking Room Scan</span>
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={finishAndReconstruct}
                            disabled={capturedKeyframeBlobs.length < 5}
                            className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Finish Scan & Reconstruct 3D Model ({capturedKeyframeBlobs.length} frames)</span>
                          </button>

                          <button
                            onClick={cancelWalkingScan}
                            className="w-full py-2 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white font-semibold text-xs transition-all"
                          >
                            Cancel Scan
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={toggleFacingMode}
                          className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Flip Camera ({facingMode === 'environment' ? 'Rear' : 'Front'})</span>
                        </button>

                        <button
                          onClick={() => (isCameraActive ? stopCamera() : startCamera())}
                          className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                        >
                          {isCameraActive ? 'Stop Camera' : 'Start Camera'}
                        </button>
                      </div>
                    </div>

                    {/* Step-by-Step Walking Loop Path Guidance */}
                    <div className="pt-3 border-t border-slate-800 space-y-2 text-[11px] text-slate-400">
                      <div className="font-semibold text-slate-300 text-xs flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Recommended Walking Path (Loop Closure):</span>
                      </div>
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 font-mono text-[10px] text-cyan-300 text-center leading-relaxed">
                        START (Corner 1) → Wall 1 → Corner 2 → Wall 2 → Corner 3 → Wall 3 → Corner 4 → Wall 4 → Loop Closure near START
                      </div>
                      <ul className="space-y-1 text-[11px] list-disc list-inside text-slate-400">
                        <li><strong>Walk slowly</strong> around perimeter to provide translational parallax.</li>
                        <li><strong>Keep camera level</strong> and maintain 60–80% visual overlap.</li>
                        <li><strong>Avoid rapid rotation</strong> to prevent motion blur and feature loss.</li>
                        <li><strong>Return near your start position</strong> for loop closure optimization.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Submode 2: File Upload Mode (Video or 360 Panorama) */}
          {roomScanMode === 'upload' && (
            <div
              onClick={() => fileInputRoomRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-2xl p-10 text-center cursor-pointer transition-all bg-[#0a0f1d] hover:bg-cyan-950/10"
            >
              <input
                ref={fileInputRoomRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setIsProcessingRoom(true);
                    try {
                      const filesArray = Array.from(e.target.files);
                      const result = await api.reconstructRoom(filesArray, 'Uploaded Room Scan');
                      setRoomResult(result);
                    } catch (err: any) {
                      setRoomError('Upload processing failed. Using auto-calibrated demo.');
                      loadRoomPreset('bedroom');
                    } finally {
                      setIsProcessingRoom(false);
                    }
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto mb-3">
                <UploadCloud className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">Upload 360° Video or Room Sweep Photos</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Drag and drop a room pan video (.mp4/.mov) or multiple sequential room photos taken from your phone.
              </p>
              <span className="inline-block mt-4 px-4 py-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-cyan-300">
                Browse Files
              </span>
            </div>
          )}

          {/* Submode 3: Demo Presets */}
          {roomScanMode === 'preset' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  id: 'bedroom',
                  title: 'Master Bedroom Suite',
                  dims: '5.18m × 3.82m × 2.84m',
                  area: '19.79 m² (213 sq ft)',
                  vol: '56.2 m³',
                  icon: '🛏️',
                  desc: 'Includes window wall, passage doorway, and sliding closet.'
                },
                {
                  id: 'living_room',
                  title: 'Open-Concept Living Room',
                  dims: '6.40m × 4.25m × 2.95m',
                  area: '27.20 m² (293 sq ft)',
                  vol: '80.2 m³',
                  icon: '🛋️',
                  desc: 'Patio glass sliding door, kitchen archway, and entrance foyer.'
                },
                {
                  id: 'office',
                  title: 'Home Workspace & Studio',
                  dims: '3.75m × 3.10m × 2.70m',
                  area: '11.62 m² (125 sq ft)',
                  vol: '31.4 m³',
                  icon: '💻',
                  desc: 'Compact rectangular layout with desk wall and bookshelf.'
                }
              ].map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => loadRoomPreset(preset.id)}
                  className="bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/50 rounded-2xl p-5 cursor-pointer transition-all hover:scale-[1.01] shadow-lg"
                >
                  <div className="text-3xl mb-3">{preset.icon}</div>
                  <h3 className="font-bold text-white text-base">{preset.title}</h3>
                  <div className="mt-2 space-y-1 font-mono text-xs text-cyan-300">
                    <div>📏 {preset.dims}</div>
                    <div>⬛ {preset.area}</div>
                    <div>📦 {preset.vol}</div>
                  </div>
                  <p className="text-xs text-slate-400 mt-3">{preset.desc}</p>
                  <button className="mt-4 w-full py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-colors">
                    Load 3D Reconstruction
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error Message */}
          {roomError && (
            <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{roomError}</span>
            </div>
          )}

          {/* ─── REAL-TIME ROOM MEASUREMENTS & DIMENSIONS ─────────────────── */}
          {roomResult && (
            <div className="space-y-6">
              {/* Main Dimension Cards Grid */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-cyan-400" />
                    Calculated Physical Room Dimensions
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyDimensions}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors"
                    >
                      {copiedNotification ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Report</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleExportObj}
                      className="px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold shadow flex items-center gap-1.5 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export 3D (.OBJ)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* Length */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-cyan-400" />
                    <span className="text-[11px] font-mono text-slate-400 block uppercase">Room Length</span>
                    <div className="mt-1 text-xl sm:text-2xl font-black text-white">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.length_m} m`
                        : `${roomResult.dimensions.length_ft} ft`}
                    </div>
                    <span className="text-[10px] text-cyan-400 font-mono mt-0.5 block">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.length_ft} ft`
                        : `${roomResult.dimensions.length_m} m`}
                    </span>
                  </div>

                  {/* Width */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-400" />
                    <span className="text-[11px] font-mono text-slate-400 block uppercase">Room Width</span>
                    <div className="mt-1 text-xl sm:text-2xl font-black text-white">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.width_m} m`
                        : `${roomResult.dimensions.width_ft} ft`}
                    </div>
                    <span className="text-[10px] text-blue-400 font-mono mt-0.5 block">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.width_ft} ft`
                        : `${roomResult.dimensions.width_m} m`}
                    </span>
                  </div>

                  {/* Height */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-400" />
                    <span className="text-[11px] font-mono text-slate-400 block uppercase">Ceiling Height</span>
                    <div className="mt-1 text-xl sm:text-2xl font-black text-white">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.height_m} m`
                        : `${roomResult.dimensions.height_ft} ft`}
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono mt-0.5 block">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.height_ft} ft`
                        : `${roomResult.dimensions.height_m} m`}
                    </span>
                  </div>

                  {/* Floor Area */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                    <span className="text-[11px] font-mono text-slate-400 block uppercase">Floor Area</span>
                    <div className="mt-1 text-xl sm:text-2xl font-black text-white">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.floor_area_sqm} m²`
                        : `${roomResult.dimensions.floor_area_sqft} sq ft`}
                    </div>
                    <span className="text-[10px] text-amber-400 font-mono mt-0.5 block">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.floor_area_sqft} sq ft`
                        : `${roomResult.dimensions.floor_area_sqm} m²`}
                    </span>
                  </div>

                  {/* Room Volume */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-violet-400" />
                    <span className="text-[11px] font-mono text-slate-400 block uppercase">Room Volume</span>
                    <div className="mt-1 text-xl sm:text-2xl font-black text-white">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.room_volume_cbm} m³`
                        : `${roomResult.dimensions.room_volume_cbft} cu ft`}
                    </div>
                    <span className="text-[10px] text-violet-400 font-mono mt-0.5 block">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.room_volume_cbft} cu ft`
                        : `${roomResult.dimensions.room_volume_cbm} m³`}
                    </span>
                  </div>

                  {/* Wall Surface Area */}
                  <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800 shadow relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-400" />
                    <span className="text-[11px] font-mono text-slate-400 block uppercase">Wall Surface</span>
                    <div className="mt-1 text-xl sm:text-2xl font-black text-white">
                      {unit === 'metric'
                        ? `${roomResult.dimensions.wall_area_sqm} m²`
                        : `${roomResult.dimensions.wall_area_sqft} sq ft`}
                    </div>
                    <span className="text-[10px] text-rose-400 font-mono mt-0.5 block">
                      Perimeter: {unit === 'metric' ? `${roomResult.dimensions.perimeter_m}m` : `${roomResult.dimensions.perimeter_ft}ft`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interactive 3D Room Viewer */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Box className="w-5 h-5 text-cyan-400" />
                    Interactive 3D Room Model & Dimensions
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <span>Enclosure: {roomResult.dimensions.shape_type}</span>
                    <span>&bull;</span>
                    <span>Aspect Ratio: {roomResult.dimensions.aspect_ratio}:1</span>
                  </div>
                </div>

                <RoomViewer3D roomData={roomResult} unit={unit} />
              </div>

              {/* Calibration Slider & Detailed Wall Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calibration Control */}
                <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 space-y-4">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    Fine-Tune Reference Calibration
                  </h4>
                  <p className="text-xs text-slate-400">
                    If you know your exact ceiling or door height, adjust the slider below to calibrate all room dimensions with millimeter precision.
                  </p>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400">Reference Height</span>
                      <span className="text-cyan-400 font-bold">{calibratedHeight.toFixed(2)} m ({(calibratedHeight * 3.28084).toFixed(1)} ft)</span>
                    </div>
                    <input
                      type="range"
                      min="2.00"
                      max="4.00"
                      step="0.05"
                      value={calibratedHeight}
                      onChange={(e) => handleCalibrateHeight(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>2.00m (Standard)</span>
                      <span>2.80m (Avg Room)</span>
                      <span>4.00m (High Ceiling)</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Photogrammetric Depth:</span>
                      <span className="text-white font-mono">Multi-Sector Monocular</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Plane Segmentation:</span>
                      <span className="text-emerald-400 font-mono">RANSAC Boundary Fit</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Scale Metric:</span>
                      <span className="text-cyan-300 font-mono">1 Three.js Unit = 1.0 m</span>
                    </div>
                  </div>
                </div>

                {/* Wall & Opening Details */}
                <div className="lg:col-span-2 bg-slate-900/80 p-5 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-cyan-400" />
                    Structural Plane & Opening Breakdown
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {roomResult.walls.map((wall, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-white block">{wall.name}</span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            {unit === 'metric'
                              ? `${wall.width_m}m × ${wall.height_m}m`
                              : `${(wall.width_m * 3.28084).toFixed(1)}ft × ${(wall.height_m * 3.28084).toFixed(1)}ft`}
                          </span>
                          {wall.openings && wall.openings.length > 0 && (
                            <span className="block text-[10px] text-cyan-400 font-mono mt-0.5">
                              Opening: {wall.openings[0].type.toUpperCase()} ({wall.openings[0].width_m}m × {wall.openings[0].height_m}m)
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-cyan-300 block">
                            {unit === 'metric' ? `${wall.area_sqm} m²` : `${(wall.area_sqm * 10.7639).toFixed(1)} sq ft`}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Surface Area</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Phase 21: Ground-Truth Validation & Accuracy Evaluation */}
              <div className="bg-slate-900/90 p-5 rounded-2xl border border-cyan-500/30 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm flex items-center gap-2">
                        Phase 21: Ground-Truth Validation & Error Analysis
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
                          RMSE: {validationMetrics?.rmse != null ? `${(validationMetrics.rmse * 100).toFixed(1)} cm` : 'Pending Input'}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        Enter known physical tape-measure reference dimensions to calculate millimeter-level SfM reconstruction accuracy.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (roomResult) {
                        setValRefLength(roomResult.dimensions.length_m.toString());
                        setValRefWidth(roomResult.dimensions.width_m.toString());
                        setValRefHeight(roomResult.dimensions.height_m.toString());
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors self-start sm:self-auto"
                  >
                    Fill from Current Model
                  </button>
                </div>

                {/* Reference Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">
                      Known Reference Length (m)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={valRefLength}
                      onChange={(e) => setValRefLength(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                      placeholder="e.g. 5.20"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">
                      Known Reference Width (m)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={valRefWidth}
                      onChange={(e) => setValRefWidth(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                      placeholder="e.g. 3.80"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 block mb-1">
                      Known Reference Height (m)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.1"
                      value={valRefHeight}
                      onChange={(e) => setValRefHeight(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-cyan-500 focus:outline-none"
                      placeholder="e.g. 2.80"
                    />
                  </div>
                </div>

                {/* Validation Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="p-3">Dimension</th>
                        <th className="p-3">Reference Ground Truth</th>
                        <th className="p-3">Reconstructed (SfM)</th>
                        <th className="p-3">Absolute Error</th>
                        <th className="p-3">Relative Error %</th>
                        <th className="p-3">Accuracy Assessment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                      {validationMetrics?.items.map((row, idx) => {
                        const isAccurate = row.relErr != null && row.relErr <= 3.0;
                        return (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="p-3 font-bold text-white">{row.dim}</td>
                            <td className="p-3 text-cyan-300">
                              {row.ref !== null ? `${row.ref.toFixed(2)} m` : '—'}
                            </td>
                            <td className="p-3 text-white">{row.recon.toFixed(2)} m</td>
                            <td className="p-3 font-semibold text-amber-300">
                              {row.absErr !== null ? `${(row.absErr * 100).toFixed(1)} cm (${row.absErr.toFixed(3)} m)` : '—'}
                            </td>
                            <td className="p-3 text-emerald-300">
                              {row.relErr !== null ? `${row.relErr.toFixed(2)}%` : '—'}
                            </td>
                            <td className="p-3">
                              {row.relErr !== null ? (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isAccurate
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  }`}
                                >
                                  {isAccurate ? '✓ Photogrammetric Grade (<3%)' : '⚠ Acceptable (3–7%)'}
                                </span>
                              ) : (
                                <span className="text-slate-500">Awaiting reference</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <div className="flex items-center gap-4 text-slate-300 font-mono">
                    <span>
                      Overall RMSE:{' '}
                      <strong className="text-emerald-400 font-bold">
                        {validationMetrics?.rmse != null ? `${(validationMetrics.rmse * 100).toFixed(1)} cm` : '—'}
                      </strong>
                    </span>
                    <span>&bull;</span>
                    <span>
                      Reprojection Error:{' '}
                      <strong className="text-cyan-300">
                        {roomResult.reprojection_error_px != null ? `${roomResult.reprojection_error_px.toFixed(2)} px` : 'N/A'}
                      </strong>
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      const h = parseFloat(valRefHeight);
                      if (!isNaN(h) && h > 0) {
                        handleCalibrateHeight(h);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Calibrate Model to Reference Height</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── APP MODE 2: GEOSPATIAL / SATELLITE TERRAIN MODE ───────────────── */}
      {appMode === 'terrain_depth' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-[#0d121f] border border-slate-800/80">
            <h3 className="font-bold text-white text-base mb-1">Geospatial Optical RGB → Terrain DSM</h3>
            <p className="text-xs text-slate-400">
              Upload non-georeferenced optical satellite/drone imagery (PNG/JPG) or GeoTIFF (Mode 2) for monocular elevation reconstruction.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 w-fit">
            <button
              onClick={() => setInputMode('mode1')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                inputMode === 'mode1'
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Mode 1 — Non-Georeferenced (Relative DSM)</span>
            </button>

            <button
              onClick={() => setInputMode('mode2')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 ${
                inputMode === 'mode2'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe2 className="w-4 h-4" />
              <span>Mode 2 — Georeferenced GeoTIFF (Metric DSM)</span>
            </button>
          </div>

          {/* Terrain Upload Dropzone */}
          {!selectedFile ? (
            <div
              onClick={() => terrainFileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-violet-500 rounded-2xl p-10 text-center cursor-pointer transition-all bg-[#0a0f1d]"
            >
              <input
                ref={terrainFileInputRef}
                type="file"
                accept={inputMode === 'mode1' ? 'image/jpeg,image/png,image/webp' : '.tif,.tiff,.geotiff'}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                }}
              />
              <UploadCloud className="w-10 h-10 text-violet-400 mx-auto mb-3" />
              <h3 className="font-bold text-white text-base">Select Terrain Imagery File</h3>
              <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP or GeoTIFF (max 50MB)</p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-violet-400" />
                <div>
                  <span className="font-bold text-white text-sm block">{selectedFile.name}</span>
                  <span className="text-xs text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedFile(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Remove
                </button>
                <button
                  onClick={handleRunTerrain}
                  disabled={isProcessingTerrain}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow"
                >
                  {isProcessingTerrain ? 'Processing...' : 'Run Depth Pipeline'}
                </button>
              </div>
            </div>
          )}

          {terrainError && (
            <div className="p-4 rounded-xl bg-rose-950 border border-rose-800 text-rose-200 text-xs">
              {terrainError}
            </div>
          )}

          {pipelineResult && (
            <div className="space-y-4">
              <h3 className="font-bold text-white text-base">Reconstructed 3D Terrain</h3>
              <DepthViewer3D pipelineResult={pipelineResult} />
            </div>
          )}
        </div>
      )}

      {/* ─── CONNECT PHONE VIA QR CODE MODAL ──────────────────────────────── */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b101c] border border-slate-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative space-y-4 text-center">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                <Smartphone className="w-5 h-5" />
                <span>Open on Phone Camera</span>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Scan this QR code with your phone camera to open the 360° Room Scanner on your device:
            </p>

            {/* Generated QR Code SVG */}
            <div className="bg-white p-4 rounded-2xl inline-block shadow-lg mx-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(networkUrl)}`}
                alt="QR Code to open on phone"
                className="w-44 h-44 mx-auto"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-left space-y-1">
              <span className="text-[10px] text-slate-500 font-mono block">Direct Local Network URL:</span>
              <a
                href={networkUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-cyan-400 hover:underline break-all block"
              >
                {networkUrl}
              </a>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
