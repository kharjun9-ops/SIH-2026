from abc import ABC, abstractmethod
from typing import Dict, Any, Tuple, Optional, List
import numpy as np

class ElevationProvider(ABC):
    """Abstract base class for all authoritative elevation and terrain data providers."""

    @abstractmethod
    def get_source_name(self) -> str:
        """Return the authoritative name and publisher of the dataset."""
        pass

    @abstractmethod
    def get_resolution(self) -> str:
        """Return the horizontal spatial resolution (e.g. '1m (LiDAR)', '~30m (1 arc-sec)')."""
        pass

    @abstractmethod
    def get_vertical_datum(self) -> str:
        """Return the vertical reference datum (e.g. 'EGM96 Geoid', 'NAVD88', 'WGS84 Ellipsoid')."""
        pass

    @abstractmethod
    def get_elevation_type(self) -> str:
        """Return dataset type: 'Bare-Earth DTM', 'Surface DSM', or 'DEM-derived'."""
        pass

    @abstractmethod
    def is_available(self, bounds: Dict[str, float]) -> bool:
        """Check whether this provider can supply elevation for the given geographic bounds."""
        pass

    @abstractmethod
    def get_elevation(self, lat: float, lon: float) -> Optional[float]:
        """Query authoritative point elevation in meters with sub-pixel bilinear interpolation."""
        pass

    @abstractmethod
    def get_elevation_grid(
        self, 
        bounds: Dict[str, float], 
        resolution: int = 128
    ) -> Optional[Tuple[np.ndarray, Dict[str, Any]]]:
        """
        Fetch, crop, and resample an elevation grid in true meters.
        Returns:
            Tuple of (2D float32 numpy array, metadata dictionary)
        """
        pass

    def get_metadata(self) -> Dict[str, Any]:
        """Return provider metadata dictionary."""
        return {
            "source_name": self.get_source_name(),
            "resolution": self.get_resolution(),
            "vertical_datum": self.get_vertical_datum(),
            "elevation_type": self.get_elevation_type(),
        }
