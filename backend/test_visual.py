import os
import requests
import json
from dotenv import load_dotenv

# Load backend .env for credentials if needed
load_dotenv()

# Base URL for the backend
API_URL = "http://localhost:8000"

def test_visual_assistant():
    url = f"{API_URL}/api/docflow/templates/visual-assistant"
    
    # Mock request data
    payload = {
        "instruction": "Add a signature at the bottom right of the first page",
        "fields": [],
        "page_count": 1
    }
    
    headers = {
        "Content-Type": "application/json"
        # Normally would need Authorization header, but for a 
        # quick unit test on the logic, I could bypass or use a mock token.
    }
    
    print(f"Testing Visual Assistant endpoint: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        # Note: This will likely fail with 401 if auth is enforced
        # But we want to see if the route is registered.
        response = requests.post(url, json=payload, headers=headers)
        print(f"Response Status: {response.status_code}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_visual_assistant()
