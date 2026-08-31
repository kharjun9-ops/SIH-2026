import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

def _get_allowed_origins() -> list:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    if raw.strip():
        return [orig.strip() for orig in raw.split(",") if orig.strip()]
    return [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "*"
    ]

def _find_data_dir() -> str:
    base_calc = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    candidates = [
        os.path.join(base_calc, "data"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
        os.path.join(os.getcwd(), "data"),
        "/app/data",
        "data"
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    return os.path.abspath(candidates[0])

class Settings:
    PROJECT_NAME: str = "SIH26175 3D Terrain Reconstruction"
    API_V1_PREFIX: str = "/api"
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Path configuration
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATA_DIR: str = _find_data_dir()
    DEM_DIR: str = os.path.join(DATA_DIR, "dem")
    SAMPLES_DIR: str = os.path.join(DATA_DIR, "samples")
    UPLOAD_DIR: str = os.path.join(BASE_DIR, "backend", "uploads") if os.path.exists(os.path.join(BASE_DIR, "backend")) else os.path.join(os.getcwd(), "uploads")
    
    # DEM settings
    DEFAULT_GRID_RESOLUTION: int = 128  # 128x128 grid for high FPS in Three.js
    MAX_GRID_RESOLUTION: int = 256
    DEFAULT_RADIUS_METERS: float = 2500.0
    MAX_RADIUS_METERS: float = 50000.0
    
    # External APIs
    OPENTOPOGRAPHY_API_KEY: str = os.getenv("OPENTOPOGRAPHY_API_KEY", "")
    OPEN_ELEVATION_API_URL: str = os.getenv("OPEN_ELEVATION_API_URL", "https://api.open-elevation.com/api/v1/lookup")
    
    # CORS
    ALLOWED_ORIGINS: list = _get_allowed_origins()

settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.DEM_DIR, exist_ok=True)
os.makedirs(settings.SAMPLES_DIR, exist_ok=True)
