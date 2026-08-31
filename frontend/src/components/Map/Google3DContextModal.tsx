import React, { useEffect, useRef } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { 
  X, 
  Eye, 
  ShieldCheck, 
  AlertCircle, 
  ExternalLink, 
  Compass, 
  Layers 
} from 'lucide-react';
import { LatLonBounds } from '../../types';

interface Google3DContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  centerLat: number;
  centerLon: number;
  bounds: LatLonBounds;
}

/**
 * Optional Google 3D Contextual Viewer Component.
 * Displays Google Maps 3D perspective / aerial context for visual comparison with our authoritative DEM reconstruction.
 */
export const Google3DContextModal: React.FC<Google3DContextModalProps> = ({
  isOpen,
  onClose,
  centerLat,
  centerLon,
  bounds,
}) => {
  const map3dRef = useRef<HTMLDivElement>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

  useEffect(() => {
    if (!isOpen || !apiKey || !map3dRef.current) return;

    let isMounted = true;
    const loader = new Loader({
      apiKey: apiKey,
      version: 'weekly',
      libraries: ['maps3d', 'places'] as any
    });

    (loader as any).load().then((google: any) => {
      if (!isMounted || !map3dRef.current) return;

      try {
        // Try creating standard satellite 45-degree perspective map
        const mapOptions: google.maps.MapOptions = {
          center: { lat: centerLat, lng: centerLon },
          zoom: 17,
          heading: 320,
          tilt: 65,
          mapTypeId: 'satellite',
          disableDefaultUI: false,
        };

        const map = new google.maps.Map(map3dRef.current, mapOptions);

        // Marker for center
        new google.maps.Marker({
          position: { lat: centerLat, lng: centerLon },
          map: map,
          title: 'Bengaluru Pilot Center',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#00e5ff',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }
        });
      } catch (err: any) {
        console.warn('Google 3D Context initialization notice:', err);
      }
    }).catch((e: any) => {
      console.warn('Google Maps 3D loader notice:', e);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, apiKey, centerLat, centerLon]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-[#0a0f1d] border border-blue-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
              <Eye className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Google 3D Contextual View &mdash; Bengaluru Pilot
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 border border-blue-700/60 text-blue-300 font-mono">
                  Contextual Reference
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Lat: {centerLat.toFixed(5)}° N, Lon: {centerLon.toFixed(5)}° E
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notice Disclaimer Banner (Requirement #1 & #26) */}
        <div className="px-6 py-2.5 bg-blue-950/40 border-b border-blue-500/20 text-xs text-blue-200 flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              <strong>VISUAL CONTEXT ONLY:</strong> This satellite perspective view provides geographic visual context. Our application's authoritative DEM/LiDAR bare-earth terrain, metric analysis, and 3D vector extrusions are generated in <strong>Our 3D Reconstruction</strong>.
            </span>
          </div>
        </div>

        {/* 3D Map Viewport */}
        <div className="relative w-full h-[520px] bg-slate-950">
          {apiKey ? (
            <div ref={map3dRef} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4 font-mono text-slate-400">
              <AlertCircle className="w-12 h-12 text-blue-400 animate-pulse" />
              <div className="max-w-md space-y-2">
                <h4 className="text-sm font-bold text-white">Google Maps API Key Not Set</h4>
                <p className="text-xs leading-relaxed">
                  To view live Google satellite perspective context, add <code className="text-cyan-300">VITE_GOOGLE_MAPS_API_KEY</code> to your <code className="text-cyan-300">frontend/.env</code> file as documented in <code className="text-cyan-300">GOOGLE_MAPS_SETUP.md</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs font-mono">
          <span className="text-slate-500">Platform: Google Maps JavaScript API</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
          >
            Back to Our 3D Reconstruction
          </button>
        </div>

      </div>
    </div>
  );
};
