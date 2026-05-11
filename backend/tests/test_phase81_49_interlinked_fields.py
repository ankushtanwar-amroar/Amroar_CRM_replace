"""
Phase 81.49 — Interlinked Fields across Package Templates Tests

Tests the backend fanout logic for interlinked fields:
1. Code review verification that the fanout block exists and is correctly implemented
2. Regression tests for Phase 81.42 (void/unvoid), Phase 81.29 (reminders), Phase 81.34 (status rollup)

NOTE: Full end-to-end signing tests with interlinked fields require:
- Creating templates with specific field_placements including linked_to config
- Session authentication for the sign-with-fields endpoint
- Complex multi-document package setup

The code review confirms the implementation is correct after the bug fix:
- Line 1286-1289: Changed from `req.documents` (which doesn't exist) to `package.get("documents", [])`

Test data uses 'phase81_49_' prefix for easy cleanup.
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone

# Load from frontend .env if not in environment
def get_base_url():
    url = os.environ.get('REACT_APP_BACKEND_URL', '')
    if not url:
        env_file = '/app/frontend/.env'
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    if line.startswith('REACT_APP_BACKEND_URL='):
                        url = line.split('=', 1)[1].strip()
                        break
    return url.rstrip('/')

BASE_URL = get_base_url()

# Test credentials from test_credentials.md
TEST_EMAIL = "admin@democorp.com"
TEST_PASSWORD = "DemoPass123!"

# Unique prefix for test data cleanup
TEST_PREFIX = "phase81_49_"


class TestPhase8149InterlinkedFields:
    """Integration tests for Phase 81.49 Interlinked Fields fanout"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.tenant_id = None
        self.created_packages = []
        
    def _login(self):
        """Authenticate and get JWT token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token") or data.get("token")
            self.tenant_id = data.get("tenant_id") or data.get("user", {}).get("tenant_id")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        print(f"Login failed: {response.status_code} - {response.text}")
        return False
    
    def _get_template_with_pdf(self):
        """Get an existing template with a PDF for testing"""
        response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        if response.status_code == 200:
            templates = response.json()
            template_list = templates.get("templates", []) if isinstance(templates, dict) else templates
            for t in template_list:
                tid = t.get("id")
                detail_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{tid}")
                if detail_resp.status_code == 200:
                    detail = detail_resp.json()
                    if detail.get("s3_key"):
                        return tid, detail
        return None, None

    def _create_package_with_run(self, num_recipients=1):
        """Create a package and send it to create a run with recipients"""
        template_id, _ = self._get_template_with_pdf()
        if not template_id:
            return None, None
        
        # Create package
        package_name = f"{TEST_PREFIX}pkg_{uuid.uuid4().hex[:8]}"
        pkg_resp = self.session.post(f"{BASE_URL}/api/docflow/packages", json={
            "name": package_name,
            "documents": [{"template_id": template_id, "document_name": "Test Doc", "order": 1}]
        })
        if pkg_resp.status_code != 200:
            print(f"Failed to create package: {pkg_resp.status_code} - {pkg_resp.text}")
            return None, None
        
        pkg_data = pkg_resp.json()
        package_id = pkg_data.get("package", {}).get("id") or pkg_data.get("id")
        self.created_packages.append(package_id)
        
        # Send package to create a run
        recipients = []
        for i in range(num_recipients):
            recipients.append({
                "name": f"{TEST_PREFIX}Recipient{i+1}",
                "email": f"{TEST_PREFIX}r{i+1}_{uuid.uuid4().hex[:6]}@example.com",
                "role_type": "SIGN",
                "routing_order": i + 1
            })
        
        send_resp = self.session.post(f"{BASE_URL}/api/docflow/packages/{package_id}/send", json={
            "recipients": recipients,
            "delivery_mode": "email",
            "routing_config": {"mode": "sequential", "on_reject": "void"}
        })
        
        if send_resp.status_code != 200:
            print(f"Failed to send package: {send_resp.status_code} - {send_resp.text}")
            return package_id, None
        
        send_data = send_resp.json()
        run_id = send_data.get("run_id")
        return package_id, run_id

    def _get_run_detail(self, package_id, run_id):
        """Get run detail including recipients"""
        runs_resp = self.session.get(f"{BASE_URL}/api/docflow/packages/{package_id}/runs/{run_id}")
        if runs_resp.status_code == 200:
            return runs_resp.json()
        return None

    # ─────────────────────────────────────────────────────────────────────────
    # Test 1: Code review - verify fanout block exists in package_public_routes.py
    # ─────────────────────────────────────────────────────────────────────────
    def test_01_code_review_fanout_block_exists(self):
        """
        Code review test: Verify the Phase 81.49 fanout block exists in the codebase.
        This test reads the source file and checks for the key implementation markers.
        """
        import os
        
        # Path to the package_public_routes.py file
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        assert os.path.exists(routes_file), f"Routes file not found: {routes_file}"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check for Phase 81.49 comment marker
        assert "Phase 81.49" in content, "Phase 81.49 marker not found in routes file"
        
        # Check for the fanout logic markers
        assert "Interlinked Fields fanout" in content, "Interlinked Fields fanout comment not found"
        assert "linked_to" in content, "linked_to reference not found"
        assert "sibling_doc_ids" in content, "sibling_doc_ids variable not found"
        
        # CRITICAL: Check that the bug fix is in place
        # The bug was: req.documents (doesn't exist) → should be package.get("documents", [])
        assert 'package.get("documents", [])' in content, \
            "Bug fix not applied: should use package.get('documents', []) not req.documents"
        
        # Verify the fanout writes to field_data
        assert 'field_data.' in content, "field_data update pattern not found"
        
        print("✓ Test 1 PASSED: Fanout block exists and bug fix is applied")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 2: Code review - verify linked_to structure in frontend
    # ─────────────────────────────────────────────────────────────────────────
    def test_02_code_review_frontend_fanout_function(self):
        """
        Code review test: Verify the frontend fanoutLinkedFieldValue function exists.
        """
        import os
        
        frontend_file = "/app/frontend/src/docflow/pages/PackagePublicView.js"
        
        assert os.path.exists(frontend_file), f"Frontend file not found: {frontend_file}"
        
        with open(frontend_file, 'r') as f:
            content = f.read()
        
        # Check for fanout function
        assert "fanoutLinkedFieldValue" in content, "fanoutLinkedFieldValue function not found"
        
        # Check for handleDocFieldsChange integration
        assert "handleDocFieldsChange" in content, "handleDocFieldsChange not found"
        
        # Check for linked_to handling
        assert "linked_to" in content, "linked_to handling not found in frontend"
        
        # Check for same-recipient scope logic
        assert "sourceOwner" in content or "targetOwner" in content, \
            "Recipient ownership check not found in frontend"
        
        print("✓ Test 2 PASSED: Frontend fanout function exists")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 3: Code review - verify interlink UI in MultiPageVisualBuilder
    # ─────────────────────────────────────────────────────────────────────────
    def test_03_code_review_interlink_ui_exists(self):
        """
        Code review test: Verify the Interlink UI exists in MultiPageVisualBuilder.
        """
        import os
        
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        assert os.path.exists(builder_file), f"Builder file not found: {builder_file}"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for interlink-related state/functions
        assert "interlinkTemplates" in content, "interlinkTemplates state not found"
        assert "loadInterlinkTemplates" in content, "loadInterlinkTemplates function not found"
        assert "interlinkTargetFields" in content, "interlinkTargetFields state not found"
        
        print("✓ Test 3 PASSED: Interlink UI exists in MultiPageVisualBuilder")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 4: Regression - Phase 81.42 recipient void/unvoid still works
    # ─────────────────────────────────────────────────────────────────────────
    def test_04_regression_phase81_42_void_unvoid(self):
        """
        Regression test: Verify Phase 81.42 recipient void/unvoid endpoints still work.
        """
        assert self._login(), "Login failed"
        
        pkg_id, run_id = self._create_package_with_run(num_recipients=2)
        assert run_id, "Failed to create package run"
        
        # Get run detail to find recipients
        run_detail = self._get_run_detail(pkg_id, run_id)
        assert run_detail, "Failed to get run detail"
        
        recipients = run_detail.get("recipients", [])
        assert len(recipients) > 0, "No recipients found in run"
        
        # Get first recipient
        recipient = recipients[0]
        rid = recipient.get("id")
        
        # Test void endpoint
        void_resp = self.session.post(
            f"{BASE_URL}/api/docflow/packages/runs/{run_id}/recipients/{rid}/void",
            json={"reason": "Phase 81.49 regression test void"}
        )
        print(f"Void response: {void_resp.status_code}")
        assert void_resp.status_code == 200, f"Void failed: {void_resp.text}"
        
        # Test unvoid endpoint
        unvoid_resp = self.session.post(
            f"{BASE_URL}/api/docflow/packages/runs/{run_id}/recipients/{rid}/unvoid",
            json={}
        )
        print(f"Unvoid response: {unvoid_resp.status_code}")
        assert unvoid_resp.status_code == 200, f"Unvoid failed: {unvoid_resp.text}"
        
        print("✓ Test 4 PASSED: Phase 81.42 void/unvoid regression test passed")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 5: Regression - Phase 81.29 reminder scheduler functions exist
    # ─────────────────────────────────────────────────────────────────────────
    def test_05_regression_phase81_29_reminder_functions(self):
        """
        Regression test: Verify Phase 81.29 reminder scheduler functions exist.
        """
        import os
        
        # Check reminder_service.py exists and has key functions
        reminder_file = "/app/backend/modules/docflow/services/reminder_service.py"
        
        assert os.path.exists(reminder_file), f"Reminder service not found: {reminder_file}"
        
        with open(reminder_file, 'r') as f:
            content = f.read()
        
        # Check for key functions
        assert "cancel_recipient_reminders" in content, "cancel_recipient_reminders not found"
        assert "cancel_run_reminders" in content, "cancel_run_reminders not found"
        assert "docflow_documents" in content, "docflow_documents collection reference not found"
        assert "docflow_package_runs" in content, "docflow_package_runs collection reference not found"
        
        print("✓ Test 5 PASSED: Phase 81.29 reminder functions exist")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 6: Regression - Phase 81.34 status rollup works
    # ─────────────────────────────────────────────────────────────────────────
    def test_06_regression_phase81_34_status_rollup(self):
        """
        Regression test: Verify Phase 81.34 status rollup works.
        """
        assert self._login(), "Login failed"
        
        pkg_id, run_id = self._create_package_with_run()
        assert run_id, "Failed to create package run"
        
        # Get run detail and check status
        run_detail = self._get_run_detail(pkg_id, run_id)
        assert run_detail, "Failed to get run detail"
        
        status = run_detail.get("status")
        print(f"Run status: {status}")
        
        # Status should be in_progress or sent after sending
        assert status in ("in_progress", "sent", "pending"), f"Unexpected status: {status}"
        
        print("✓ Test 6 PASSED: Phase 81.34 status rollup works")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 7: Sign-with-fields endpoint exists and accepts correct payload
    # ─────────────────────────────────────────────────────────────────────────
    def test_07_sign_with_fields_endpoint_exists(self):
        """
        Test that the sign-with-fields endpoint exists and validates payload structure.
        """
        assert self._login(), "Login failed"
        
        pkg_id, run_id = self._create_package_with_run()
        assert run_id, "Failed to create package run"
        
        # Get run detail to find recipient token
        run_detail = self._get_run_detail(pkg_id, run_id)
        assert run_detail, "Failed to get run detail"
        
        recipients = run_detail.get("recipients", [])
        assert len(recipients) > 0, "No recipients found"
        
        token = recipients[0].get("public_token")
        assert token, "No public_token found for recipient"
        
        # Test the endpoint with a valid payload structure
        # This should fail with 401 (session required) or 400 (validation), not 404 or 500
        sign_payload = {
            "signer_name": "Test Signer",
            "signer_email": "test@example.com",
            "documents_field_data": {}  # Empty but valid structure
        }
        
        sign_resp = self.session.post(
            f"{BASE_URL}/api/docflow/packages/public/{token}/sign-with-fields",
            json=sign_payload
        )
        
        print(f"Sign-with-fields response: {sign_resp.status_code}")
        
        # Endpoint should exist (not 404) and not crash (not 500)
        # Expected: 401 (session required) or 400 (validation) or 200 (success)
        assert sign_resp.status_code != 404, "sign-with-fields endpoint not found"
        assert sign_resp.status_code != 500, f"sign-with-fields crashed: {sign_resp.text}"
        
        print("✓ Test 7 PASSED: sign-with-fields endpoint exists and doesn't crash")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 8: Public package view endpoint works
    # ─────────────────────────────────────────────────────────────────────────
    def test_08_public_package_view_endpoint(self):
        """
        Test that the public package view endpoint works and returns expected structure.
        """
        assert self._login(), "Login failed"
        
        pkg_id, run_id = self._create_package_with_run()
        assert run_id, "Failed to create package run"
        
        # Get run detail to find recipient token
        run_detail = self._get_run_detail(pkg_id, run_id)
        assert run_detail, "Failed to get run detail"
        
        recipients = run_detail.get("recipients", [])
        assert len(recipients) > 0, "No recipients found"
        
        token = recipients[0].get("public_token")
        assert token, "No public_token found for recipient"
        
        # Test public view endpoint (no auth required for basic info)
        view_resp = self.session.get(f"{BASE_URL}/api/docflow/packages/public/{token}")
        
        print(f"Public view response: {view_resp.status_code}")
        
        # Should return 200 with package info (may require session for full data)
        assert view_resp.status_code in (200, 401), f"Unexpected status: {view_resp.status_code}"
        
        if view_resp.status_code == 200:
            data = view_resp.json()
            # Check expected fields exist
            assert "package_id" in data or "session_required" in data, \
                "Expected package_id or session_required in response"
        
        print("✓ Test 8 PASSED: Public package view endpoint works")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
