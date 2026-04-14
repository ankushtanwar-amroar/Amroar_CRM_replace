import uuid
import time
from datetime import datetime, timezone
from ulid import ULID

class GlobalIDGenerator:
    """Generate time-ordered IDs (ULID and UUIDv7)"""
    
    @staticmethod
    def generate_ulid() -> str:
        """Generate ULID - preferred for new records"""
        return str(ULID())
    
    @staticmethod
    def generate_uuidv7() -> str:
        """Generate UUIDv7 (time-ordered UUID) - kept for compatibility"""
        timestamp_ms = int(time.time() * 1000)
        random_bytes = uuid.uuid4().bytes
        timestamp_bytes = timestamp_ms.to_bytes(6, byteorder='big')
        uuid_bytes = timestamp_bytes + random_bytes[6:]
        uuid_bytes = bytearray(uuid_bytes)
        uuid_bytes[6] = (uuid_bytes[6] & 0x0f) | 0x70
        uuid_bytes[8] = (uuid_bytes[8] & 0x3f) | 0x80
        return str(uuid.UUID(bytes=bytes(uuid_bytes)))
    
    @staticmethod
    def generate_record_id(use_ulid: bool = True) -> str:
        """Generate record ID - defaults to ULID"""
        return GlobalIDGenerator.generate_ulid() if use_ulid else GlobalIDGenerator.generate_uuidv7()
    
    @staticmethod
    def generate_public_id(prefix: str, record_id: str) -> str:
        """
        Generate public-facing ID: PREFIX-recordId
        Example: LEA-01J7Z3Q9WX... or ACC-01J7Z3Q9WX...
        """
        # For ULID (26 chars), use full ID
        # For UUID (36 chars with dashes), clean and use
        clean_id = record_id.replace('-', '').upper()
        return f"{prefix}-{clean_id}"
    
    @staticmethod
    def parse_public_id(public_id: str) -> tuple:
        """Parse public ID to extract prefix and record ID"""
        parts = public_id.split('-', 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid public ID format: {public_id}")
        return parts[0], parts[1]
    
    @staticmethod
    def is_valid_ulid(id_string: str) -> bool:
        """Check if string is valid ULID"""
        try:
            ULID.from_str(id_string)
            return True
        except:
            return False
