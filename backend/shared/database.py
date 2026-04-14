"""
Shared Database Module
Provides database connection and common helpers used across the application.
"""
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone

# Load environment variables before creating database connection
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# Database setup - shared instance
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'crm_db')]


def prepare_for_mongo(data):
    """Convert datetime objects to ISO strings for MongoDB storage"""
    if isinstance(data, dict):
        prepared_data = {}
        for key, value in data.items():
            if isinstance(value, datetime):
                prepared_data[key] = value.isoformat()
            elif isinstance(value, dict):
                prepared_data[key] = prepare_for_mongo(value)
            elif isinstance(value, list):
                prepared_data[key] = [prepare_for_mongo(item) if isinstance(item, dict) else item for item in value]
            else:
                prepared_data[key] = value
        return prepared_data
    return data


def parse_from_mongo(data):
    """Convert ISO strings back to datetime objects"""
    if isinstance(data, dict):
        parsed_data = {}
        for key, value in data.items():
            if key.endswith('_at') or key.endswith('_date') or key == 'timestamp':
                if isinstance(value, str):
                    try:
                        parsed_data[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                    except (ValueError, TypeError):
                        parsed_data[key] = value
                else:
                    parsed_data[key] = value
            elif isinstance(value, dict):
                parsed_data[key] = parse_from_mongo(value)
            elif isinstance(value, list):
                parsed_data[key] = [parse_from_mongo(item) if isinstance(item, dict) else item for item in value]
            else:
                parsed_data[key] = value
        return parsed_data
    return data
