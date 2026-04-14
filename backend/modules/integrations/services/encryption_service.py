"""
Encryption Service - AES-256-GCM for credential encryption
"""
import os
import json
import base64
import logging
from typing import Dict, Any, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# Get encryption key from environment
ENCRYPTION_KEY = os.environ.get("ENCRYPTION_KEY")

# Generate a default key if not set (for development only)
if not ENCRYPTION_KEY:
    ENCRYPTION_KEY = "default-dev-key-32-bytes-long!!"
    logger.warning("Using default encryption key - set ENCRYPTION_KEY in production!")


def get_encryption_key() -> bytes:
    """Get the 32-byte encryption key"""
    key = ENCRYPTION_KEY.encode('utf-8')
    if len(key) < 32:
        # Pad to 32 bytes
        key = key.ljust(32, b'\0')
    elif len(key) > 32:
        # Truncate to 32 bytes
        key = key[:32]
    return key


def encrypt_credentials(credentials: Dict[str, Any]) -> str:
    """
    Encrypt credentials dictionary using AES-256-GCM.
    
    Args:
        credentials: Dictionary of credential key-value pairs
        
    Returns:
        Base64-encoded encrypted string (nonce + ciphertext)
    """
    try:
        key = get_encryption_key()
        aesgcm = AESGCM(key)
        
        # Generate random nonce
        nonce = os.urandom(12)
        
        # Serialize credentials to JSON
        plaintext = json.dumps(credentials).encode('utf-8')
        
        # Encrypt
        ciphertext = aesgcm.encrypt(nonce, plaintext, None)
        
        # Combine nonce + ciphertext and base64 encode
        encrypted = base64.b64encode(nonce + ciphertext).decode('utf-8')
        
        return encrypted
        
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        raise ValueError("Failed to encrypt credentials")


def decrypt_credentials(encrypted: str) -> Dict[str, Any]:
    """
    Decrypt encrypted credentials string.
    
    Args:
        encrypted: Base64-encoded encrypted string
        
    Returns:
        Dictionary of credential key-value pairs
    """
    try:
        key = get_encryption_key()
        aesgcm = AESGCM(key)
        
        # Decode base64
        data = base64.b64decode(encrypted.encode('utf-8'))
        
        # Extract nonce and ciphertext
        nonce = data[:12]
        ciphertext = data[12:]
        
        # Decrypt
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        
        # Parse JSON
        credentials = json.loads(plaintext.decode('utf-8'))
        
        return credentials
        
    except Exception as e:
        logger.error(f"Decryption failed: {e}")
        raise ValueError("Failed to decrypt credentials")


def mask_credentials(credentials: Dict[str, Any], auth_schema: list) -> Dict[str, str]:
    """
    Mask credential values for display.
    
    Args:
        credentials: Decrypted credentials dictionary
        auth_schema: Provider's auth schema to determine which fields to mask
        
    Returns:
        Dictionary with masked values
    """
    masked = {}
    
    # Get password/sensitive field keys from schema
    sensitive_keys = set()
    for field in auth_schema:
        if field.get('type') in ['password', 'api_key', 'secret']:
            sensitive_keys.add(field.get('key'))
    
    for key, value in credentials.items():
        if value is None:
            masked[key] = ""
        elif key in sensitive_keys or 'key' in key.lower() or 'secret' in key.lower() or 'password' in key.lower() or 'token' in key.lower():
            # Mask sensitive values
            if isinstance(value, str) and len(value) > 4:
                masked[key] = value[:2] + "•" * (len(value) - 4) + value[-2:]
            else:
                masked[key] = "••••••••"
        else:
            # Show non-sensitive values
            masked[key] = str(value) if value else ""
    
    return masked


def mask_single_value(value: str) -> str:
    """Mask a single sensitive value"""
    if not value:
        return ""
    if len(value) <= 4:
        return "••••"
    return value[:2] + "•" * min(len(value) - 4, 10) + value[-2:]
