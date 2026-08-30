import os
import math
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from PIL import Image, ImageDraw, ImageFilter

SAMPLE_REGIONS = [
    {
        "id": "mount_fuji",
        "name": "Mount Fuji (Stratovolcano)",
        "country": "Japan",
        "center_lat": 35.3606,
        "center_lon": 138.7274,
        "radius_meters": 6000,
        "type": "volcano",
        "base_elevation": 900.0,
        "peak_elevation": 3776.0,
        "description": "Iconic active stratovolcano with symmetrical volcanic cone and central summit crater."
    },
    {
        "id": "grand_canyon",
        "name": "Grand Canyon (South Rim)",
        "country": "United States",
        "center_lat": 36.0544,
        "center_lon": -112.1401,
        "radius_meters": 5000,
        "type": "canyon",
        "base_elevation": 720.0,
        "peak_elevation": 2250.0,
        "description": "Steep-sided canyon carved by the Colorado River with stepped plateau terraces."
    },
    {
        "id": "mount_everest",
        "name": "Mount Everest & Khumbu",
        "country": "Nepal / Tibet",
        "center_lat": 27.9881,
        "center_lon": 86.9250,
        "radius_meters": 7000,
        "type": "himalaya",
        "base_elevation": 5100.0,
        "peak_elevation": 8848.0,
        "description": "Highest mountain peak on Earth with sharp arêtes, cirques, and glacier valleys."
    },
    {
        "id": "nandi_hills",
        "name": "Nandi Hills (Monolith)",
        "country": "India (Karnataka)",
        "center_lat": 13.3702,
        "center_lon": 77.6835,
        "radius_meters": 4000,
        "type": "monolith",
        "base_elevation": 900.0,
        "peak_elevation": 1478.0,
        "description": "Ancient granite hill fortress rising dramatically from the Deccan Plateau."
    },
    {
        "id": "western_ghats",
        "name": "Western Ghats Escarpment",
        "country": "India (Maharashtra)",
        "center_lat": 18.7500,
        "center_lon": 73.4000,
        "radius_meters": 5000,
        "type": "escarpment",
        "base_elevation": 80.0,
        "peak_elevation": 1050.0,
        "description": "Dramatic cliff drop, waterfalls, and steep mountain ridges of the Western Ghats."
    }
]

def generate_fuji_elevation(x_grid: np.ndarray, y_grid: np.ndarray, base_el: float, peak_el: float) -> np.ndarray:
    """Generate stratovolcano elevation with central crater and radial volcanic ridges."""
    r = np.sqrt(x_grid**2 + y_grid**2)
    max_r = np.max(r)
    norm_r = r / (max_r + 1e-6)
    
    # Exponential volcanic profile
    cone = np.exp(-norm_r * 2.8)
    
    # Summit crater depression
    crater_mask = norm_r < 0.08
    crater_depth = np.maximum(0, 1.0 - (norm_r / 0.08)**2) * 0.15
    
    # Radial lava ribbing / ridges
    theta = np.arctan2(y_grid, x_grid)
    radial_ribs = 0.04 * np.sin(16 * theta) * np.sin(norm_r * np.pi) * (1.0 - norm_r)
    
    # Secondary parasitic cinder cone
    parasitic_dx = x_grid - 0.35 * max_r
    parasitic_dy = y_grid - 0.25 * max_r
    parasitic_r = np.sqrt(parasitic_dx**2 + parasitic_dy**2) / (max_r * 0.3)
    parasitic_cone = 0.18 * np.exp(-parasitic_r**2 * 4.0)
    
    elevation_norm = np.clip(cone - crater_depth + radial_ribs + parasitic_cone, 0.0, 1.0)
    return base_el + elevation_norm * (peak_el - base_el)

def generate_canyon_elevation(x_grid: np.ndarray, y_grid: np.ndarray, base_el: float, peak_el: float) -> np.ndarray:
    """Generate stepped canyon with sinuous river gorge and terrace levels."""
    # Sinuous river path
    river_x = 0.3 * np.sin(y_grid * 3.5) + 0.15 * np.cos(y_grid * 7.0)
    dist_to_river = np.abs(x_grid - river_x)
    
    # Stepped geological strata
    stepped_dist = np.floor(dist_to_river * 8.0) / 8.0
    cliff_profile = 1.0 - np.exp(-dist_to_river * 4.5)
    
    # Terraces
    terraces = 0.08 * np.sin(dist_to_river * 24.0)
    side_gullies = 0.06 * np.cos(y_grid * 18.0) * np.exp(-dist_to_river * 2.0)
    
    elevation_norm = np.clip(cliff_profile + terraces + side_gullies, 0.0, 1.0)
    return base_el + elevation_norm * (peak_el - base_el)

def generate_himalaya_elevation(x_grid: np.ndarray, y_grid: np.ndarray, base_el: float, peak_el: float) -> np.ndarray:
    """Generate rugged alpine mountain ridges with sharp arêtes and cirque valleys."""
    r = np.sqrt(x_grid**2 + y_grid**2)
    theta = np.arctan2(y_grid, x_grid)
    
    # 3 major ridges meeting at pyramid summit (Everest shape)
    ridge1 = np.exp(-np.abs(theta - 0.5)**2 * 6.0)
    ridge2 = np.exp(-np.abs(theta - 2.5)**2 * 6.0)
    ridge3 = np.exp(-np.abs(theta + 1.8)**2 * 6.0)
    ridges = np.maximum(ridge1, np.maximum(ridge2, ridge3)) * 0.45
    
    central_peak = np.exp(-r**1.8 * 2.2)
    valley_glaciers = -0.15 * (1.0 - ridges) * np.sin(r * 5.0)
    craggy_noise = 0.05 * np.sin(x_grid * 12.0) * np.cos(y_grid * 14.0)
    
    elevation_norm = np.clip(central_peak + ridges * central_peak + valley_glaciers + craggy_noise, 0.0, 1.0)
    return base_el + elevation_norm * (peak_el - base_el)

def generate_monolith_elevation(x_grid: np.ndarray, y_grid: np.ndarray, base_el: float, peak_el: float) -> np.ndarray:
    """Generate steep inselberg / monolith fortress on flat plateau (Nandi Hills)."""
    # Elliptical hill body
    dist_ellip = np.sqrt((x_grid * 1.4)**2 + (y_grid * 0.8)**2)
    steepness = 1.0 / (1.0 + np.exp((dist_ellip - 0.38) * 14.0))
    plateau_top = 0.05 * np.sin(x_grid * 6.0)
    
    elevation_norm = np.clip(steepness + plateau_top * steepness, 0.0, 1.0)
    return base_el + elevation_norm * (peak_el - base_el)

def generate_escarpment_elevation(x_grid: np.ndarray, y_grid: np.ndarray, base_el: float, peak_el: float) -> np.ndarray:
    """Generate massive cliff face with plateau on one side and coastal plain on other."""
    cliff_line = 0.2 * np.sin(y_grid * 4.0) + 0.1 * np.cos(y_grid * 9.0)
    cliff_dist = x_grid - cliff_line
    
    # Sigmoid cliff profile
    cliff = 1.0 / (1.0 + np.exp(-cliff_dist * 16.0))
    ridges = 0.08 * np.sin(y_grid * 15.0) * np.exp(-np.abs(cliff_dist) * 4.0)
    
    elevation_norm = np.clip(cliff + ridges, 0.0, 1.0)
    return base_el + elevation_norm * (peak_el - base_el)

def create_geotiff_sample(region: dict, output_dir: str, grid_size: int = 256) -> str:
    """Generate a realistic GeoTIFF DEM file for a sample region."""
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, f"{region['id']}.tif")
    
    lat = region["center_lat"]
    lon = region["center_lon"]
    rad = region["radius_meters"]
    
    lat_delta = rad / 111320.0
    lon_delta = rad / (111320.0 * math.cos(math.radians(lat)))
    
    west = lon - lon_delta
    east = lon + lon_delta
    south = lat - lat_delta
    north = lat + lat_delta
    
    # Coordinates in normalized [-1, 1] range
    x_lin = np.linspace(-1, 1, grid_size)
    y_lin = np.linspace(1, -1, grid_size)  # north to south
    x_grid, y_grid = np.meshgrid(x_lin, y_lin)
    
    rtype = region["type"]
    base_el = region["base_elevation"]
    peak_el = region["peak_elevation"]
    
    if rtype == "volcano":
        elev = generate_fuji_elevation(x_grid, y_grid, base_el, peak_el)
    elif rtype == "canyon":
        elev = generate_canyon_elevation(x_grid, y_grid, base_el, peak_el)
    elif rtype == "himalaya":
        elev = generate_himalaya_elevation(x_grid, y_grid, base_el, peak_el)
    elif rtype == "monolith":
        elev = generate_monolith_elevation(x_grid, y_grid, base_el, peak_el)
    elif rtype == "escarpment":
        elev = generate_escarpment_elevation(x_grid, y_grid, base_el, peak_el)
    else:
        elev = base_el + (np.sin(x_grid * 3) * np.cos(y_grid * 3) + 1.0) * 0.5 * (peak_el - base_el)
        
    elev = elev.astype(np.float32)
    transform = from_bounds(west, south, east, north, grid_size, grid_size)
    
    with rasterio.open(
        file_path,
        'w',
        driver='GTiff',
        height=grid_size,
        width=grid_size,
        count=1,
        dtype=elev.dtype,
        crs='+proj=latlong',
        transform=transform,
        nodata=-9999.0
    ) as dst:
        dst.write(elev, 1)
        
    return file_path

def create_sample_images(samples_dir: str):
    """Generate realistic high-resolution landscape reference images for CV testing."""
    os.makedirs(samples_dir, exist_ok=True)
    
    for region in SAMPLE_REGIONS:
        img_path = os.path.join(samples_dir, f"{region['id']}.jpg")
        w, h = 800, 600
        img = Image.new("RGB", (w, h), color=(135, 206, 235)) # Sky blue
        draw = ImageDraw.Draw(img)
        
        # Gradient sky
        for y in range(int(h * 0.55)):
            r = int(100 + (135 - 100) * (y / (h * 0.55)))
            g = int(150 + (206 - 150) * (y / (h * 0.55)))
            b = int(220 + (250 - 220) * (y / (h * 0.55)))
            draw.line([(0, y), (w, y)], fill=(r, g, b))
            
        # Draw terrain silhouette based on region type
        points = []
        rtype = region["type"]
        
        if rtype == "volcano":
            # Stratovolcano profile
            points = [(0, h)]
            for x in range(0, w + 1, 5):
                nx = (x - w / 2) / (w / 2)
                cone_h = math.exp(-abs(nx) * 2.5) * (h * 0.5)
                # Summit crater dip
                if abs(nx) < 0.08:
                    cone_h -= (1.0 - (abs(nx)/0.08)**2) * (h * 0.05)
                y_val = int(h * 0.85 - cone_h + math.sin(x * 0.05) * 4)
                points.append((x, y_val))
            points.append((w, h))
            draw.polygon(points, fill=(80, 70, 65))
            
            # Snow cap on top
            snow_points = [(int(w*0.35), int(h*0.52))]
            for x in range(int(w*0.35), int(w*0.65)+1, 4):
                nx = (x - w / 2) / (w / 2)
                cone_h = math.exp(-abs(nx) * 2.5) * (h * 0.5)
                if abs(nx) < 0.08:
                    cone_h -= (1.0 - (abs(nx)/0.08)**2) * (h * 0.05)
                y_val = int(h * 0.85 - cone_h)
                snow_points.append((x, y_val))
            snow_points.append((int(w*0.65), int(h*0.52)))
            draw.polygon(snow_points, fill=(240, 245, 255))
            
        elif rtype == "canyon":
            # Stepped canyon layers
            for layer, col in enumerate([(190, 110, 70), (160, 90, 60), (130, 70, 50), (100, 50, 40)]):
                layer_pts = [(0, h)]
                base_y = int(h * 0.4 + layer * 45)
                for x in range(0, w + 1, 10):
                    y_val = int(base_y + math.sin(x * 0.02 + layer) * 15 + math.cos(x * 0.05) * 8)
                    layer_pts.append((x, y_val))
                layer_pts.append((w, h))
                draw.polygon(layer_pts, fill=col)
                
        elif rtype == "himalaya":
            # Jagged mountain peaks
            points = [(0, h)]
            for x in range(0, w + 1, 5):
                peak1 = math.exp(-((x - w*0.5)/(w*0.25))**2) * (h * 0.6)
                peak2 = math.exp(-((x - w*0.2)/(w*0.2))**2) * (h * 0.4)
                peak3 = math.exp(-((x - w*0.8)/(w*0.2))**2) * (h * 0.45)
                craggy = math.sin(x * 0.08) * 12 + math.cos(x * 0.15) * 6
                y_val = int(h * 0.88 - max(peak1, peak2, peak3) + craggy)
                points.append((x, y_val))
            points.append((w, h))
            draw.polygon(points, fill=(75, 80, 95))
            
            # Glaciers & snow
            for x in range(0, w, 8):
                if (w*0.35 <= x <= w*0.65) or (w*0.12 <= x <= w*0.28):
                    draw.line([(x, int(h*0.35 + math.sin(x)*10)), (x+6, int(h*0.55 + math.cos(x)*12))], fill=(235, 245, 255), width=3)
        else:
            # General hills and terrain
            points = [(0, h)]
            for x in range(0, w + 1, 5):
                hill = math.sin(x * 0.008) * (h * 0.25) + math.cos(x * 0.02) * (h * 0.1)
                y_val = int(h * 0.65 - hill)
                points.append((x, y_val))
            points.append((w, h))
            draw.polygon(points, fill=(60, 110, 60))
            
        img = img.filter(ImageFilter.SMOOTH_MORE)
        img.save(img_path, "JPEG", quality=92)

def generate_all_samples(base_data_dir: str):
    """Generate all sample GeoTIFF DEMs and preview images."""
    dem_dir = os.path.join(base_data_dir, "dem")
    samples_dir = os.path.join(base_data_dir, "samples")
    
    print("Generating authentic sample GeoTIFF DEMs...")
    for region in SAMPLE_REGIONS:
        tif_path = create_geotiff_sample(region, dem_dir)
        print(f"  [OK] Created DEM: {tif_path}")
        
    print("Generating reference landscape imagery...")
    create_sample_images(samples_dir)
    print("  [OK] Created sample reference images")

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, "..", "..", ".."))
    data_dir = os.path.join(project_root, "data")
    generate_all_samples(data_dir)
