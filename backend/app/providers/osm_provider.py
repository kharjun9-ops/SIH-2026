"""
OpenStreetMap (OSM) Live GIS Vector Data Provider.
Retrieves real-world building footprints, multipolygon relations, road networks,
water bodies, and geographic landmarks for any bounding box worldwide.
"""
import os
import json
import math
import time
import logging
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import httpx
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

USER_AGENT = "SIH26175-3D-Terrain-Reconstruction/2.0 (geospatial-research; contact: sih-terrain@reconstruction.edu)"
CACHE_TTL_SECONDS = 3600

# In-memory LRU cache
_osm_cache: Dict[str, Dict[str, Any]] = {}
_cache_timestamps: Dict[str, float] = {}

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
]


def _cache_key(bounds: Dict[str, float], layers: List[str]) -> str:
    s = f"{bounds['min_lat']:.5f},{bounds['min_lon']:.5f},{bounds['max_lat']:.5f},{bounds['max_lon']:.5f}_{','.join(sorted(layers))}"
    return hashlib.md5(s.encode()).hexdigest()


def _get_cached(key: str) -> Optional[Dict[str, Any]]:
    if key in _osm_cache:
        age = time.time() - _cache_timestamps.get(key, 0)
        if age < CACHE_TTL_SECONDS:
            logger.info(f"OSM Cache HIT (age={age:.0f}s)")
            return _osm_cache[key]
        else:
            del _osm_cache[key]
            del _cache_timestamps[key]
    return None


def _set_cached(key: str, data: Dict[str, Any]):
    _osm_cache[key] = data
    _cache_timestamps[key] = time.time()


def _centroid(coords: List[List[float]]) -> Tuple[float, float]:
    """Calculate centroid [latitude, longitude] of a coordinate list."""
    if not coords:
        return 0.0, 0.0
    lats = [c[0] for c in coords]
    lons = [c[1] for c in coords]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _polygon_area_sq_m(coords: List[List[float]]) -> float:
    """Calculate approximate area in square meters for a lat/lon polygon."""
    if len(coords) < 3:
        return 0.0
    mid_lat = sum(c[0] for c in coords) / len(coords)
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(mid_lat))

    mx = [c[1] * m_per_deg_lon for c in coords]
    my = [c[0] * m_per_deg_lat for c in coords]

    area = 0.0
    n = len(coords)
    for i in range(n):
        j = (i + 1) % n
        area += mx[i] * my[j]
        area -= mx[j] * my[i]
    return abs(area) / 2.0


class EnvironmentDataProvider:
    """Modular GIS vector data provider for OpenStreetMap features."""

    def __init__(self):
        self.headers = {
            "User-Agent": USER_AGENT,
            "Accept": "application/xml, application/json, */*"
        }

    def fetch_features(
        self,
        bounds: Dict[str, float],
        layers: Optional[List[str]] = None,
        max_buildings: int = 6000,
        max_roads: int = 6000,
        max_water: int = 1000,
        max_landmarks: int = 400,
    ) -> Dict[str, Any]:
        """
        Main entrypoint: retrieves real OpenStreetMap vector data.
        
        Args:
            bounds: Dict containing 'min_lat' (south), 'min_lon' (west), 'max_lat' (north), 'max_lon' (east)
            layers: List of layers to retrieve (default: ['buildings', 'roads', 'water', 'landmarks'])
            
        Returns:
            Dict containing parsed 'buildings', 'roads', 'water', 'landmarks', 'counts', 'source', 'status'
        """
        if layers is None:
            layers = ["buildings", "roads", "water", "landmarks"]

        # 1. Check in-memory cache
        ckey = _cache_key(bounds, layers)
        cached = _get_cached(ckey)
        if cached is not None:
            return cached

        south = bounds["min_lat"]
        west = bounds["min_lon"]
        north = bounds["max_lat"]
        east = bounds["max_lon"]

        logger.info(
            f"Environment query bounds: S={south:.5f}, W={west:.5f}, N={north:.5f}, E={east:.5f} | Layers={layers}"
        )

        # 1b. Check local pre-cached dataset for Bengaluru Pilot without artificial caps
        bengaluru_cache_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "data", "bengaluru", "bengaluru_pilot_raw.json")
        if not os.path.exists(bengaluru_cache_path):
            bengaluru_cache_path = os.path.join("data", "bengaluru", "bengaluru_pilot_raw.json")

        if os.path.exists(bengaluru_cache_path) and (12.94 <= south <= 13.01 and 77.56 <= west <= 77.63):
            try:
                with open(bengaluru_cache_path, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                    # Filter features inside current bounding box
                    filtered_buildings = [
                        b for b in raw_data.get("buildings", [])
                        if south <= b["latitude"] <= north and west <= b["longitude"] <= east
                    ]
                    filtered_roads = [
                        r for r in raw_data.get("roads", [])
                        if any(south <= pt[0] <= north and west <= pt[1] <= east for pt in r.get("coords", []))
                    ]
                    filtered_water = [
                        w for w in raw_data.get("water", [])
                        if south <= w["latitude"] <= north and west <= w["longitude"] <= east
                    ]
                    filtered_landmarks = [
                        lm for lm in raw_data.get("landmarks", [])
                        if south <= lm["latitude"] <= north and west <= lm["longitude"] <= east
                    ]

                    if filtered_buildings or filtered_roads:
                        logger.info(f"Loaded locked Bengaluru Pilot dataset from local disk: {len(filtered_buildings)} buildings, {len(filtered_roads)} roads, {len(filtered_water)} water")
                        result = {
                            "status": "success",
                            "source": "OpenStreetMap (Bengaluru Pilot Local Cache)",
                            "buildings": filtered_buildings[:max_buildings],
                            "roads": filtered_roads[:max_roads],
                            "water": filtered_water[:max_water],
                            "landmarks": filtered_landmarks[:max_landmarks],
                            "counts": {
                                "buildings": len(filtered_buildings[:max_buildings]),
                                "roads": len(filtered_roads[:max_roads]),
                                "water": len(filtered_water[:max_water]),
                                "landmarks": len(filtered_landmarks[:max_landmarks])
                            }
                        }
                        _set_cached(ckey, result)
                        return result
            except Exception as ex:
                logger.warning(f"Error loading local Bengaluru pilot cache: {ex}")

        last_error = None

        # 2. Try Primary Engine: Direct OSM 0.6 Map API
        try:
            result = self._fetch_direct_osm_api(
                south=south, west=west, north=north, east=east,
                layers=layers,
                max_buildings=max_buildings,
                max_roads=max_roads,
                max_water=max_water,
                max_landmarks=max_landmarks
            )
            if result is not None:
                _set_cached(ckey, result)
                return result
        except Exception as e:
            logger.warning(f"Primary OSM 0.6 Map API error: {e}, attempting Overpass fallback...")
            last_error = str(e)

        # 3. Try Secondary Engine: Overpass QL Mirrors
        try:
            result = self._fetch_overpass(
                south=south, west=west, north=north, east=east,
                layers=layers,
                max_buildings=max_buildings,
                max_roads=max_roads,
                max_water=max_water,
                max_landmarks=max_landmarks
            )
            if result is not None:
                _set_cached(ckey, result)
                return result
        except Exception as e:
            logger.warning(f"Secondary Overpass error: {e}")
            last_error = str(e)

        # 4. If all remote data sources failed, return explicit error state
        return {
            "status": "error",
            "message": f"OpenStreetMap feature query failed: {last_error or 'All OSM vector endpoints unreachable or timed out'}",
            "provider_status": "FAILED",
            "source": "OpenStreetMap",
            "buildings": [],
            "roads": [],
            "water": [],
            "landmarks": [],
            "counts": {
                "buildings": 0,
                "roads": 0,
                "water": 0,
                "landmarks": 0
            }
        }

    def _fetch_direct_osm_api(
        self,
        south: float, west: float, north: float, east: float,
        layers: List[str],
        max_buildings: int, max_roads: int, max_water: int, max_landmarks: int
    ) -> Optional[Dict[str, Any]]:
        """Query official OpenStreetMap 0.6 Map API: GET /api/0.6/map?bbox=min_lon,min_lat,max_lon,max_lat"""
        url = f"https://api.openstreetmap.org/api/0.6/map?bbox={west:.5f},{south:.5f},{east:.5f},{north:.5f}"
        logger.info(f"Connecting to OSM 0.6 API: {url}...")

        with httpx.Client(timeout=18.0) as client:
            resp = client.get(url, headers=self.headers)
            logger.info(f"OSM API HTTP status={resp.status_code}, content_length={len(resp.content)} bytes")

            if resp.status_code != 200:
                logger.warning(f"OSM API returned HTTP {resp.status_code}")
                return None

            root = ET.fromstring(resp.content)
            
            # Map node IDs to (lat, lon)
            node_map: Dict[str, Tuple[float, float]] = {}
            nodes = root.findall("node")
            for n in nodes:
                nid = n.attrib.get("id")
                nlat = float(n.attrib.get("lat", 0))
                nlon = float(n.attrib.get("lon", 0))
                if nid:
                    node_map[nid] = (nlat, nlon)

            # Map way IDs to coords list
            way_coords_map: Dict[str, List[List[float]]] = {}
            ways = root.findall("way")
            for w in ways:
                wid = w.attrib.get("id")
                nd_refs = [nd.attrib["ref"] for nd in w.findall("nd")]
                w_coords = []
                for ref in nd_refs:
                    if ref in node_map:
                        pt = node_map[ref]
                        w_coords.append([pt[0], pt[1]])
                if wid and w_coords:
                    way_coords_map[wid] = w_coords

            relations = root.findall("relation")
            logger.info(f"OSM raw elements: {len(nodes)} nodes, {len(ways)} ways, {len(relations)} relations")

            buildings: List[Dict[str, Any]] = []
            roads: List[Dict[str, Any]] = []
            water: List[Dict[str, Any]] = []
            landmarks: List[Dict[str, Any]] = []

            # Highway width classification table
            width_map = {
                "motorway": 14.0, "trunk": 12.0, "primary": 10.0,
                "secondary": 8.0, "tertiary": 7.0, "residential": 6.0,
                "unclassified": 5.0, "service": 4.0, "living_street": 5.0,
                "pedestrian": 3.5, "footway": 2.0, "cycleway": 2.5,
                "track": 3.0, "path": 1.5, "steps": 1.5,
            }

            # 1. Parse Landmark nodes
            if "landmarks" in layers:
                for n in nodes:
                    if len(landmarks) >= max_landmarks:
                        break
                    tags = {t.attrib["k"]: t.attrib["v"] for t in n.findall("tag")}
                    if not tags:
                        continue
                    cat = None
                    for k in ["natural", "historic", "tourism", "amenity", "man_made", "leisure"]:
                        if k in tags:
                            cat = tags[k]
                            break
                    if cat:
                        nlat = float(n.attrib["lat"])
                        nlon = float(n.attrib["lon"])
                        landmarks.append({
                            "id": f"osm-node-{n.attrib['id']}",
                            "latitude": nlat,
                            "longitude": nlon,
                            "name": tags.get("name"),
                            "category": cat,
                            "tags": tags,
                        })

            # 2. Parse Multipolygon Relations (Outer ring assembly)
            for rel in relations:
                tags = {t.attrib["k"]: t.attrib["v"] for t in rel.findall("tag")}
                rel_type = tags.get("type")
                if rel_type != "multipolygon":
                    continue

                # Find outer member ways
                outer_coords: List[List[float]] = []
                for mem in rel.findall("member"):
                    if mem.attrib.get("type") == "way" and mem.attrib.get("role") in ["outer", ""]:
                        ref_id = mem.attrib.get("ref")
                        if ref_id in way_coords_map:
                            outer_coords.extend(way_coords_map[ref_id])

                if len(outer_coords) < 3:
                    continue

                # Relation Buildings
                if ("building" in tags or "building:part" in tags) and "buildings" in layers and len(buildings) < max_buildings:
                    clat, clon = _centroid(outer_coords)
                    height = float(tags.get("height", "10.0").replace("m", "").strip()) if "height" in tags else 10.0
                    levels = int(tags["building:levels"]) if "building:levels" in tags and tags["building:levels"].isdigit() else None
                    if "height" not in tags and levels:
                        height = levels * 3.0
                    area = _polygon_area_sq_m(outer_coords)
                    buildings.append({
                        "id": f"osm-rel-{rel.attrib['id']}",
                        "footprint": outer_coords,
                        "latitude": round(clat, 7),
                        "longitude": round(clon, 7),
                        "height": round(height, 1),
                        "height_source": "MAPPED" if "height" in tags else ("OSM_LEVELS" if levels else "ESTIMATED"),
                        "footprint_source": "OpenStreetMap Relation",
                        "levels": levels,
                        "name": tags.get("name"),
                        "building_type": tags.get("building") or tags.get("building:part") or "yes",
                        "roof_type": tags.get("roof:shape", "flat"),
                        "footprint_area_sq_m": round(area, 1),
                        "tags": tags,
                        "source": "OpenStreetMap",
                    })

                # Relation Water Bodies
                elif ("natural" in tags or "water" in tags or "waterway" in tags or "landuse" in tags) and "water" in layers and len(water) < max_water:
                    clat, clon = _centroid(outer_coords)
                    wtype = tags.get("water") or tags.get("natural") or "water"
                    water.append({
                        "id": f"osm-rel-{rel.attrib['id']}",
                        "polygon": outer_coords,
                        "water_type": wtype,
                        "latitude": round(clat, 7),
                        "longitude": round(clon, 7),
                        "name": tags.get("name"),
                        "tags": tags,
                        "source": "OpenStreetMap",
                    })

            # 3. Parse Ways (Buildings, Roads, Water)
            for w in ways:
                tags = {t.attrib["k"]: t.attrib["v"] for t in w.findall("tag")}
                wid = w.attrib.get("id")
                coords = way_coords_map.get(wid, [])

                if not coords:
                    continue

                # A. Buildings
                if ("building" in tags or "building:part" in tags) and "buildings" in layers and len(buildings) < max_buildings:
                    if len(coords) >= 3:
                        clat, clon = _centroid(coords)
                        height = None
                        height_source = "ESTIMATED"
                        for hkey in ["height", "building:height"]:
                            if hkey in tags:
                                try:
                                    height = float(tags[hkey].replace("m", "").strip())
                                    height_source = "MAPPED"
                                    break
                                except (ValueError, AttributeError):
                                    pass
                        levels = None
                        if "building:levels" in tags:
                            try:
                                levels = int(tags["building:levels"])
                            except (ValueError, TypeError):
                                pass
                        if height is None and levels is not None:
                            height = levels * 3.0
                            height_source = "OSM_LEVELS"
                        if height is None:
                            height = 8.0
                            height_source = "ESTIMATED"

                        area = _polygon_area_sq_m(coords)
                        buildings.append({
                            "id": f"osm-way-{w.attrib['id']}",
                            "footprint": coords,
                            "latitude": round(clat, 7),
                            "longitude": round(clon, 7),
                            "height": round(height, 1),
                            "height_source": height_source,
                            "footprint_source": "OpenStreetMap Way",
                            "levels": levels,
                            "name": tags.get("name"),
                            "building_type": tags.get("building") or tags.get("building:part") or "yes",
                            "roof_type": tags.get("roof:shape", "flat"),
                            "footprint_area_sq_m": round(area, 1),
                            "tags": tags,
                            "source": "OpenStreetMap",
                        })

                # B. Roads
                elif "highway" in tags and "roads" in layers and len(roads) < max_roads:
                    if len(coords) >= 2:
                        htype = tags["highway"]
                        width = None
                        width_source = "DEFAULT"
                        if "width" in tags:
                            try:
                                width = float(tags["width"].replace("m", "").strip())
                                width_source = "MAPPED"
                            except (ValueError, AttributeError):
                                pass
                        if width is None:
                            width = width_map.get(htype, 5.0)

                        roads.append({
                            "id": f"osm-way-{w.attrib['id']}",
                            "coords": coords,
                            "road_type": htype,
                            "width": round(width, 1),
                            "width_source": width_source,
                            "name": tags.get("name"),
                            "surface": tags.get("surface"),
                            "tags": tags,
                            "source": "OpenStreetMap",
                        })

                # C. Water bodies
                elif ("natural" in tags and tags["natural"] == "water" or "water" in tags or "waterway" in tags or "landuse" in tags and tags["landuse"] in ["reservoir", "basin"]) and "water" in layers and len(water) < max_water:
                    if len(coords) >= 3:
                        clat, clon = _centroid(coords)
                        wtype = "water"
                        if tags.get("water") == "lake" or tags.get("natural") == "water":
                            wtype = "lake"
                        elif tags.get("water") == "river" or tags.get("waterway") == "riverbank":
                            wtype = "river"
                        elif tags.get("water") == "reservoir" or tags.get("landuse") == "reservoir":
                            wtype = "reservoir"

                        water.append({
                            "id": f"osm-way-{w.attrib['id']}",
                            "polygon": coords,
                            "water_type": wtype,
                            "latitude": round(clat, 7),
                            "longitude": round(clon, 7),
                            "name": tags.get("name"),
                            "tags": tags,
                            "source": "OpenStreetMap",
                        })

            logger.info(
                f"OSM 0.6 parsed: Buildings={len(buildings)}, Roads={len(roads)}, Water={len(water)}, Landmarks={len(landmarks)}"
            )

            return {
                "status": "success",
                "source": "OpenStreetMap (OSM 0.6 Vector API)",
                "buildings": buildings,
                "roads": roads,
                "water": water,
                "landmarks": landmarks,
                "counts": {
                    "buildings": len(buildings),
                    "roads": len(roads),
                    "water": len(water),
                    "landmarks": len(landmarks)
                }
            }

    def _fetch_overpass(
        self,
        south: float, west: float, north: float, east: float,
        layers: List[str],
        max_buildings: int, max_roads: int, max_water: int, max_landmarks: int
    ) -> Optional[Dict[str, Any]]:
        """Fallback to Overpass QL multi-mirror queries with relation and way support."""
        bbox = f"{south:.5f},{west:.5f},{north:.5f},{east:.5f}"
        q_parts = []
        if "buildings" in layers:
            q_parts.append(f'wr["building"]({bbox});')
            q_parts.append(f'wr["building:part"]({bbox});')
        if "roads" in layers:
            q_parts.append(f'wr["highway"]({bbox});')
        if "water" in layers:
            q_parts.append(f'wr["natural"="water"]({bbox});')
            q_parts.append(f'wr["waterway"]({bbox});')
            q_parts.append(f'wr["landuse"="reservoir"]({bbox});')
        if "landmarks" in layers:
            q_parts.append(f'node["tourism"]({bbox});')
            q_parts.append(f'node["historic"]({bbox});')

        query = f"[out:json][timeout:18];(\n  " + "\n  ".join(q_parts) + "\n);\nout body geom;"

        for mirror in OVERPASS_MIRRORS:
            try:
                logger.info(f"Querying Overpass mirror: {mirror}...")
                with httpx.Client(timeout=16.0) as client:
                    resp = client.post(mirror, data={"data": query}, headers=self.headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        elems = data.get("elements", [])
                        logger.info(f"Overpass mirror {mirror} returned {len(elems)} elements")
                        
                        buildings = []
                        roads = []
                        water_bodies = []
                        landmarks = []

                        width_map = {
                            "motorway": 14.0, "trunk": 12.0, "primary": 10.0,
                            "secondary": 8.0, "tertiary": 7.0, "residential": 6.0,
                            "unclassified": 5.0, "service": 4.0, "path": 1.5,
                            "footway": 2.0, "cycleway": 2.5, "steps": 1.5,
                        }

                        for el in elems:
                            tags = el.get("tags", {})
                            el_type = el.get("type")

                            # Landmarks
                            if el_type == "node" and "landmarks" in layers and len(landmarks) < max_landmarks:
                                cat = tags.get("tourism") or tags.get("historic") or "poi"
                                landmarks.append({
                                    "id": f"osm-node-{el['id']}",
                                    "latitude": el["lat"],
                                    "longitude": el["lon"],
                                    "name": tags.get("name"),
                                    "category": cat,
                                    "tags": tags,
                                })

                            # Buildings (Ways & Relations)
                            elif ("building" in tags or "building:part" in tags) and "buildings" in layers and len(buildings) < max_buildings:
                                geom = el.get("geometry", [])
                                coords = [[pt["lat"], pt["lon"]] for pt in geom]
                                if len(coords) >= 3:
                                    clat, clon = _centroid(coords)
                                    height = float(tags.get("height", "8.0").replace("m", "")) if "height" in tags else 8.0
                                    levels = int(tags["building:levels"]) if "building:levels" in tags and tags["building:levels"].isdigit() else None
                                    if "height" not in tags and levels:
                                        height = levels * 3.0
                                    area = _polygon_area_sq_m(coords)
                                    buildings.append({
                                        "id": f"osm-{el_type}-{el['id']}",
                                        "footprint": coords,
                                        "latitude": round(clat, 7),
                                        "longitude": round(clon, 7),
                                        "height": height,
                                        "height_source": "MAPPED" if "height" in tags else ("OSM_LEVELS" if levels else "ESTIMATED"),
                                        "footprint_source": "OpenStreetMap",
                                        "levels": levels,
                                        "name": tags.get("name"),
                                        "building_type": tags.get("building") or tags.get("building:part") or "yes",
                                        "roof_type": tags.get("roof:shape", "flat"),
                                        "footprint_area_sq_m": round(area, 1),
                                        "tags": tags,
                                        "source": "OpenStreetMap",
                                    })

                            # Roads
                            elif "highway" in tags and "roads" in layers and len(roads) < max_roads:
                                geom = el.get("geometry", [])
                                coords = [[pt["lat"], pt["lon"]] for pt in geom]
                                if len(coords) >= 2:
                                    htype = tags["highway"]
                                    width = None
                                    width_source = "DEFAULT"
                                    if "width" in tags:
                                        try:
                                            width = float(tags["width"].replace("m", "").strip())
                                            width_source = "MAPPED"
                                        except (ValueError, AttributeError):
                                            pass
                                    if width is None:
                                        width = width_map.get(htype, 5.0)

                                    roads.append({
                                        "id": f"osm-{el_type}-{el['id']}",
                                        "coords": coords,
                                        "road_type": htype,
                                        "width": width,
                                        "width_source": width_source,
                                        "name": tags.get("name"),
                                        "surface": tags.get("surface"),
                                        "tags": tags,
                                        "source": "OpenStreetMap",
                                    })

                            # Water
                            elif ("natural" in tags or "waterway" in tags or "water" in tags or "landuse" in tags) and "water" in layers and len(water_bodies) < max_water:
                                geom = el.get("geometry", [])
                                coords = [[pt["lat"], pt["lon"]] for pt in geom]
                                if len(coords) >= 3:
                                    clat, clon = _centroid(coords)
                                    wtype = tags.get("water") or tags.get("natural") or "water"
                                    water_bodies.append({
                                        "id": f"osm-{el_type}-{el['id']}",
                                        "polygon": coords,
                                        "water_type": wtype,
                                        "latitude": round(clat, 7),
                                        "longitude": round(clon, 7),
                                        "name": tags.get("name"),
                                        "tags": tags,
                                        "source": "OpenStreetMap",
                                    })

                        return {
                            "status": "success",
                            "source": f"OpenStreetMap (Overpass via {mirror})",
                            "buildings": buildings,
                            "roads": roads,
                            "water": water_bodies,
                            "landmarks": landmarks,
                            "counts": {
                                "buildings": len(buildings),
                                "roads": len(roads),
                                "water": len(water_bodies),
                                "landmarks": len(landmarks)
                            }
                        }
            except Exception as e:
                logger.warning(f"Overpass mirror {mirror} failed: {e}")
                continue

        return None


# Global singleton provider instance
environment_data_provider = EnvironmentDataProvider()
