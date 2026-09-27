import React from 'react';
import { Compass, Navigation } from 'lucide-react';

interface CompassWidgetProps {
  headingDeg: number;
  pitchDeg?: number;
  onResetNorth: () => void;
}

export const CompassWidget: React.FC<CompassWidgetProps> = ({
  headingDeg,
  pitchDeg = 0,
  onResetNorth,
}) => {
  // Normalize heading 0..360
  const normHeading = ((headingDeg % 360) + 360) % 360;

  // Cardinal direction text
  const getCardinal = (deg: number): string => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    const idx = Math.round(((deg % 360) / 45)) % 8;
    return directions[idx];
  };

  const cardinal = getCardinal(normHeading);

  return (
    <div className="flex flex-col items-center gap-1 select-none pointer-events-auto">
      <button
        onClick={onResetNorth}
        title="Click to orient camera to True North (0°)"
        className="relative w-12 h-12 rounded-full bg-slate-950/85 backdrop-blur-md border border-slate-700/80 shadow-2xl flex items-center justify-center transition-all hover:scale-105 hover:border-cyan-400 group cursor-pointer"
      >
        {/* Outer compass ring */}
        <div className="absolute inset-1 rounded-full border border-slate-800/80 pointer-events-none" />

        {/* Rotating Compass Needle Dial */}
        <div
          className="relative w-8 h-8 flex items-center justify-center transition-transform duration-75"
          style={{ transform: `rotate(${-normHeading}deg)` }}
        >
          {/* North Pointer (Red Arrow) */}
          <div className="absolute top-0 w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-b-[14px] border-b-rose-500 filter drop-shadow-[0_0_4px_rgba(244,63,94,0.6)]" />
          
          {/* South Pointer (Silver Arrow) */}
          <div className="absolute bottom-0 w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-t-[14px] border-t-slate-300" />
          
          {/* Center pivot pin */}
          <div className="w-2 h-2 rounded-full bg-slate-100 border border-slate-900 z-10" />

          {/* North letter tag on dial */}
          <span className="absolute -top-3.5 text-[9px] font-mono font-extrabold text-rose-400 tracking-tighter">
            N
          </span>
        </div>
      </button>

      {/* Heading & Cardinal Readout */}
      <div className="px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-800 backdrop-blur-md text-[10px] font-mono text-slate-300 flex items-center gap-1 shadow-lg">
        <span className="text-cyan-400 font-bold">{Math.round(normHeading).toString().padStart(3, '0')}°</span>
        <span className="text-slate-400 font-semibold">{cardinal}</span>
      </div>
    </div>
  );
};
