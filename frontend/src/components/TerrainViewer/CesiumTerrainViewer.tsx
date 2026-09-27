import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { 
  Compass, 
  RotateCcw, 
  Ruler, 
  MapPin, 
  Eye, 
  ShieldCheck, 
  AlertTriangle, 
  Layers, 
  Maximize2, 
  Minimize2, 
  Navigation,
  Globe2,
  Sparkles,
  Mountain,
  RefreshCw,
  Info,
  Plane,
  Move3d,
  Crosshair,
  Gauge,
  Box
} from 'lucide-react';
import { LatLonBounds, SampleRegion } from '../../types';
import { api } from '../../services/api';

interface CesiumTerrainViewerProps {
  bounds: LatLonBounds;
  centerLat: number;
  centerLon: number;
  radiusMeters: number;
  selectedSample?: string;
}

interface InspectionData {
  latitude: number;
  longitude: number;
  visualSurfaceHeight: number;
  authoritativeElevation: number | null;
  elevationDelta: number | null;
  elevationProvider: string;
  isLoadingAuthoritative: boolean;
}

interface MeasurementData {
  pointA: { lat: number; lon: number; height: number; cartesian: Cesium.Cartesian3 };
  pointB?: { lat: number; lon: number; height: number; cartesian: Cesium.Cartesian3 };
  euclideanDistance?: number;
  geodesicDistance?: number;
  elevationDiff?: number;
}

interface DroneTelemetry {
  speed: number;
  altitudeMSL: number;
  headingDeg: number;
  latitude: number;
  longitude: number;
}

export const CesiumTerrainViewer: React.FC<CesiumTerrainViewerProps> = ({
  bounds,
  centerLat,
  centerLon,
  radiusMeters,
  selectedSample,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const orbitIntervalRef = useRef<number | null>(null);
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const lastFlownKeyRef = useRef<string>('');

  // Status & Provider State
  const [providerName, setProviderName] = useState<string>('Detecting Provider...');
  const [isLoadingTiles, setIsLoadingTiles] = useState<boolean>(true);
  const [providerError, setProviderError] = useState<string | null>(null);
  
  // Interactive Navigation & Camera Modes
  const [cameraMode, setCameraMode] = useState<'orbit' | 'fly'>('orbit');
  const [orbitDragMode, setOrbitDragMode] = useState<'orbit3d' | 'pan'>('orbit3d');
  const [autoSlideWithCursor, setAutoSlideWithCursor] = useState<boolean>(true);
  const cursorNormPosRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const isHoveringRef = useRef<boolean>(false);
  const [activeTool, setActiveTool] = useState<'inspect' | 'measure' | 'navigate'>('navigate');
  const [isOrbiting, setIsOrbiting] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Drone Fly Telemetry & Motion Refs
  const [telemetry, setTelemetry] = useState<DroneTelemetry>({
    speed: 80,
    altitudeMSL: 0,
    headingDeg: 0,
    latitude: 0,
    longitude: 0,
  });
  const flightSpeedRef = useRef<number>(80);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const isMouseDownRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const headingRef = useRef<number>(0);
  const pitchRef = useRef<number>(-0.3);

  // Inspection & Measurement State
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementData | null>(null);

  // Particular Area 3D Isolation: isolates ONLY the selected bounding box in 3D (no whole planet Earth)
  const [isolateArea, setIsolateArea] = useState<boolean>(false);
  const activeTilesetRef = useRef<Cesium.Cesium3DTileset | null>(null);

  // Read environment keys
  const cesiumIonToken = (import.meta.env.VITE_CESIUM_ION_TOKEN as string || '').trim();
  const googleMapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string || '').trim();

  // Helper: Strictly isolate the selected area in 3D by clipping globe terrain, imagery, atmosphere, and 3D tilesets
  const applyAreaClipping = useCallback((v: Cesium.Viewer, b: LatLonBounds, isolate: boolean) => {
    if (!v || v.isDestroyed()) return;

    if (isolate) {
      // 1. Strictly clip globe terrain and imagery to the selected bounding box
      const limitRectangle = Cesium.Rectangle.fromDegrees(
        b.min_lon,
        b.min_lat,
        b.max_lon,
        b.max_lat
      );
      v.scene.globe.cartographicLimitRectangle = limitRectangle;

      // 2. Hide whole-planet atmosphere so the Earth sphere does not float in space
      if (v.scene.skyAtmosphere) {
        v.scene.skyAtmosphere.show = false;
      }
      v.scene.globe.showGroundAtmosphere = false;
      v.scene.globe.baseColor = Cesium.Color.fromCssColorString('#070b14');
      v.scene.backgroundColor = Cesium.Color.fromCssColorString('#050810');
      v.scene.globe.backFaceCulling = false;
      v.scene.globe.showSkirts = true;

      // 3. Clip any active 3D Tileset (OSM Buildings or Google 3D Tiles) to the exact bounding box
      if (activeTilesetRef.current) {
        try {
          const poly = new Cesium.ClippingPolygon({
            positions: Cesium.Cartesian3.fromDegreesArray([
              b.min_lon, b.min_lat,
              b.max_lon, b.min_lat,
              b.max_lon, b.max_lat,
              b.min_lon, b.max_lat,
            ]),
          });
          activeTilesetRef.current.clippingPolygons = new Cesium.ClippingPolygonCollection({
            polygons: [poly],
            inverse: true, // inverse=true clips everything OUTSIDE this bounding polygon
          });
        } catch (e) {
          console.warn('Could not clip 3D tileset to area polygon:', e);
        }
      }
    } else {
      // Restore full planet globe
      v.scene.globe.cartographicLimitRectangle = Cesium.Rectangle.MAX_VALUE;
      if (v.scene.skyAtmosphere) {
        v.scene.skyAtmosphere.show = true;
      }
      v.scene.globe.showGroundAtmosphere = true;
      v.scene.globe.baseColor = Cesium.Color.GRAY;
      if (activeTilesetRef.current) {
        activeTilesetRef.current.clippingPolygons = undefined as any;
      }
    }
  }, []);

  // Helper: Smooth fly-to selected bounds
  const flyToCurrentBounds = useCallback((v: Cesium.Viewer, currentBounds: LatLonBounds, pitchDeg = -38) => {
    if (!v || v.isDestroyed()) return;

    const rectangle = Cesium.Rectangle.fromDegrees(
      currentBounds.min_lon,
      currentBounds.min_lat,
      currentBounds.max_lon,
      currentBounds.max_lat
    );

    v.camera.flyTo({
      destination: rectangle,
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: Cesium.Math.toRadians(pitchDeg),
        roll: 0.0,
      },
      duration: 2.0,
    });
  }, []);

  // Helper: Update Area Boundary Box Entity
  const updateAreaBoundaryEntity = useCallback((v: Cesium.Viewer, b: LatLonBounds, isolate: boolean) => {
    if (!v || v.isDestroyed()) return;

    // Remove old rectangle
    const existing = v.entities.getById('selected-area-boundary');
    if (existing) v.entities.remove(existing);

    v.entities.add({
      id: 'selected-area-boundary',
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(b.min_lon, b.min_lat, b.max_lon, b.max_lat),
        material: isolate ? Cesium.Color.TRANSPARENT : Cesium.Color.CYAN.withAlpha(0.06),
        outline: true,
        outlineColor: Cesium.Color.CYAN.withAlpha(0.85),
        outlineWidth: 2.5,
        height: 0,
      }
    });
  }, []);

  // Dynamic Camera Controller Configuration for 3D Orbit / Pan
  const updateControllerMappings = useCallback((v: Cesium.Viewer, mode: 'orbit3d' | 'pan') => {
    if (!v || v.isDestroyed()) return;
    const c = v.scene.screenSpaceCameraController;
    c.enableInputs = true;
    c.enableRotate = true;
    c.enableTranslate = true;
    c.enableZoom = true;
    c.enableTilt = true;
    c.enableLook = true;
    // CRITICAL: Disable collision detection so camera never gets stuck against terrain
    c.enableCollisionDetection = false;
    c.minimumZoomDistance = 1.0;
    c.maximumZoomDistance = isolateArea ? 60000.0 : 100000000.0;
    c.inertiaSpin = 0.85;
    c.inertiaZoom = 0.85;

    // Use pinch on mobile, but disable default Cesium wheel zoom
    // so our custom Zoom-and-Slide handler takes full effect
    c.zoomEventTypes = [Cesium.CameraEventType.PINCH];

    if (mode === 'orbit3d') {
      // 3D Orbit Drag: Left Drag tilts & orbits in full 3D around the terrain point clicked!
      c.tiltEventTypes = [
        Cesium.CameraEventType.LEFT_DRAG,
        Cesium.CameraEventType.RIGHT_DRAG,
        Cesium.CameraEventType.MIDDLE_DRAG,
      ];
      // Right Drag: Pan across the terrain
      c.translateEventTypes = [Cesium.CameraEventType.RIGHT_DRAG];
      c.rotateEventTypes = [];
    } else {
      // Pan Drag: Left Drag pans across the terrain
      c.translateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
      c.rotateEventTypes = [Cesium.CameraEventType.LEFT_DRAG];
      // Right Drag & Middle Drag & Shift+Left Drag tilt & orbit in 3D
      c.tiltEventTypes = [
        Cesium.CameraEventType.RIGHT_DRAG,
        Cesium.CameraEventType.MIDDLE_DRAG,
        { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.SHIFT },
        { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
      ];
    }
  }, []);

  // 1. Initialize Cesium Viewer
  useEffect(() => {
    if (!containerRef.current) return;

    if (cesiumIonToken) {
      Cesium.Ion.defaultAccessToken = cesiumIonToken;
    }

    let viewer: Cesium.Viewer;
    try {
      viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        navigationInstructionsInitiallyVisible: false,
        scene3DOnly: true,
        msaaSamples: 4,
      });
      viewerRef.current = viewer;

      // Enhance atmosphere, lighting, and depth testing
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.highDynamicRange = true;
      if (viewer.scene.postProcessStages?.fxaa) {
        viewer.scene.postProcessStages.fxaa.enabled = true;
      }

      // Configure default controller
      updateControllerMappings(viewer, orbitDragMode);

      // Load Photorealistic 3D Tiles Provider
      loadPhotorealisticTiles(viewer);

      // Add boundary, apply area clipping, and fly to initial bounds
      applyAreaClipping(viewer, bounds, isolateArea);
      updateAreaBoundaryEntity(viewer, bounds, isolateArea);
      const initKey = `${bounds.min_lat.toFixed(4)},${bounds.max_lat.toFixed(4)},${bounds.min_lon.toFixed(4)},${bounds.max_lon.toFixed(4)}`;
      lastFlownKeyRef.current = initKey;
      flyToCurrentBounds(viewer, bounds);

    } catch (err: any) {
      console.error('Cesium initialization failed:', err);
      setProviderError(err.message || 'Failed to initialize Cesium 3D Globe');
      return;
    }

    // ResizeObserver for clean responsive canvas resizing
    const resizeObserver = new ResizeObserver(() => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.resize();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (orbitIntervalRef.current) {
        clearInterval(orbitIntervalRef.current);
      }
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // 2. Load 3D Tiles Provider (Priority: Google Photorealistic 3D Tiles -> Cesium ion -> Fallback)
  const loadPhotorealisticTiles = async (v: Cesium.Viewer) => {
    setIsLoadingTiles(true);
    setProviderError(null);

    // Priority 1: Direct Google Photorealistic 3D Tiles (if a valid Google Maps API Key is configured)
    const hasValidGoogleKey = !!googleMapsApiKey && 
      !googleMapsApiKey.includes('your_google_maps_api_key_here') && 
      googleMapsApiKey.trim().length > 20;

    if (hasValidGoogleKey) {
      try {
        Cesium.GoogleMaps.defaultApiKey = googleMapsApiKey;
        const googleTileset = await Cesium.createGooglePhotorealistic3DTileset(googleMapsApiKey, {
          showCreditsOnScreen: true,
        });

        const anyTileset = googleTileset as any;
        if (anyTileset.errorEvent) {
          anyTileset.errorEvent.addEventListener((error: any) => {
            console.warn('Google 3D Tileset errorEvent:', error);
            setProviderError(`Google 3D Tiles loading issue: ${error?.message || 'Network error'}`);
          });
        }
        if (anyTileset.tileFailed) {
          anyTileset.tileFailed.addEventListener((error: any) => {
            console.warn('Google 3D Tileset tileFailed:', error);
          });
        }

        v.scene.primitives.add(googleTileset);
        activeTilesetRef.current = googleTileset as Cesium.Cesium3DTileset;
        setProviderName('Google Photorealistic 3D Tiles');
        applyAreaClipping(v, bounds, isolateArea);
        setIsLoadingTiles(false);
        return;
      } catch (err: any) {
        console.warn('Google Photorealistic 3D Tiles with API key failed, falling back to Cesium ion:', err);
      }
    }

    // Priority 2: Google Photorealistic 3D Tiles via Cesium ion
    if (cesiumIonToken) {
      try {
        Cesium.Ion.defaultAccessToken = cesiumIonToken;
        
        // 2a. Try Cesium Ion Google Photorealistic 3D Tiles (Asset ID 2275207)
        try {
          const googleIonTileset = await Cesium.Cesium3DTileset.fromIonAssetId(2275207, {
            showCreditsOnScreen: true,
          });
          v.scene.primitives.add(googleIonTileset);
          activeTilesetRef.current = googleIonTileset;
          setProviderName('Google Photorealistic 3D Tiles (Cesium ion)');
          applyAreaClipping(v, bounds, isolateArea);
          setIsLoadingTiles(false);
          return;
        } catch (ionErr) {
          console.warn('Cesium ion Asset 2275207 failed, trying default createGooglePhotorealistic3DTileset():', ionErr);
        }

        // 2b. Try Cesium.createGooglePhotorealistic3DTileset() without explicit key (uses Ion)
        try {
          const defaultGoogleTileset = await Cesium.createGooglePhotorealistic3DTileset();
          v.scene.primitives.add(defaultGoogleTileset);
          activeTilesetRef.current = defaultGoogleTileset;
          setProviderName('Google Photorealistic 3D Tiles');
          applyAreaClipping(v, bounds, isolateArea);
          setIsLoadingTiles(false);
          return;
        } catch (defaultGoogleErr) {
          console.warn('createGooglePhotorealistic3DTileset() failed:', defaultGoogleErr);
        }

        // 2c. Fallback to high-detail OSM 3D Buildings + World Terrain
        const osmBuildings = await Cesium.createOsmBuildingsAsync();
        v.scene.primitives.add(osmBuildings);
        activeTilesetRef.current = osmBuildings;

        const terrain = await Cesium.createWorldTerrainAsync();
        v.terrainProvider = terrain;

        setProviderName('Cesium ion 3D Buildings + World Terrain');
        applyAreaClipping(v, bounds, isolateArea);
        setIsLoadingTiles(false);
        return;
      } catch (err: any) {
        console.warn('Cesium ion 3D Tiles initialization failed:', err);
      }
    }

    // Fallback Notice
    setIsLoadingTiles(false);
    const msg = 'No Photorealistic 3D API key configured (VITE_GOOGLE_MAPS_API_KEY or VITE_CESIUM_ION_TOKEN).';
    setProviderError(msg);
    setProviderName('Photorealistic 3D Unavailable');
  };

  // 3. Handle Bounds / Area Change or Isolation Toggle — Clip strictly to area & refly when coordinates change
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    applyAreaClipping(viewerRef.current, bounds, isolateArea);
    updateAreaBoundaryEntity(viewerRef.current, bounds, isolateArea);

    const boundsKey = `${bounds.min_lat.toFixed(4)},${bounds.max_lat.toFixed(4)},${bounds.min_lon.toFixed(4)},${bounds.max_lon.toFixed(4)}`;
    if (lastFlownKeyRef.current !== boundsKey) {
      lastFlownKeyRef.current = boundsKey;
      flyToCurrentBounds(viewerRef.current, bounds);
    }
  }, [bounds, isolateArea, applyAreaClipping, flyToCurrentBounds, updateAreaBoundaryEntity]);

  // 4. Update Camera Controller when Camera Mode or Orbit Drag Mode changes
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;

    if (cameraMode === 'orbit') {
      updateControllerMappings(v, orbitDragMode);
    } else {
      // Drone Fly mode: disable screenSpaceCameraController so it doesn't fight custom flight controls
      v.scene.screenSpaceCameraController.enableInputs = false;
      headingRef.current = v.camera.heading;
      pitchRef.current = Math.max(-1.45, Math.min(1.45, v.camera.pitch));
    }
  }, [cameraMode, orbitDragMode, updateControllerMappings]);

  // 5. Orbit Mode: Zoom-and-Slide on Wheel + Auto-Slide with Cursor movement
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed() || cameraMode !== 'orbit') return;

    const container = containerRef.current;
    if (!container) return;

    let lastTime = performance.now();

    // A. Wheel Zoom-and-Slide (Zoom in/out AND slide towards cursor position simultaneously)
    const handleWheelZoomAndSlide = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const mousePos = new Cesium.Cartesian2(mouseX, mouseY);

      // Raycast to find the 3D surface point directly under cursor
      const ray = v.camera.getPickRay(mousePos);
      let targetCartesian: Cesium.Cartesian3 | null | undefined = null;
      if (ray) {
        targetCartesian = v.scene.pickPosition(mousePos);
        if (!targetCartesian) {
          targetCartesian = v.scene.globe.pick(ray, v.scene);
        }
        if (!targetCartesian) {
          targetCartesian = v.camera.pickEllipsoid(mousePos, v.scene.globe.ellipsoid);
        }
      }

      const cameraPos = v.camera.position;
      if (targetCartesian) {
        const direction = Cesium.Cartesian3.subtract(targetCartesian, cameraPos, new Cesium.Cartesian3());
        const distance = Cesium.Cartesian3.magnitude(direction);

        // Zoom ratio: negative deltaY = zoom in (scroll up)
        const zoomRatio = e.deltaY < 0 ? 0.22 : -0.26;

        // Prevent moving past ground
        if (e.deltaY < 0 && distance < 12.0) {
          return;
        }

        const stepDistance = distance * zoomRatio;
        const unitDirection = Cesium.Cartesian3.normalize(direction, new Cesium.Cartesian3());
        const moveVector = Cesium.Cartesian3.multiplyByScalar(unitDirection, stepDistance, new Cesium.Cartesian3());

        // Simultaneously zooms AND slides horizontally/laterally towards mouse cursor
        Cesium.Cartesian3.add(cameraPos, moveVector, v.camera.position);
      } else {
        const zoomAmount = (e.deltaY < 0 ? 1 : -1) * 250.0;
        v.camera.moveForward(zoomAmount);
      }
    };

    // B. Cursor Movement Tracking for Auto-Slide
    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;

      // Map to normalized range [-1, 1] centered at (0, 0)
      const nx = (relX - 0.5) * 2.0;
      const ny = (relY - 0.5) * 2.0;

      cursorNormPosRef.current = { x: nx, y: ny, active: true };
      isHoveringRef.current = true;
    };

    const handleMouseLeave = () => {
      cursorNormPosRef.current.active = false;
      isHoveringRef.current = false;
    };

    // C. Keyboard Navigation (WASD / Arrows to glide across terrain)
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      const carto = Cesium.Cartographic.fromCartesian(v.camera.position);
      const altitude = Math.max(80, carto.height);
      const moveRate = Math.min(2000.0, altitude * 0.85);

      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        v.camera.moveForward(moveRate * 0.15);
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        v.camera.moveBackward(moveRate * 0.15);
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        v.camera.moveRight(moveRate * 0.15);
      } else if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        v.camera.moveLeft(moveRate * 0.15);
      }
    };

    container.addEventListener('wheel', handleWheelZoomAndSlide, { passive: false });
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('keydown', handleKeyDown);

    // D. Cesium preRender Animation Tick Loop: Auto-Slides map smoothly as cursor moves
    const removeListener = v.scene.preRender.addEventListener(() => {
      if (!v || v.isDestroyed()) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      if (autoSlideWithCursor && isHoveringRef.current && cursorNormPosRef.current.active) {
        const nx = cursorNormPosRef.current.x;
        const ny = cursorNormPosRef.current.y;
        const distFromCenter = Math.sqrt(nx * nx + ny * ny);

        // Deadzone in the center (radius 0.18) for stability
        const deadZone = 0.18;
        if (distFromCenter > deadZone) {
          const intensity = Math.min(1.0, (distFromCenter - deadZone) / (1.0 - deadZone));
          const factor = Math.pow(intensity, 1.4);

          // Speed scales dynamically with camera altitude
          const carto = Cesium.Cartographic.fromCartesian(v.camera.position);
          const altitude = Math.max(60, carto.height);
          const baseSpeed = altitude * 0.80; // e.g. at 1,000m altitude = 800 m/s slide

          const moveRightAmount = (nx / distFromCenter) * factor * baseSpeed * dt;
          const moveForwardAmount = (-ny / distFromCenter) * factor * baseSpeed * dt;

          v.camera.moveRight(moveRightAmount);
          v.camera.moveForward(moveForwardAmount);
        }
      }
    });

    return () => {
      container.removeEventListener('wheel', handleWheelZoomAndSlide);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('keydown', handleKeyDown);
      removeListener();
    };
  }, [cameraMode, autoSlideWithCursor]);

  // 6. Drone Fly Free Roam Mode (Continuous Flight + Direct Cursor 3D Look)
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed() || cameraMode !== 'fly') return;

    const container = containerRef.current;
    if (!container) return;

    keysRef.current = {};
    let lastTime = performance.now();
    let frameCount = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyC'].includes(e.code)) {
        e.preventDefault();
        keysRef.current[e.code] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keysRef.current[e.code]) {
        keysRef.current[e.code] = false;
      }
    };

    // Direct Cursor 3D Look: moving cursor automatically looks and moves in 3D without clicking!
    const handleMouseMove = (e: MouseEvent) => {
      if (lastMousePosRef.current.x === 0 && lastMousePosRef.current.y === 0) {
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const sensitivity = 0.0035;
      headingRef.current = (headingRef.current + dx * sensitivity) % (Math.PI * 2);
      pitchRef.current = Math.max(-1.45, Math.min(1.45, pitchRef.current - dy * sensitivity));

      v.camera.setView({
        orientation: {
          heading: headingRef.current,
          pitch: pitchRef.current,
          roll: 0.0,
        }
      });
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = flightSpeedRef.current > 100 ? 50 : 15;
      if (e.deltaY < 0) {
        flightSpeedRef.current = Math.min(1000, flightSpeedRef.current + step);
      } else {
        flightSpeedRef.current = Math.max(10, flightSpeedRef.current - step);
      }
      setTelemetry(prev => ({ ...prev, speed: flightSpeedRef.current }));
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('contextmenu', handleContextMenu);

    const removeListener = v.scene.preRender.addEventListener(() => {
      if (!v || v.isDestroyed()) return;

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      let forward = 0;
      let right = 0;
      let up = 0;

      const k = keysRef.current;
      if (k['KeyW'] || k['ArrowUp']) forward += 1;
      if (k['KeyS'] || k['ArrowDown']) forward -= 1;
      if (k['KeyD'] || k['ArrowRight']) right += 1;
      if (k['KeyA'] || k['ArrowLeft']) right -= 1;
      if (k['Space'] || k['KeyE']) up += 1;
      if (k['ShiftLeft'] || k['ShiftRight'] || k['KeyQ'] || k['KeyC']) up -= 1;

      const speed = flightSpeedRef.current;
      if (forward !== 0) v.camera.moveForward(forward * speed * dt);
      if (right !== 0) v.camera.moveRight(right * speed * dt);
      if (up !== 0) v.camera.moveUp(up * speed * dt);

      frameCount++;
      if (frameCount % 6 === 0) {
        try {
          const carto = Cesium.Cartographic.fromCartesian(v.camera.position);
          setTelemetry({
            speed: flightSpeedRef.current,
            altitudeMSL: Math.round(carto.height),
            headingDeg: Math.round((Cesium.Math.toDegrees(v.camera.heading) + 360) % 360),
            latitude: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(4)),
            longitude: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(4)),
          });
        } catch {
          // ignore
        }
      }
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('contextmenu', handleContextMenu);
      removeListener();
    };
  }, [cameraMode]);

  // 7. Setup Interactive Event Handler for Inspect & Measure Tools (Active only in Orbit Mode)
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed() || cameraMode !== 'orbit') return;

    if (handlerRef.current) {
      handlerRef.current.destroy();
      handlerRef.current = null;
    }

    if (activeTool === 'navigate') {
      return;
    }

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((movement: any) => {
      const cartesian = v.scene.pickPosition(movement.position);
      if (!cartesian) return;

      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      const lat = Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6));
      const lon = Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6));
      const visualHeight = Number(cartographic.height.toFixed(1));

      if (activeTool === 'inspect') {
        const oldPin = v.entities.getById('cesium-inspect-pin');
        if (oldPin) v.entities.remove(oldPin);

        v.entities.add({
          id: 'cesium-inspect-pin',
          position: cartesian,
          point: {
            pixelSize: 12,
            color: Cesium.Color.fromCssColorString('#00f0ff'),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.NONE,
          },
          label: {
            text: ` ${visualHeight}m (3D Mesh)`,
            font: '12px JetBrains Mono, monospace',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
          }
        });

        setInspection({
          latitude: lat,
          longitude: lon,
          visualSurfaceHeight: visualHeight,
          authoritativeElevation: null,
          elevationDelta: null,
          elevationProvider: 'Querying Authoritative Elevation...',
          isLoadingAuthoritative: true,
        });

        api.getAuthoritativeElevation(lat, lon)
          .then((res) => {
            const authElev = Number(res.elevation.toFixed(1));
            const delta = Number((visualHeight - authElev).toFixed(1));
            setInspection(prev => prev ? ({
              ...prev,
              authoritativeElevation: authElev,
              elevationDelta: delta,
              elevationProvider: 'Copernicus GLO-30 / LiDAR Ground-Truth',
              isLoadingAuthoritative: false,
            }) : null);
          })
          .catch(() => {
            setInspection(prev => prev ? ({
              ...prev,
              elevationProvider: 'Authoritative lookup offline',
              isLoadingAuthoritative: false,
            }) : null);
          });

      } else if (activeTool === 'measure') {
        setMeasurement((prev) => {
          if (!prev || (prev.pointA && prev.pointB)) {
            const oldA = v.entities.getById('measure-pin-a');
            if (oldA) v.entities.remove(oldA);
            const oldB = v.entities.getById('measure-pin-b');
            if (oldB) v.entities.remove(oldB);
            const oldLine = v.entities.getById('measure-line');
            if (oldLine) v.entities.remove(oldLine);

            v.entities.add({
              id: 'measure-pin-a',
              position: cartesian,
              point: {
                pixelSize: 10,
                color: Cesium.Color.fromCssColorString('#10b981'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
              },
              label: {
                text: ' A',
                font: '11px monospace',
                fillColor: Cesium.Color.WHITE,
                pixelOffset: new Cesium.Cartesian2(0, -12),
              }
            });

            return {
              pointA: { lat, lon, height: visualHeight, cartesian }
            };
          } else {
            const posA = prev.pointA.cartesian;
            const posB = cartesian;

            v.entities.add({
              id: 'measure-pin-b',
              position: posB,
              point: {
                pixelSize: 10,
                color: Cesium.Color.fromCssColorString('#f59e0b'),
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
              },
              label: {
                text: ' B',
                font: '11px monospace',
                fillColor: Cesium.Color.WHITE,
                pixelOffset: new Cesium.Cartesian2(0, -12),
              }
            });

            v.entities.add({
              id: 'measure-line',
              polyline: {
                positions: [posA, posB],
                width: 3,
                material: new Cesium.PolylineGlowMaterialProperty({
                  glowPower: 0.25,
                  taperPower: 1.0,
                  color: Cesium.Color.CYAN,
                }),
              }
            });

            const directDist = Cesium.Cartesian3.distance(posA, posB);
            const cartoA = Cesium.Cartographic.fromCartesian(posA);
            const cartoB = cartographic;
            const geodesic = new Cesium.EllipsoidGeodesic(cartoA, cartoB);
            const surfaceDist = geodesic.surfaceDistance;
            const elevDiff = Math.abs(visualHeight - prev.pointA.height);

            return {
              ...prev,
              pointB: { lat, lon, height: visualHeight, cartesian: posB },
              euclideanDistance: Number(directDist.toFixed(1)),
              geodesicDistance: Number(surfaceDist.toFixed(1)),
              elevationDiff: Number(elevDiff.toFixed(1)),
            };
          }
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    };
  }, [activeTool, cameraMode]);

  // 8. 360° Orbit Animation Handler
  const toggleOrbit = () => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;

    if (isOrbiting) {
      if (orbitIntervalRef.current) clearInterval(orbitIntervalRef.current);
      orbitIntervalRef.current = null;
      setIsOrbiting(false);
    } else {
      if (cameraMode === 'fly') setCameraMode('orbit');
      setIsOrbiting(true);
      orbitIntervalRef.current = window.setInterval(() => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
        viewerRef.current.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.005);
      }, 30);
    }
  };

  // 9. Camera Presets
  const setCameraPitch = (pitchDeg: number) => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    if (cameraMode === 'fly') setCameraMode('orbit');
    flyToCurrentBounds(v, bounds, pitchDeg);
  };

  const resetHeadingNorth = () => {
    const v = viewerRef.current;
    if (!v || v.isDestroyed()) return;
    v.camera.setView({
      orientation: {
        heading: Cesium.Math.toRadians(0.0),
        pitch: v.camera.pitch,
        roll: 0.0,
      }
    });
    headingRef.current = 0.0;
  };

  const clearMeasurements = () => {
    const v = viewerRef.current;
    if (v && !v.isDestroyed()) {
      ['measure-pin-a', 'measure-pin-b', 'measure-line'].forEach(id => {
        const ent = v.entities.getById(id);
        if (ent) v.entities.remove(ent);
      });
    }
    setMeasurement(null);
  };

  const clearInspection = () => {
    const v = viewerRef.current;
    if (v && !v.isDestroyed()) {
      const pin = v.entities.getById('cesium-inspect-pin');
      if (pin) v.entities.remove(pin);
    }
    setInspection(null);
  };

  return (
    <div className="relative w-full h-full min-h-[560px] rounded-2xl overflow-hidden border border-slate-800 bg-[#050811] shadow-2xl select-none">
      
      {/* Cesium WebGL Container */}
      <div 
        ref={containerRef} 
        className={`w-full h-full min-h-[560px] ${cameraMode === 'fly' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ width: '100%', height: '100%' }} 
      />

      {/* Top HUD: Status Badge + Orbit/Fly Mode Switcher + Dual-Path Switcher */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        
        {/* Left Side: Status & Provider Badge */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 bg-slate-950/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-cyan-500/30 text-xs font-mono text-white shadow-xl">
            <Globe2 className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span className="font-semibold text-cyan-300">
              {isolateArea ? 'Selected Area 3D' : 'Photorealistic 3D World'}
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-300 text-[11px]">{providerName}</span>
          </div>

          {isLoadingTiles && (
            <div className="flex items-center gap-1.5 bg-cyan-950/80 backdrop-blur-md px-3 py-2 rounded-xl border border-cyan-500/40 text-[11px] font-mono text-cyan-300 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Streaming 3D Tiles...</span>
            </div>
          )}
        </div>

        {/* Center: Navigation Mode Toggle: Orbit Mode vs Drone Fly + Area 3D Isolation */}
        <div className="flex items-center gap-2 pointer-events-auto">
          
          {/* Particular Area 3D Isolation Toggle */}
          <button
            type="button"
            onClick={() => setIsolateArea(prev => !prev)}
            title={isolateArea ? 'Viewing ONLY Selected 3D Area (Click to show Whole Globe)' : 'Viewing Whole Globe (Click to isolate Selected 3D Area)'}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono border backdrop-blur-md transition-all flex items-center gap-1.5 shadow-lg ${
              isolateArea
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-emerald-500/20 font-bold'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Box className={`w-3.5 h-3.5 ${isolateArea ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span>{isolateArea ? 'Area 3D: Isolated' : 'Area 3D: Whole Globe'}</span>
          </button>

          <div className="bg-slate-950/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 flex items-center gap-1 shadow-xl">
            <button
              type="button"
              onClick={() => setCameraMode('orbit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                cameraMode === 'orbit'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Orbit Mode</span>
            </button>

            <button
              type="button"
              onClick={() => setCameraMode('fly')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                cameraMode === 'fly'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Drone Fly</span>
            </button>
          </div>

          {/* Auto-Slide with Cursor Toggle in Orbit Mode */}
          {cameraMode === 'orbit' && (
            <button
              type="button"
              onClick={() => setAutoSlideWithCursor(prev => !prev)}
              title={autoSlideWithCursor ? 'Auto-Slide with Cursor is ON (Click to Pause)' : 'Auto-Slide with Cursor is OFF (Click to Enable)'}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono border backdrop-blur-md transition-all flex items-center gap-1.5 shadow-lg ${
                autoSlideWithCursor
                  ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-cyan-500/25'
                  : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Navigation className={`w-3.5 h-3.5 ${autoSlideWithCursor ? 'text-slate-950' : 'text-cyan-400'}`} />
              <span>{autoSlideWithCursor ? 'Auto-Slide: ON' : 'Auto-Slide: OFF'}</span>
            </button>
          )}

          {/* Quick 3D Drag Mode Switcher in Orbit Mode */}
          {cameraMode === 'orbit' && (
            <button
              type="button"
              onClick={() => setOrbitDragMode(prev => prev === 'orbit3d' ? 'pan' : 'orbit3d')}
              title={orbitDragMode === 'orbit3d' ? 'Left Drag: 3D Orbit (Click to switch to Pan)' : 'Left Drag: Pan (Click to switch to 3D Orbit)'}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-mono border backdrop-blur-md transition-all flex items-center gap-1.5 shadow-lg ${
                orbitDragMode === 'orbit3d'
                  ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                  : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Move3d className="w-3.5 h-3.5 text-cyan-400" />
              <span>{orbitDragMode === 'orbit3d' ? '3D Orbit' : 'Pan Drag'}</span>
            </button>
          )}
        </div>

        {/* Right Side: Reset North Button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={resetHeadingNorth}
            title="Align Heading to North"
            className="px-3 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-700/80 text-xs font-mono text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1.5 transition-all shadow-xl"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>North</span>
          </button>
        </div>

      </div>

      {/* Floating Provider Warning / Fallback Notice */}
      {providerError && (
        <div className="absolute top-18 left-4 right-4 z-20 max-w-xl mx-auto bg-amber-950/90 backdrop-blur-md border border-amber-500/50 p-3.5 rounded-xl text-xs font-mono text-amber-200 shadow-2xl flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <div className="font-bold text-white">Photorealistic 3D Tiles Notice</div>
              <div className="text-[11px] text-amber-300/90">{providerError}</div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Camera & Interaction Toolbar */}
      <div className="absolute top-20 right-4 z-20 flex flex-col gap-2 pointer-events-auto">
        
        {/* Tool Mode Selection */}
        <div className="bg-slate-950/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl flex flex-col gap-1 text-xs">
          <button
            type="button"
            onClick={() => { setActiveTool('navigate'); clearInspection(); clearMeasurements(); }}
            title="Navigate / Free Move"
            className={`p-2 rounded-lg transition-all flex items-center justify-center ${
              activeTool === 'navigate' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Navigation className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => { setActiveTool('inspect'); clearMeasurements(); }}
            title="Inspect Elevation & Height"
            className={`p-2 rounded-lg transition-all flex items-center justify-center ${
              activeTool === 'inspect' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <MapPin className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => { setActiveTool('measure'); clearInspection(); }}
            title="Measure Two-Point Distance & Elevation Difference"
            className={`p-2 rounded-lg transition-all flex items-center justify-center ${
              activeTool === 'measure' ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Ruler className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Angles & Flight Controls */}
        <div className="bg-slate-950/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl flex flex-col gap-1 text-xs">
          <button
            type="button"
            onClick={() => viewerRef.current && flyToCurrentBounds(viewerRef.current, bounds)}
            title="Refocus Camera on Selected Area"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all flex items-center justify-center"
          >
            <CrosshairIcon className="w-4 h-4 text-cyan-400" />
          </button>

          <button
            type="button"
            onClick={() => setCameraPitch(-38)}
            title="3D Oblique City View (38° Tilt)"
            className="px-2 py-1 text-[11px] font-mono rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all text-center"
          >
            3D
          </button>

          <button
            type="button"
            onClick={() => setCameraPitch(-89)}
            title="Top-Down 2D Map View (90° Tilt)"
            className="px-2 py-1 text-[11px] font-mono rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all text-center"
          >
            2D
          </button>

          <button
            type="button"
            onClick={resetHeadingNorth}
            title="Align Heading to North"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all flex items-center justify-center"
          >
            <Compass className="w-4 h-4 text-amber-400" />
          </button>

          <button
            type="button"
            onClick={toggleOrbit}
            title={isOrbiting ? 'Stop 360° Orbit' : 'Start 360° Smooth Orbit'}
            className={`p-2 rounded-lg transition-all flex items-center justify-center ${
              isOrbiting ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <RotateCcw className={`w-4 h-4 ${isOrbiting ? 'animate-spin' : ''}`} />
          </button>
        </div>

      </div>

      {/* Drone Fly Mode Telemetry HUD */}
      {cameraMode === 'fly' && (
        <div className="absolute bottom-6 left-6 z-20 bg-slate-950/95 backdrop-blur-md rounded-2xl border border-cyan-500/50 p-4 shadow-2xl font-mono text-xs text-slate-200 pointer-events-auto flex flex-col gap-2.5 min-w-[300px] animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Plane className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">3D Free Roam & Drone Telemetry</span>
            </div>
            <button 
              onClick={() => setCameraMode('orbit')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 transition-colors"
            >
              Exit Fly
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
              <div className="text-slate-400 text-[10px]">Flight Speed:</div>
              <div className="font-bold text-cyan-300 text-sm flex items-center justify-between">
                <span>{telemetry.speed} m/s</span>
                <span className="text-[10px] text-slate-500 font-normal">({Math.round(telemetry.speed * 3.6)} km/h)</span>
              </div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
              <div className="text-slate-400 text-[10px]">Altitude MSL:</div>
              <div className="font-bold text-emerald-400 text-sm">{telemetry.altitudeMSL} m</div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
              <div className="text-slate-400 text-[10px]">Heading:</div>
              <div className="font-bold text-amber-300 text-sm">{telemetry.headingDeg}°</div>
            </div>
            <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-0.5">
              <div className="text-slate-400 text-[10px]">Coordinates:</div>
              <div className="font-bold text-slate-200 text-[10px] truncate">{telemetry.latitude}°, {telemetry.longitude}°</div>
            </div>
          </div>

          {/* Quick Flight Controls Guide */}
          <div className="pt-2 border-t border-slate-800/80 text-[10px] space-y-1">
            <div className="flex items-center justify-between text-cyan-300">
              <span className="font-semibold">🎮 Move Cursor / Drag:</span>
              <span className="text-white font-bold">Look Around in 3D</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>W / A / S / D or Arrows:</span>
              <span className="text-slate-200">Fly & Strafe</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Space / Shift:</span>
              <span className="text-slate-200">Ascend / Descend</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Mouse Scroll Wheel:</span>
              <span className="text-slate-200">Adjust Speed</span>
            </div>
          </div>
        </div>
      )}

      {/* Point Inspection HUD Overlay */}
      {inspection && activeTool === 'inspect' && cameraMode === 'orbit' && (
        <div className="absolute bottom-6 left-6 z-20 w-80 bg-slate-950/95 backdrop-blur-md rounded-2xl border border-cyan-500/40 p-4 shadow-2xl font-mono text-xs text-slate-200 animate-fade-in pointer-events-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">Point Inspection</span>
            </div>
            <button 
              onClick={clearInspection}
              className="text-slate-500 hover:text-white text-xs p-1"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Coordinates:</span>
              <span className="text-cyan-300 font-semibold">{inspection.latitude}°, {inspection.longitude}°</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>3D Visual Surface:</span>
                </span>
                <span className="font-bold text-cyan-300 text-sm">
                  {inspection.visualSurfaceHeight} m
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                Photorealistic 3D Tiles mesh height (includes buildings/canopy)
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Scientific Ground:</span>
                </span>
                <span className="font-bold text-emerald-400 text-sm">
                  {inspection.isLoadingAuthoritative ? (
                    <span className="animate-pulse text-xs">Querying...</span>
                  ) : inspection.authoritativeElevation !== null ? (
                    `${inspection.authoritativeElevation} m`
                  ) : (
                    'N/A'
                  )}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">
                {inspection.elevationProvider}
              </p>
            </div>

            {inspection.elevationDelta !== null && (
              <div className="flex items-center justify-between pt-1 px-1 text-[11px]">
                <span className="text-slate-400">Estimated Structure Height:</span>
                <span className={`font-bold ${inspection.elevationDelta > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                  {inspection.elevationDelta > 0 ? `+${inspection.elevationDelta} m` : `${inspection.elevationDelta} m`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Two-Point Measurement HUD Overlay */}
      {measurement && activeTool === 'measure' && cameraMode === 'orbit' && (
        <div className="absolute bottom-6 left-6 z-20 w-84 bg-slate-950/95 backdrop-blur-md rounded-2xl border border-cyan-500/40 p-4 shadow-2xl font-mono text-xs text-slate-200 animate-fade-in pointer-events-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-white uppercase tracking-wider text-[11px]">Metric 3D Measurement</span>
            </div>
            <button 
              onClick={clearMeasurements}
              className="text-slate-500 hover:text-white text-xs p-1"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-[11px]">
              <span className="text-emerald-300 font-semibold">Point A:</span>
              <span className="text-white font-mono">{measurement.pointA.height}m &bull; ({measurement.pointA.lat}°, {measurement.pointA.lon}°)</span>
            </div>

            {measurement.pointB ? (
              <>
                <div className="flex items-center justify-between p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px]">
                  <span className="text-amber-300 font-semibold">Point B:</span>
                  <span className="text-white font-mono">{measurement.pointB.height}m &bull; ({measurement.pointB.lat}°, {measurement.pointB.lon}°)</span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400">Direct 3D</div>
                    <div className="font-bold text-cyan-300 text-xs mt-0.5">{measurement.euclideanDistance} m</div>
                  </div>
                  <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400">Surface</div>
                    <div className="font-bold text-emerald-400 text-xs mt-0.5">{measurement.geodesicDistance} m</div>
                  </div>
                  <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400">Height Diff</div>
                    <div className="font-bold text-amber-300 text-xs mt-0.5">{measurement.elevationDiff} m</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-3 text-center text-amber-300/90 bg-amber-950/30 rounded-xl border border-amber-500/30 text-[11px] animate-pulse">
                Click second point (B) on the 3D surface to calculate distances...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Center Navigation Guide Pill in Orbit Mode */}
      {cameraMode === 'orbit' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hidden sm:flex items-center gap-2.5 bg-slate-950/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-800 text-[11px] font-mono text-slate-300 shadow-xl pointer-events-none">
          <span>🖱️ <strong className="text-cyan-400">Scroll:</strong> Zoom & Slide to Cursor</span>
          <span className="text-slate-600">•</span>
          <span><strong className="text-emerald-400">Move Cursor:</strong> Auto-Slide Map</span>
          <span className="text-slate-600">•</span>
          <span><strong className="text-white">Left/Right Drag:</strong> 3D Tilt & Orbit</span>
        </div>
      )}

      {/* Bottom Legal Attribution Notice & Data Source Tag */}
      <div className="absolute bottom-2 right-4 z-10 text-[10px] font-mono text-slate-400/90 pointer-events-auto flex items-center gap-3">
        <span className="bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800">
          Source: {providerName} &bull; CesiumJS Engine
        </span>
      </div>

    </div>
  );
};

// Internal Crosshair Icon Helper
const CrosshairIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg 
    className={className} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="22" y1="12" x2="18" y2="12" />
    <line x1="6" y1="12" x2="2" y2="12" />
    <line x1="12" y1="6" x2="12" y2="2" />
    <line x1="12" y1="22" x2="12" y2="18" />
  </svg>
);

export default CesiumTerrainViewer;
