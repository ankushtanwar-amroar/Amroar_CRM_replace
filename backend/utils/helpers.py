"""
Utility helper functions for data transformation
"""
from datetime import datetime, date, time


def prepare_for_mongo(data: dict) -> dict:
    """Convert Python date/time objects to ISO strings for MongoDB storage"""
    result = data.copy()
    for key, value in result.items():
        if isinstance(value, date) and not isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, time):
            result[key] = value.strftime('%H:%M:%S')
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = prepare_for_mongo(value)
    return result


def parse_from_mongo(item: dict) -> dict:
    """Parse MongoDB documents, converting ISO strings back to Python objects where needed"""
    result = item.copy()
    for key, value in result.items():
        if isinstance(value, str):
            # Try to parse as date
            try:
                if 'T' in value and len(value) > 10:
                    # Likely datetime
                    result[key] = datetime.fromisoformat(value.replace('Z', '+00:00'))
                elif ':' in value and len(value) == 8:
                    # Likely time
                    result[key] = datetime.strptime(value, '%H:%M:%S').time()
                elif '-' in value and len(value) == 10:
                    # Likely date
                    result[key] = datetime.fromisoformat(value).date()
            except (ValueError, AttributeError):
                pass
        elif isinstance(value, dict):
            result[key] = parse_from_mongo(value)
    return result
