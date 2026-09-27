import math
from typing import Tuple, Dict, Any, List

# WGS84 Ellipsoid constants
WGS84_A = 6378137.0          # Semi-major axis in meters
WGS84_F = 1.0 / 298.257223563 # Flattening
WGS84_E2 = 2.0 * WGS84_F - WGS84_F ** 2 # First eccentricity squared (~0.00669437999014)

def wgs84_meridional_radius(lat_rad: float) -> float:
    """Calculate the WGS84 meridional radius of curvature M(phi) in meters."""
    return WGS84_A * (1.0 - WGS84_E2) / ((1.0 - WGS84_E2 * (math.sin(lat_rad) ** 2)) ** 1.5)

def wgs84_prime_vertical_radius(lat_rad: float) -> float:
    """Calculate the WGS84 prime vertical radius of curvature N(phi) in meters."""
    return WGS84_A / math.sqrt(1.0 - WGS84_E2 * (math.sin(lat_rad) ** 2))

def wgs84_dimensions(min_lat: float, max_lat: float, min_lon: float, max_lon: float) -> Tuple[float, float]:
    """
    Calculate exact WGS84 horizontal ground dimensions in meters (width_m, height_m)
    using ellipsoidal geodesy at the bounding box centroid.
    """
    mid_lat = math.radians((min_lat + max_lat) / 2.0)
    d_lat = math.radians(max_lat - min_lat)
    d_lon = math.radians(max_lon - min_lon)

    M = wgs84_meridional_radius(mid_lat)
    N = wgs84_prime_vertical_radius(mid_lat)

    height_m = M * d_lat
    width_m = N * math.cos(mid_lat) * d_lon

    return width_m, height_m

def utm_crs_for_latlon(lat: float, lon: float) -> Dict[str, Any]:
    """
    Determine the standard Universal Transverse Mercator (UTM) CRS
    zone and EPSG code for a given geographic coordinate.
    """
    zone = int(math.floor((lon + 180.0) / 6.0)) + 1
    zone = max(1, min(60, zone))
    if lat >= 0:
        epsg = 32600 + zone
        hemi = "N"
    else:
        epsg = 32700 + zone
        hemi = "S"

    return {
        "epsg": f"EPSG:{epsg}",
        "name": f"WGS 84 / UTM zone {zone}{hemi}",
        "zone": zone,
        "hemisphere": hemi
    }

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in meters on the WGS84 sphere."""
    R = 6371000.0  # Earth mean radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def bounds_from_center_radius(lat: float, lon: float, radius_meters: float) -> Dict[str, float]:
    """Compute accurate WGS84 min/max lat/lon bounding box from center and radius."""
    lat_rad = math.radians(lat)
    M = wgs84_meridional_radius(lat_rad)
    N = wgs84_prime_vertical_radius(lat_rad)

    lat_delta = math.degrees(radius_meters / M)
    lon_delta = math.degrees(radius_meters / (N * max(0.001, math.cos(lat_rad))))
    
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
    """Calculate true ellipsoidal ground area in square kilometers of a lat/lon bounding box."""
    width_m, height_m = wgs84_dimensions(
        bounds["min_lat"], bounds["max_lat"], bounds["min_lon"], bounds["max_lon"]
    )
    return (width_m * height_m) / 1_000_000.0

def compass_bearing_to_cardinal(degrees: float) -> str:
    """Convert degrees (0-360) to 8-point cardinal direction."""
    degrees = degrees % 360.0
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]
    idx = int((degrees + 22.5) / 45.0)
    return directions[idx]

