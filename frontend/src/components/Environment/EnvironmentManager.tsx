import React from 'react';
import { EnvironmentLayersResponse, LayerVisibility, BuildingFeature, RoadFeature, WaterFeature } from '../../types';
import { BuildingsLayer } from './BuildingsLayer';
import { RoadsLayer } from './RoadsLayer';
import { WaterLayer } from './WaterLayer';

interface EnvironmentManagerProps {
  environmentData: EnvironmentLayersResponse | null;
  layerVisibility: LayerVisibility;
  exaggeration: number;
  minElevation: number;
  colorBySource?: boolean;
  onBuildingClick?: (building: BuildingFeature) => void;
  onRoadClick?: (road: RoadFeature) => void;
  onWaterClick?: (water: WaterFeature) => void;
}

/**
 * Parent orchestrator for 3D environment vector layers.
 */
export const EnvironmentManager: React.FC<EnvironmentManagerProps> = ({
  environmentData,
  layerVisibility,
  exaggeration,
  minElevation,
  colorBySource = true,
  onBuildingClick,
  onRoadClick,
  onWaterClick,
}) => {
  if (!environmentData) return null;

  return (
    <group name="environment-layers">
      <BuildingsLayer
        buildings={environmentData.buildings || []}
        exaggeration={exaggeration}
        minElevation={minElevation}
        visible={layerVisibility.buildings}
        colorBySource={colorBySource}
        onBuildingClick={onBuildingClick}
      />
      <RoadsLayer
        roads={environmentData.roads || []}
        exaggeration={exaggeration}
        minElevation={minElevation}
        visible={layerVisibility.roads}
        onRoadClick={onRoadClick}
      />
      <WaterLayer
        water={environmentData.water || []}
        exaggeration={exaggeration}
        minElevation={minElevation}
        visible={layerVisibility.water}
        onWaterClick={onWaterClick}
      />
    </group>
  );
};
