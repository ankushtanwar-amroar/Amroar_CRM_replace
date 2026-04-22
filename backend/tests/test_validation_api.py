"""
API Tests for DocFlow Template Validation Endpoints

Tests the validation contract via HTTP:
- POST /api/docflow/templates/validate-object (unsaved templates)
- POST /api/docflow/templates/{id}/validate (saved templates)

Verifies:
- Exactly 8 checks returned (deterministic count)
- Score reaches 100% for fully-configured Salesforce templates
- Correct error/warning statuses for various configurations
- Determinism across multiple runs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_EMAIL = "docflow@test.com"
TEST_PASSWORD = "DocFlow123!"


class TestValidationAPI:
    """API tests for validation endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if login_resp.status_code != 200:
            pytest.skip(f"Login failed: {login_resp.status_code} - {login_resp.text}")
        
        token = login_resp.json().get("access_token") or login_resp.json().get("token")
        if not token:
            pytest.skip(f"No token in login response: {login_resp.json()}")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
    
    # ─── Test 1: Empty body returns 8 checks with low score ───
    def test_validate_object_empty_body_returns_8_checks(self):
        """POST /api/docflow/templates/validate-object with EMPTY body returns {total_checks: 8, checks: [8 items], valid:false, score: low}"""
        response = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json={})
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify contract: exactly 8 checks
        assert data.get("total_checks") == 8, f"Expected total_checks=8, got {data.get('total_checks')}"
        assert len(data.get("checks", [])) == 8, f"Expected 8 checks, got {len(data.get('checks', []))}"
        
        # Empty template should not be valid
        assert data.get("valid") is False, "Empty template should not be valid"
        
        # Score should be low (< 50%)
        score = data.get("score", 0)
        assert score < 50, f"Empty template score should be < 50%, got {score}%"
        
        # Verify check structure
        for check in data.get("checks", []):
            assert "id" in check, "Check missing 'id'"
            assert "status" in check, "Check missing 'status'"
            assert "message" in check, "Check missing 'message'"
            assert "category" in check, "Check missing 'category'"
            assert check["status"] in ("passed", "warning", "error"), f"Invalid status: {check['status']}"
        
        print(f"✓ Empty body: total_checks={data['total_checks']}, score={score}%, valid={data['valid']}")
    
    # ─── Test 2: Fully-configured Salesforce template reaches 100% ───
    def test_validate_object_fully_configured_salesforce_100_percent(self):
        """POST /api/docflow/templates/validate-object with fully-configured Salesforce template returns score=100, valid=true, total_checks=8, zero warnings, zero errors"""
        
        fully_configured_template = {
            "name": "Sales NDA",
            "file_url": "https://example.com/nda.pdf",
            "crm_connection": {
                "provider": "salesforce",
                "connection_id": "sf-conn-123",
                "object_name": "Opportunity",
            },
            "recipients": [
                {"id": "r1", "role": "signer", "routing_order": 1},
                {"id": "r2", "role": "approver", "routing_order": 2},
            ],
            "routing_mode": "sequential",
            "field_placements": [
                {"type": "signature", "recipient_id": "r1"},
                {"type": "date", "recipient_id": "r1"},
                {"type": "merge", "mergeObject": "Opportunity", "mergeField": "Name"},
            ],
        }
        
        response = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json=fully_configured_template)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify contract
        assert data.get("total_checks") == 8, f"Expected total_checks=8, got {data.get('total_checks')}"
        assert data.get("score") == 100, f"Expected score=100, got {data.get('score')}. Failures: {[c for c in data.get('checks', []) if c['status'] != 'passed']}"
        assert data.get("valid") is True, "Fully configured template should be valid"
        
        # Zero warnings and errors
        warnings = data.get("warnings", [])
        errors = data.get("errors", [])
        assert len(warnings) == 0, f"Expected 0 warnings, got {len(warnings)}: {warnings}"
        assert len(errors) == 0, f"Expected 0 errors, got {len(errors)}: {errors}"
        
        print(f"✓ Fully configured SF template: score={data['score']}%, valid={data['valid']}, warnings={len(warnings)}, errors={len(errors)}")
    
    # ─── Test 3: Salesforce without connection_id returns error ───
    def test_validate_object_salesforce_no_connection_id_error(self):
        """POST /api/docflow/templates/validate-object with salesforce provider but NO connection_id returns status=error for crm_connection check"""
        
        template = {
            "name": "Test Template",
            "file_url": "https://example.com/test.pdf",
            "crm_connection": {
                "provider": "salesforce",
                "object_name": "Account",
                # NO connection_id
            },
            "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
            "routing_mode": "sequential",
            "field_placements": [{"type": "signature", "recipient_id": "r1"}],
        }
        
        response = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json=template)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Find crm_connection check
        crm_check = next((c for c in data.get("checks", []) if c["id"] == "crm_connection"), None)
        assert crm_check is not None, "crm_connection check not found"
        
        # Should be ERROR, not warning
        assert crm_check["status"] == "error", f"Expected crm_connection status='error', got '{crm_check['status']}'"
        assert "connection" in crm_check["message"].lower(), f"Error message should mention 'connection': {crm_check['message']}"
        
        print(f"✓ SF without connection_id: crm_connection status={crm_check['status']}, message='{crm_check['message'][:50]}...'")
    
    # ─── Test 4: Determinism - same payload twice returns identical results ───
    def test_validate_object_determinism(self):
        """Running the same payload twice returns identical scores and check statuses"""
        
        template = {
            "name": "Determinism Test",
            "file_url": "https://example.com/test.pdf",
            "crm_connection": {
                "provider": "salesforce",
                "connection_id": "c1",
                "object_name": "Account",
            },
            "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
            "routing_mode": "sequential",
            "field_placements": [{"type": "signature", "recipient_id": "r1"}],
        }
        
        # Run twice
        r1 = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json=template)
        r2 = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json=template)
        
        assert r1.status_code == 200 and r2.status_code == 200
        
        d1 = r1.json()
        d2 = r2.json()
        
        # Scores must match
        assert d1["score"] == d2["score"], f"Scores differ: {d1['score']} vs {d2['score']}"
        assert d1["total_checks"] == d2["total_checks"], f"total_checks differ: {d1['total_checks']} vs {d2['total_checks']}"
        
        # Check statuses must match
        statuses1 = [c["status"] for c in d1["checks"]]
        statuses2 = [c["status"] for c in d2["checks"]]
        assert statuses1 == statuses2, f"Check statuses differ: {statuses1} vs {statuses2}"
        
        print(f"✓ Determinism: Run1 score={d1['score']}%, Run2 score={d2['score']}% - IDENTICAL")
    
    # ─── Test 5: Merge field misconfiguration returns error ───
    def test_validate_object_merge_field_misconfiguration_error(self):
        """Merge field with empty mergeObject/mergeField returns status=error on merge_fields check with specific field label"""
        
        template = {
            "name": "Merge Test",
            "file_url": "https://example.com/test.pdf",
            "crm_connection": {
                "provider": "salesforce",
                "connection_id": "c1",
                "object_name": "Account",
            },
            "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
            "routing_mode": "sequential",
            "field_placements": [
                {"type": "signature", "recipient_id": "r1"},
                {"type": "merge", "label": "BrokenMergeField"},  # Missing mergeObject and mergeField
            ],
        }
        
        response = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json=template)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Find merge_fields check
        merge_check = next((c for c in data.get("checks", []) if c["id"] == "merge_fields"), None)
        assert merge_check is not None, "merge_fields check not found"
        
        # Should be ERROR
        assert merge_check["status"] == "error", f"Expected merge_fields status='error', got '{merge_check['status']}'"
        
        # Should mention the field label
        assert "BrokenMergeField" in merge_check["message"], f"Error message should mention 'BrokenMergeField': {merge_check['message']}"
        
        print(f"✓ Merge field misconfiguration: status={merge_check['status']}, message='{merge_check['message'][:60]}...'")
    
    # ─── Test 6: No CRM connection at all returns warning ───
    def test_validate_object_no_crm_connection_warning(self):
        """No CRM connection at all returns status=warning (soft — CRM is optional) on crm_connection check"""
        
        template = {
            "name": "No CRM Test",
            "file_url": "https://example.com/test.pdf",
            # NO crm_connection
            "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
            "routing_mode": "sequential",
            "field_placements": [{"type": "signature", "recipient_id": "r1"}],
        }
        
        response = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json=template)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Find crm_connection check
        crm_check = next((c for c in data.get("checks", []) if c["id"] == "crm_connection"), None)
        assert crm_check is not None, "crm_connection check not found"
        
        # Should be WARNING (CRM is optional)
        assert crm_check["status"] == "warning", f"Expected crm_connection status='warning', got '{crm_check['status']}'"
        
        print(f"✓ No CRM connection: status={crm_check['status']}, message='{crm_check['message'][:50]}...'")
    
    # ─── Test 7: Total checks count is always 8 ───
    def test_validate_object_total_checks_always_8(self):
        """Verify total_checks is always 8 regardless of template configuration"""
        
        test_cases = [
            {},  # Empty
            {"name": "Only Name"},  # Minimal
            {"name": "Full", "file_url": "x.pdf", "recipients": [{"id": "r1", "role": "signer"}]},  # Partial
        ]
        
        for i, template in enumerate(test_cases):
            response = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json=template)
            assert response.status_code == 200
            
            data = response.json()
            assert data.get("total_checks") == 8, f"Test case {i}: Expected total_checks=8, got {data.get('total_checks')}"
            assert len(data.get("checks", [])) == 8, f"Test case {i}: Expected 8 checks, got {len(data.get('checks', []))}"
        
        print(f"✓ Total checks always 8: Verified across {len(test_cases)} test cases")
    
    # ─── Test 8: Check IDs are consistent ───
    def test_validate_object_check_ids_consistent(self):
        """Verify all 8 check IDs are present and consistent"""
        
        expected_ids = {
            "template_name", "document_file", "crm_connection",
            "recipients", "routing_mode", "field_placements",
            "signature_fields", "merge_fields",
        }
        
        response = self.session.post(f"{BASE_URL}/api/docflow/templates/validate-object", json={})
        assert response.status_code == 200
        
        data = response.json()
        actual_ids = {c["id"] for c in data.get("checks", [])}
        
        assert actual_ids == expected_ids, f"Check IDs mismatch. Expected: {expected_ids}, Got: {actual_ids}"
        
        print(f"✓ Check IDs consistent: {sorted(actual_ids)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
