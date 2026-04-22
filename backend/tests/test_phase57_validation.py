"""
Phase 57 Validation API Tests

Tests for:
1. Validation API returns exactly 6 checks (recipients + routing_mode removed)
2. Categories are {Template, CRM, Fields} only
3. No recipient/routing mentions in any check label or message
4. Score math is deterministic (passed_count / 6 * 100)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPhase57Validation:
    """Phase 57: Validation API with 6 checks (no recipient/routing)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token for API calls"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@gmail.com",
            "password": "test123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json().get("access_token")
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_validation_returns_6_checks(self):
        """Verify total_checks is exactly 6"""
        response = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json={"name": "Test Template", "file_url": "test.pdf"}
        )
        assert response.status_code == 200, f"API failed: {response.text}"
        data = response.json()
        
        assert data["total_checks"] == 6, f"Expected 6 checks, got {data['total_checks']}"
        assert len(data["checks"]) == 6, f"Expected 6 check entries, got {len(data['checks'])}"
    
    def test_validation_categories_correct(self):
        """Verify categories are {Template, CRM, Fields} only"""
        response = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json={"name": "Test", "file_url": "test.pdf"}
        )
        assert response.status_code == 200
        data = response.json()
        
        categories = set(check["category"] for check in data["checks"])
        expected_categories = {"Template", "CRM", "Fields"}
        
        assert categories == expected_categories, f"Expected {expected_categories}, got {categories}"
    
    def test_no_recipient_routing_mentions(self):
        """Verify no recipient/routing mentions in any check"""
        response = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json={"name": "Test", "file_url": "test.pdf"}
        )
        assert response.status_code == 200
        data = response.json()
        
        for check in data["checks"]:
            label = check.get("label", "").lower()
            message = check.get("message", "").lower()
            check_id = check.get("id", "").lower()
            
            assert "recipient" not in label, f"Found 'recipient' in label: {check}"
            assert "recipient" not in message, f"Found 'recipient' in message: {check}"
            assert "recipient" not in check_id, f"Found 'recipient' in id: {check}"
            
            assert "routing" not in label, f"Found 'routing' in label: {check}"
            assert "routing" not in message, f"Found 'routing' in message: {check}"
            assert "routing" not in check_id, f"Found 'routing' in id: {check}"
    
    def test_score_math_all_passing(self):
        """Verify score = 100 when all 6 checks pass (with warnings allowed)"""
        # Template with all required fields - CRM warning is OK
        response = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json={
                "name": "Complete Template",
                "file_url": "https://example.com/test.pdf",
                "crm_connection": {},  # No CRM = warning, not error
                "field_placements": [
                    {"id": "sig1", "type": "signature", "x": 100, "y": 100, "width": 200, "height": 80, "page": 1}
                ]
            }
        )
        assert response.status_code == 200
        data = response.json()
        
        # With no CRM connection, we get a warning (not error), so 5/6 pass = 83%
        passed_count = len([c for c in data["checks"] if c["status"] == "passed"])
        expected_score = round((passed_count / 6) * 100)
        
        assert data["score"] == expected_score, f"Expected score {expected_score}, got {data['score']}"
        assert data["total_checks"] == 6
    
    def test_score_math_partial_passing(self):
        """Verify score math with partial passing"""
        # Minimal template - only name passes
        response = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json={"name": "Minimal"}
        )
        assert response.status_code == 200
        data = response.json()
        
        passed_count = len([c for c in data["checks"] if c["status"] == "passed"])
        expected_score = round((passed_count / 6) * 100)
        
        assert data["score"] == expected_score, f"Expected score {expected_score}, got {data['score']}"
    
    def test_check_ids_correct(self):
        """Verify the 6 check IDs are correct"""
        response = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json={"name": "Test"}
        )
        assert response.status_code == 200
        data = response.json()
        
        check_ids = [check["id"] for check in data["checks"]]
        expected_ids = [
            "template_name",
            "document_file",
            "crm_connection",
            "field_placements",
            "signature_fields",
            "merge_fields"
        ]
        
        assert check_ids == expected_ids, f"Expected {expected_ids}, got {check_ids}"
    
    def test_validation_deterministic(self):
        """Verify validation is deterministic (same input = same output)"""
        payload = {
            "name": "Deterministic Test",
            "file_url": "test.pdf",
            "field_placements": [{"id": "f1", "type": "text", "x": 0, "y": 0, "width": 100, "height": 30, "page": 1}]
        }
        
        # Call twice
        response1 = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json=payload
        )
        response2 = requests.post(
            f"{BASE_URL}/api/docflow/templates/validate-object",
            headers=self.headers,
            json=payload
        )
        
        assert response1.status_code == 200
        assert response2.status_code == 200
        
        data1 = response1.json()
        data2 = response2.json()
        
        assert data1["score"] == data2["score"], "Score should be deterministic"
        assert data1["total_checks"] == data2["total_checks"], "Total checks should be deterministic"
        assert len(data1["checks"]) == len(data2["checks"]), "Check count should be deterministic"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
