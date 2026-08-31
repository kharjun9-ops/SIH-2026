import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  Image as ImageIcon, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Compass, 
  Eye, 
  Layers, 
  Maximize2,
  X,
  FileText
} from 'lucide-react';
import { ImageAnalysisResponse, SampleRegion } from '../../types';
import { api } from '../../services/api';

interface ImageUploaderProps {
  onImageAnalyzed: (analysis: ImageAnalysisResponse) => void;
  samples: SampleRegion[];
  onUseSampleImage: (sampleId: string) => void;
  onApplyImageCoordinates?: (lat: number, lon: number) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageAnalyzed,
  samples,
  onUseSampleImage,
  onApplyImageCoordinates,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'depth' | 'features'>('depth');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (file: File) => {
    setErrorMsg(null);
    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      setErrorMsg('Unsupported format. Please upload JPG, PNG, or WEBP.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('File exceeds maximum size of 20MB.');
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setIsAnalyzing(true);

    try {
      const result = await api.analyzeImage(file);
      setAnalysisResult(result);
      onImageAnalyzed(result);
    } catch (e: any) {
      setErrorMsg(e.message || 'Image processing failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files[0]);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Quick load sample image
  const handleLoadSample = async (sampleId: string) => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      // Fetch sample image from backend via api service
      const blob = await api.fetchSampleImage(sampleId);
      const file = new File([blob], `${sampleId}.jpg`, { type: 'image/jpeg' });
      await handleFiles(file);
      onUseSampleImage(sampleId);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to load sample image');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-[#0d121f] rounded-2xl border border-slate-800/80 p-5 shadow-2xl space-y-4">
      
      {/* Title & SIH Notice */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-base text-white tracking-tight">
              Single-Image Terrain & Depth Analysis
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Extract features, terrain silhouettes, and AI monocular relative depth maps.
          </p>
        </div>

        {selectedFile && (
          <button
            onClick={handleClear}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Clear image"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Drag & Drop Area */}
      {!selectedFile ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-cyan-400 bg-cyan-950/20 shadow-lg shadow-cyan-500/10'
              : 'border-slate-700/80 hover:border-slate-600 bg-slate-900/40 hover:bg-slate-900/70'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFiles(e.target.files[0]);
              }
            }}
          />
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-cyan-400 shadow-inner">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-slate-200">
            Drag & drop terrain photo, or <span className="text-cyan-400 underline">browse files</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Supports JPG, JPEG, PNG, WEBP (Max 20MB)
          </p>

          {/* Quick preset images */}
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-2 font-medium">
              Or test with sample landscape imagery:
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {samples.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLoadSample(s.id);
                  }}
                  className="px-2.5 py-1 bg-slate-800/80 hover:bg-cyan-950 hover:text-cyan-300 hover:border-cyan-800 text-slate-300 border border-slate-700/60 rounded-lg text-xs transition-colors"
                >
                  {s.name.split('(')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Image Preview & CV Results */
        <div className="space-y-4">
          
          {/* Analysis View Tabs */}
          <div className="flex items-center justify-between bg-slate-950 p-1 rounded-xl border border-slate-800">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('depth')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'depth'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI Relative Depth Map
              </button>
              <button
                onClick={() => setActiveTab('features')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'features'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                ORB Features & Silhouette
              </button>
            </div>

            <span className="text-[11px] font-mono text-slate-400 px-2 truncate max-w-[140px]">
              {selectedFile.name}
            </span>
          </div>

          {/* Visual Comparison: Original vs Processed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            
            {/* Original Input */}
            <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex flex-col">
              <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-medium text-slate-300 flex items-center justify-between">
                <span>Original Terrain Photo</span>
                <span className="font-mono text-slate-500">RGB</span>
              </div>
              <div className="relative aspect-video flex items-center justify-center bg-black/40">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Uploaded terrain"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
            </div>

            {/* Analyzed Output (Depth or Features) */}
            <div className="relative rounded-xl overflow-hidden border border-cyan-500/40 bg-slate-950 flex flex-col">
              <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-medium text-cyan-300 flex items-center justify-between">
                <span>{activeTab === 'depth' ? 'Monocular Relative Depth Map' : 'ORB Keypoints & Horizon'}</span>
                <span className="font-mono text-cyan-400 text-[10px]">
                  {activeTab === 'depth' ? 'TURBO HEATMAP' : 'OPENCV'}
                </span>
              </div>
              <div className="relative aspect-video flex items-center justify-center bg-black/40">
                {isAnalyzing ? (
                  <div className="flex flex-col items-center gap-2 text-cyan-400">
                    <Sparkles className="w-6 h-6 animate-spin" />
                    <span className="text-xs font-medium">Extracting CV features & depth...</span>
                  </div>
                ) : analysisResult ? (
                  <img
                    src={activeTab === 'depth' ? analysisResult.depth_map_url : analysisResult.features_preview_url}
                    alt="Analyzed result"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-slate-500">Processing...</span>
                )}
              </div>
            </div>

          </div>

          {/* Critical Technical Decision Notice Card */}
          <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-300 font-semibold">
              <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>SIH Technical Distinction Notice</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              {analysisResult?.depth_notice || "AI monocular depth estimation provides relative visual depth only. Absolute metric elevations are georeferenced from DEM data."}
            </p>
          </div>

          {/* Metadata & Camera Information Panel */}
          {analysisResult && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">DIMENSIONS</span>
                <strong className="text-slate-200">{analysisResult.width} × {analysisResult.height}</strong>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">ORB KEYPOINTS</span>
                <strong className="text-cyan-300">{analysisResult.keypoints_detected} points</strong>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">HORIZON DETECTED</span>
                <strong className={analysisResult.horizon_detected ? "text-emerald-400" : "text-slate-400"}>
                  {analysisResult.horizon_detected ? `Yes (y=${analysisResult.horizon_y_norm})` : "Estimated"}
                </strong>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">GPS EXIF</span>
                <strong className={analysisResult.has_exif_gps ? "text-emerald-400" : "text-amber-400"}>
                  {analysisResult.has_exif_gps ? `${analysisResult.exif_lat?.toFixed(3)}°` : "No GPS EXIF"}
                </strong>
              </div>
            </div>
          )}

          {/* Camera Parameters Fallback Notice */}
          {!analysisResult?.has_exif_gps && (
            <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Camera parameters unavailable. Using DEM-based terrain reconstruction.</span>
              <span className="text-[10px] text-cyan-400 font-mono">DEM Fallback Active</span>
            </div>
          )}

          {/* If EXIF GPS found, allow instant geocoding navigation */}
          {analysisResult?.has_exif_gps && analysisResult.exif_lat && analysisResult.exif_lon && onApplyImageCoordinates && (
            <button
              onClick={() => onApplyImageCoordinates(analysisResult.exif_lat!, analysisResult.exif_lon!)}
              className="w-full py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Compass className="w-4 h-4" />
              <span>Apply EXIF Coordinates ({analysisResult.exif_lat.toFixed(4)}°, {analysisResult.exif_lon.toFixed(4)}°) to 3D Terrain</span>
            </button>
          )}

        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

    </div>
  );
};
