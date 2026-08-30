import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar/Navbar';
import { Landing } from './pages/Landing';
import { Reconstruction } from './pages/Reconstruction';
import { Viewer } from './pages/Viewer';
import { Analysis } from './pages/Analysis';
import { About } from './pages/About';
import { LoadingOverlay } from './components/Loading/LoadingOverlay';
import { 
  SampleRegion, 
  TerrainReconstructResponse, 
  LatLonBounds, 
  ImageAnalysisResponse 
} from './types';
import { api } from './services/api';

export const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>('landing');
  const [samples, setSamples] = useState<SampleRegion[]>([]);
  const [selectedSample, setSelectedSample] = useState<string>('mount_fuji');
  
  // Default coordinates: Mount Fuji
  const [centerLat, setCenterLat] = useState<number>(35.3606);
  const [centerLon, setCenterLon] = useState<number>(138.7274);
  const [radiusMeters, setRadiusMeters] = useState<number>(6000);
  
  const [bounds, setBounds] = useState<LatLonBounds>({
    min_lat: 35.3067,
    max_lat: 35.4145,
    min_lon: 138.6612,
    max_lon: 138.7936,
    center_lat: 35.3606,
    center_lon: 138.7274,
    radius_meters: 6000
  });

  const [terrainData, setTerrainData] = useState<TerrainReconstructResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysisResponse | null>(null);

  // 1. Fetch Sample Regions on initial mount
  useEffect(() => {
    const init = async () => {
      try {
        const { samples: sampleList } = await api.fetchSamples();
        setSamples(sampleList);
        
        // Auto-reconstruct initial default region (Mount Fuji) for instant live demo
        handleReconstruct({ sample_id: 'mount_fuji' });
      } catch (err) {
        console.error('Failed to fetch sample regions:', err);
      }
    };
    init();
  }, []);

  // Handler for location changes from map or inputs
  const handleLocationChange = (lat: number, lon: number, radius: number, newBounds: LatLonBounds) => {
    setCenterLat(lat);
    setCenterLon(lon);
    setRadiusMeters(radius);
    setBounds(newBounds);
    setSelectedSample(''); // Clear sample preset if user clicked custom location
  };

  // Handler for sample selection
  const handleSelectSample = (sampleId: string) => {
    setSelectedSample(sampleId);
    const matching = samples.find(s => s.id === sampleId);
    if (matching) {
      const latDelta = matching.radius_meters / 111320.0;
      const lonDelta = matching.radius_meters / (111320.0 * Math.max(0.01, Math.cos((matching.center_lat * Math.PI) / 180)));
      
      const newBounds: LatLonBounds = {
        min_lat: Number((matching.center_lat - latDelta).toFixed(6)),
        max_lat: Number((matching.center_lat + latDelta).toFixed(6)),
        min_lon: Number((matching.center_lon - lonDelta).toFixed(6)),
        max_lon: Number((matching.center_lon + lonDelta).toFixed(6)),
        center_lat: matching.center_lat,
        center_lon: matching.center_lon,
        radius_meters: matching.radius_meters,
      };

      setCenterLat(matching.center_lat);
      setCenterLon(matching.center_lon);
      setRadiusMeters(matching.radius_meters);
      setBounds(newBounds);

      handleReconstruct({ sample_id: sampleId });
    }
  };

  // Execute full 3D terrain reconstruction
  const handleReconstruct = async (overrideParams?: any) => {
    setIsLoading(true);
    try {
      const params = overrideParams || {
        latitude: centerLat,
        longitude: centerLon,
        radius: radiusMeters,
        bounds: bounds,
        grid_resolution: 128,
        sample_id: selectedSample || undefined,
      };

      const res = await api.reconstructTerrain(params);
      setTerrainData(res);
    } catch (err: any) {
      alert(`Reconstruction failed: ${err.message || 'Error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartFromLanding = () => {
    setCurrentPage('reconstruction');
  };

  const handleViewDemoFromLanding = (sampleId: string) => {
    handleSelectSample(sampleId);
    setCurrentPage('viewer');
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Global Navbar */}
      <Navbar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        samples={samples}
        selectedSample={selectedSample}
        onSelectSample={handleSelectSample}
        hasReconstructedData={!!terrainData}
      />

      {/* Main Page Routing */}
      <main className="flex-1">
        {currentPage === 'landing' && (
          <Landing
            onStartReconstruction={handleStartFromLanding}
            onViewDemo={handleViewDemoFromLanding}
            samples={samples}
          />
        )}

        {currentPage === 'reconstruction' && (
          <Reconstruction
            samples={samples}
            selectedSample={selectedSample}
            onSelectSample={handleSelectSample}
            centerLat={centerLat}
            centerLon={centerLon}
            radiusMeters={radiusMeters}
            onLocationChange={handleLocationChange}
            bounds={bounds}
            onReconstruct={() => handleReconstruct()}
            isLoading={isLoading}
            terrainData={terrainData}
            onImageAnalyzed={setImageAnalysis}
            onNavigateToStudio={() => setCurrentPage('viewer')}
          />
        )}

        {currentPage === 'viewer' && (
          <Viewer
            terrainData={terrainData}
            samples={samples}
            onSelectSample={handleSelectSample}
            onNavigateToReconstruct={() => setCurrentPage('reconstruction')}
          />
        )}

        {currentPage === 'analysis' && (
          <Analysis
            terrainData={terrainData}
            samples={samples}
            onSelectSample={handleSelectSample}
            onNavigateToReconstruct={() => setCurrentPage('reconstruction')}
          />
        )}

        {currentPage === 'about' && (
          <About />
        )}
      </main>

      {/* Loading Overlay */}
      <LoadingOverlay isLoading={isLoading} />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070a10] py-6 px-4 lg:px-8 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Smart India Hackathon 2026 &mdash; Problem Statement SIH26175</span>
          <span className="text-cyan-400">3D Terrain Reconstruction & Geospatial Analysis</span>
        </div>
      </footer>

    </div>
  );
};
export default App;
