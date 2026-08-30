import math
from typing import Tuple, Dict, Any, List

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def bounds_from_center_radius(lat: float, lon: float, radius_meters: float) -> Dict[str, float]:
    """Compute min/max lat/lon bounding box from center and radius."""
    # Approximate degree offsets
    lat_delta = (radius_meters / 111320.0)
    lon_delta = (radius_meters / (111320.0 * max(0.01, math.cos(math.radians(lat)))))
    
    return {
        "min_lat": round(lat - lat_delta, 6),
        "max_lat": round(lat + lat_delta, 6),
        "min_lon": round(lon - lon_delta, 6),
        "max_lon": round(lon + lon_delta, 6),
        "center_lat": round(lat, 6),
        "center_lon": round(lon, 6),
        "radius_meters": radius_meters
    }

def calculate_area_sq_km(bounds: Dict[str, float]) -> float:
    """Calculate approximate area in square kilometers of a lat/lon bounding box."""
    min_lat, max_lat = bounds["min_lat"], bounds["max_lat"]
    min_lon, max_lon = bounds["min_lon"], bounds["max_lon"]
    
    mid_lat = (min_lat + max_lat) / 2.0
    height_m = (max_lat - min_lat) * 111320.0
    width_m = (max_lon - min_lon) * (111320.0 * math.cos(math.radians(mid_lat)))
    
    area_sq_m = height_m * width_m
    return area_sq_m / 1_000_000.0

def compass_bearing_to_cardinal(degrees: float) -> str:
    """Convert degrees (0-360) to 8-point cardinal direction."""
    degrees = degrees % 360.0
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]
    idx = int((degrees + 22.5) / 45.0)
    return directions[idx]
