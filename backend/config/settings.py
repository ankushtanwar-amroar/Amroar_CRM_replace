import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

class Settings:
    # MongoDB
    MONGO_URL: str = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    DB_NAME: str = os.environ.get('DB_NAME', 'crm_db')
    
    # Security
    JWT_SECRET: str = os.environ.get('JWT_SECRET', 'your-secret-key-here-change-in-production')
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = 24
    
    # Storage
    STORAGE_BASE_DIR: str = os.environ.get('STORAGE_BASE_DIR', '/app')
    
settings = Settings()

# Check if STORAGE_BASE_DIR is writable, fallback to local directory if not
if not os.access('/', os.W_OK) and settings.STORAGE_BASE_DIR == '/app':
    settings.STORAGE_BASE_DIR = str(ROOT_DIR)

storage_dir = Path(settings.STORAGE_BASE_DIR) / 'uploads'
os.makedirs(storage_dir, exist_ok=True)
