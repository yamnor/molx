from pathlib import Path
import os

PACKAGE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = PACKAGE_DIR.parents[1]
STATIC_DIR = PACKAGE_DIR / "static"

MAX_STRUCTURE_BYTES = int(
    os.getenv("MAX_STRUCTURE_BYTES", os.getenv("MAX_XYZ_BYTES", str(2 * 1024 * 1024)))
)
MAX_FETCH_REDIRECTS = int(os.getenv("MAX_FETCH_REDIRECTS", "3"))
FETCH_TIMEOUT_SECONDS = float(os.getenv("FETCH_TIMEOUT_SECONDS", "10"))
MAX_SOURCE_URL_LENGTH = int(os.getenv("MAX_SOURCE_URL_LENGTH", "2048"))
MAX_TITLE_LENGTH = int(os.getenv("MAX_TITLE_LENGTH", "160"))
MAX_REQUEST_BODY_BYTES = int(os.getenv("MAX_REQUEST_BODY_BYTES", "8192"))
MAX_STRUCTURE_LINES = int(os.getenv("MAX_STRUCTURE_LINES", "200000"))
MAX_ATOMS = int(os.getenv("MAX_ATOMS", "50000"))
MAX_MODELS = int(os.getenv("MAX_MODELS", "200"))
MAX_CUBE_GRID_POINTS = int(os.getenv("MAX_CUBE_GRID_POINTS", "2000000"))
REGISTER_RATE_LIMIT_PER_HOUR = int(os.getenv("REGISTER_RATE_LIMIT_PER_HOUR", "60"))
FETCH_RATE_LIMIT_PER_MINUTE = int(os.getenv("FETCH_RATE_LIMIT_PER_MINUTE", "120"))
OG_RATE_LIMIT_PER_MINUTE = int(os.getenv("OG_RATE_LIMIT_PER_MINUTE", "120"))
MAX_RATE_LIMIT_IDENTITIES = int(os.getenv("MAX_RATE_LIMIT_IDENTITIES", "10000"))
TRUSTED_PROXY_CIDRS = [
    cidr.strip()
    for cidr in os.getenv("TRUSTED_PROXY_CIDRS", "").split(",")
    if cidr.strip()
]
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("MOLX_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
DEFAULT_DB_PATH = PROJECT_DIR / "data" / "main.db"
DB_PATH = Path(os.getenv("MOLX_DB_PATH", str(DEFAULT_DB_PATH))).expanduser()

SUPPORTED_FORMATS = ("xyz", "pdb", "sdf", "mol2", "cif", "cube")
EXTENSION_FORMATS = {format_name: format_name for format_name in SUPPORTED_FORMATS}
