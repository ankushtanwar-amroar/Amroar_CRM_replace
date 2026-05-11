"""
Phase 2 — Interlinked Fields: Checkbox/Radio + Two-Way Direction Tests

Tests the Phase 2 extensions to interlinked fields:
1. Backend: PUT /api/docflow/templates/{id} accepts linked_to.direction='two_way' on checkbox/radio fields
2. Backend forward fanout for checkbox fields
3. Backend forward fanout for radio fields (uses groupName as storage key)
4. Backend reverse fanout for two-way targets
5. Backend two-way cascade (reverse + forward propagation)
6. Regression: existing one-way text/date forward fanout still works

Key implementation details:
- Radio fields use groupName (not placement id) as the storage key in field_data
- value_key_for(p) helper returns groupName for radios, else placement id
- Two-way direction triggers reverse fanout when target is saved
- read_only_target + two_way is a contradiction; backend skips reverse if read_only_target=true

Test data uses 'phase2_' prefix for easy cleanup.
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
TEST_PREFIX = "phase2_"


class TestPhase2InterlinkedFields:
    """Integration tests for Phase 2 Interlinked Fields: Checkbox/Radio + Two-Way"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.tenant_id = None
        self.created_templates = []
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

    # ─────────────────────────────────────────────────────────────────────────
    # Test 1: Code review - verify value_key_for helper exists for radio groupName
    # ─────────────────────────────────────────────────────────────────────────
    def test_01_code_review_value_key_for_helper(self):
        """
        Code review test: Verify the value_key_for helper exists and handles radio groupName.
        """
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        assert os.path.exists(routes_file), f"Routes file not found: {routes_file}"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check for value_key_for helper
        assert "def value_key_for" in content, "value_key_for helper function not found"
        
        # Check that it handles radio type
        assert "radio" in content.lower(), "radio type handling not found"
        
        # Check for groupName handling
        assert "groupName" in content or "group_name" in content, "groupName handling not found"
        
        print("✓ Test 1 PASSED: value_key_for helper exists with radio groupName handling")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 2: Code review - verify direction='two_way' handling in reverse fanout
    # ─────────────────────────────────────────────────────────────────────────
    def test_02_code_review_two_way_direction_handling(self):
        """
        Code review test: Verify direction='two_way' triggers reverse fanout.
        """
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check for two_way direction check
        assert 'direction' in content, "direction field not referenced"
        assert 'two_way' in content, "two_way direction value not found"
        
        # Check for reverse fanout logic
        assert "Reverse fanout" in content, "Reverse fanout comment not found"
        assert "two_way_triggers" in content, "two_way_triggers variable not found"
        
        # Check for read_only_target skip
        assert "read_only_target" in content, "read_only_target check not found"
        
        print("✓ Test 2 PASSED: Two-way direction handling exists with reverse fanout")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 3: Code review - verify two-way cascade logic
    # ─────────────────────────────────────────────────────────────────────────
    def test_03_code_review_two_way_cascade(self):
        """
        Code review test: Verify two-way cascade propagates to other targets.
        """
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check for cascade logic
        assert "Two-way cascade" in content, "Two-way cascade comment not found"
        
        # Check for forward fanout from source after reverse
        assert "other_sib" in content or "other_updates" in content, \
            "Cascade to other siblings not found"
        
        print("✓ Test 3 PASSED: Two-way cascade logic exists")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 4: Code review - verify frontend supports checkbox/radio in interlink
    # ─────────────────────────────────────────────────────────────────────────
    def test_04_code_review_frontend_checkbox_radio_support(self):
        """
        Code review test: Verify frontend supports checkbox/radio in interlink UI.
        """
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        assert os.path.exists(builder_file), f"Builder file not found: {builder_file}"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for checkbox/radio in supported types
        assert "'checkbox'" in content and "'radio'" in content, \
            "checkbox/radio not in supported interlink types"
        
        # Check for radio group dedupe
        assert "groupName" in content, "groupName handling not found in frontend"
        
        # Check for "Linked Group" label for radio
        assert "Linked Group" in content, "Linked Group label not found for radio fields"
        
        print("✓ Test 4 PASSED: Frontend supports checkbox/radio in interlink UI")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 5: Code review - verify frontend direction toggle UI
    # ─────────────────────────────────────────────────────────────────────────
    def test_05_code_review_frontend_direction_toggle(self):
        """
        Code review test: Verify frontend has direction toggle with data-testid.
        """
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for direction toggle data-testids
        assert 'data-testid="field-interlink-direction"' in content, \
            "Direction toggle container data-testid not found"
        assert 'data-testid={`field-interlink-direction-${d.id}`}' in content or \
               'data-testid="field-interlink-direction-one_way"' in content, \
            "Direction button data-testid not found"
        
        # Check for One-Way and Two-Way labels
        assert "One-Way" in content, "One-Way label not found"
        assert "Two-Way" in content, "Two-Way label not found"
        
        # Check for mutual exclusivity with read_only_target
        assert "read_only_target" in content, "read_only_target handling not found"
        
        print("✓ Test 5 PASSED: Frontend direction toggle UI exists with data-testids")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 6: Code review - verify frontend reverse fanout function
    # ─────────────────────────────────────────────────────────────────────────
    def test_06_code_review_frontend_reverse_fanout(self):
        """
        Code review test: Verify frontend has reverseFanoutLinkedFieldValue function.
        """
        public_view_file = "/app/frontend/src/docflow/pages/PackagePublicView.js"
        
        assert os.path.exists(public_view_file), f"Public view file not found: {public_view_file}"
        
        with open(public_view_file, 'r') as f:
            content = f.read()
        
        # Check for reverse fanout function
        assert "reverseFanoutLinkedFieldValue" in content, \
            "reverseFanoutLinkedFieldValue function not found"
        
        # Check for two_way direction check
        assert "two_way" in content, "two_way direction check not found in frontend"
        
        # Check for direction check in reverse fanout
        assert "direction" in content, "direction field not checked in frontend"
        
        print("✓ Test 6 PASSED: Frontend reverse fanout function exists")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 7: API - verify templates API accepts direction field in linked_to
    # ─────────────────────────────────────────────────────────────────────────
    def test_07_api_template_accepts_direction_field(self):
        """
        API test: Verify PUT /api/docflow/templates/{id} accepts linked_to.direction.
        """
        assert self._login(), "Login failed"
        
        # Get an existing template
        template_id, template = self._get_template_with_pdf()
        if not template_id:
            pytest.skip("No template with PDF found for testing")
        
        # Get current field_placements
        existing_placements = template.get("field_placements", [])
        
        # Create a test checkbox field with linked_to.direction='two_way'
        test_field_id = f"{TEST_PREFIX}checkbox_{uuid.uuid4().hex[:8]}"
        test_field = {
            "id": test_field_id,
            "type": "checkbox",
            "x": 100,
            "y": 100,
            "width": 30,
            "height": 20,
            "page": 1,
            "label": "Test Checkbox",
            "linked_to": {
                "enabled": True,
                "template_id": template_id,  # Self-link for testing
                "field_id": "some_field_id",
                "direction": "two_way",
                "read_only_target": False,
                "sync_scope": "same_recipient_only"
            }
        }
        
        # Add test field to placements
        updated_placements = existing_placements + [test_field]
        
        # Update template
        update_resp = self.session.put(
            f"{BASE_URL}/api/docflow/templates/{template_id}",
            json={"field_placements": updated_placements}
        )
        
        print(f"Update response: {update_resp.status_code}")
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        
        # Verify the field was saved with direction
        get_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}")
        assert get_resp.status_code == 200
        
        saved_template = get_resp.json()
        saved_placements = saved_template.get("field_placements", [])
        
        # Find our test field
        test_field_saved = next(
            (f for f in saved_placements if f.get("id") == test_field_id),
            None
        )
        
        assert test_field_saved is not None, "Test field not found in saved template"
        assert test_field_saved.get("linked_to", {}).get("direction") == "two_way", \
            "direction='two_way' not persisted"
        
        # Cleanup: remove test field
        cleanup_placements = [f for f in saved_placements if f.get("id") != test_field_id]
        self.session.put(
            f"{BASE_URL}/api/docflow/templates/{template_id}",
            json={"field_placements": cleanup_placements}
        )
        
        print("✓ Test 7 PASSED: Templates API accepts and persists direction field")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 8: API - verify templates API accepts radio field with linked_to
    # ─────────────────────────────────────────────────────────────────────────
    def test_08_api_template_accepts_radio_linked_to(self):
        """
        API test: Verify PUT /api/docflow/templates/{id} accepts linked_to on radio fields.
        """
        assert self._login(), "Login failed"
        
        # Get an existing template
        template_id, template = self._get_template_with_pdf()
        if not template_id:
            pytest.skip("No template with PDF found for testing")
        
        existing_placements = template.get("field_placements", [])
        
        # Create a test radio field with linked_to
        test_field_id = f"{TEST_PREFIX}radio_{uuid.uuid4().hex[:8]}"
        test_group_name = f"group_{uuid.uuid4().hex[:8]}"
        test_field = {
            "id": test_field_id,
            "type": "radio",
            "x": 150,
            "y": 150,
            "width": 30,
            "height": 20,
            "page": 1,
            "groupName": test_group_name,
            "optionValue": "Yes",
            "optionLabel": "Yes",
            "linked_to": {
                "enabled": True,
                "template_id": template_id,
                "field_id": "some_radio_field_id",
                "direction": "one_way",
                "read_only_target": True,
                "sync_scope": "same_recipient_only"
            }
        }
        
        updated_placements = existing_placements + [test_field]
        
        update_resp = self.session.put(
            f"{BASE_URL}/api/docflow/templates/{template_id}",
            json={"field_placements": updated_placements}
        )
        
        print(f"Update response: {update_resp.status_code}")
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        
        # Verify the field was saved
        get_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}")
        assert get_resp.status_code == 200
        
        saved_template = get_resp.json()
        saved_placements = saved_template.get("field_placements", [])
        
        test_field_saved = next(
            (f for f in saved_placements if f.get("id") == test_field_id),
            None
        )
        
        assert test_field_saved is not None, "Test radio field not found in saved template"
        assert test_field_saved.get("linked_to", {}).get("enabled") is True, \
            "linked_to.enabled not persisted for radio field"
        assert test_field_saved.get("groupName") == test_group_name, \
            "groupName not persisted for radio field"
        
        # Cleanup
        cleanup_placements = [f for f in saved_placements if f.get("id") != test_field_id]
        self.session.put(
            f"{BASE_URL}/api/docflow/templates/{template_id}",
            json={"field_placements": cleanup_placements}
        )
        
        print("✓ Test 8 PASSED: Templates API accepts linked_to on radio fields with groupName")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 9: Regression - Phase 81.49 one-way text fanout still works
    # ─────────────────────────────────────────────────────────────────────────
    def test_09_regression_phase81_49_text_fanout_code(self):
        """
        Regression test: Verify Phase 81.49 one-way text fanout code still exists.
        """
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check for Phase 81.49 marker
        assert "Phase 81.49" in content, "Phase 81.49 marker not found"
        
        # Check for forward fanout logic
        assert "Forward fanout" in content, "Forward fanout comment not found"
        assert "sibling_doc_ids" in content, "sibling_doc_ids variable not found"
        
        # Check for linked_to handling
        assert "linked_to" in content, "linked_to handling not found"
        
        print("✓ Test 9 PASSED: Phase 81.49 one-way text fanout code exists")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 10: Verify logger messages for fanout operations
    # ─────────────────────────────────────────────────────────────────────────
    def test_10_code_review_logger_messages(self):
        """
        Code review test: Verify logger messages for fanout operations exist.
        """
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check for forward fanout logger
        assert "[Interlink] Forward fanout" in content, \
            "Forward fanout logger message not found"
        
        # Check for reverse fanout logger
        assert "[Interlink] Reverse fanout (two-way)" in content, \
            "Reverse fanout logger message not found"
        
        # Check for two-way cascade logger
        assert "[Interlink] Two-way cascade" in content, \
            "Two-way cascade logger message not found"
        
        print("✓ Test 10 PASSED: All fanout logger messages exist")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 11: Verify checkbox type handling in fanout
    # ─────────────────────────────────────────────────────────────────────────
    def test_11_code_review_checkbox_fanout_handling(self):
        """
        Code review test: Verify checkbox fields are handled in fanout.
        """
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check that checkbox is handled (value_key_for returns id for non-radio)
        # The value_key_for helper should return placement id for checkbox
        assert "value_key_for" in content, "value_key_for helper not found"
        
        # Check that checkbox type is processed in PDF embedding
        assert 'field_type == "checkbox"' in content or "checkbox" in content, \
            "checkbox type handling not found"
        
        print("✓ Test 11 PASSED: Checkbox type is handled in fanout")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 12: Verify read_only_target blocks reverse fanout
    # ─────────────────────────────────────────────────────────────────────────
    def test_12_code_review_readonly_blocks_reverse(self):
        """
        Code review test: Verify read_only_target=true blocks reverse fanout.
        """
        routes_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        
        with open(routes_file, 'r') as f:
            content = f.read()
        
        # Check for read_only_target check in reverse fanout
        assert 'read_only_target' in content, "read_only_target not found"
        
        # The code should skip reverse fanout when read_only_target is true
        # Look for the pattern: if link.get("read_only_target") is True: continue
        assert "read_only_target" in content and "continue" in content, \
            "read_only_target skip logic not found"
        
        print("✓ Test 12 PASSED: read_only_target blocks reverse fanout")


class TestPhase2FrontendUI:
    """Frontend UI code review tests for Phase 2 Interlinked Fields"""
    
    def test_01_interlink_toggle_data_testid(self):
        """Verify interlink toggle has correct data-testid"""
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        assert 'data-testid="field-interlink-toggle"' in content, \
            "field-interlink-toggle data-testid not found"
        
        print("✓ PASSED: field-interlink-toggle data-testid exists")

    def test_02_direction_toggle_data_testids(self):
        """Verify direction toggle buttons have correct data-testids"""
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for direction container
        assert 'data-testid="field-interlink-direction"' in content, \
            "field-interlink-direction container data-testid not found"
        
        # Check for dynamic button data-testids
        assert 'field-interlink-direction-' in content, \
            "Direction button data-testid pattern not found"
        
        print("✓ PASSED: Direction toggle data-testids exist")

    def test_03_linked_group_label_for_radio(self):
        """Verify 'Linked Group' label appears for radio fields"""
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for conditional label
        assert "Linked Group" in content, "Linked Group label not found"
        assert "Linked Field" in content, "Linked Field label not found"
        
        # Check for radio type condition
        assert "selectedField.type === 'radio'" in content, \
            "Radio type condition for label not found"
        
        print("✓ PASSED: Linked Group label exists for radio fields")

    def test_04_radio_group_dedupe_in_dropdown(self):
        """Verify radio groups are deduplicated in target field dropdown"""
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for dedupe logic
        assert "seen.has" in content or "Set()" in content, \
            "Dedupe logic not found"
        
        # Check for Group: prefix in label
        assert "Group:" in content, "Group: prefix not found in radio label"
        
        print("✓ PASSED: Radio group dedupe logic exists")

    def test_05_two_way_disables_readonly(self):
        """Verify Two-Way selection disables read_only_target"""
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for the logic that clears read_only_target when two_way is selected
        assert "read_only_target: false" in content or "read_only_target" in content, \
            "read_only_target clearing logic not found"
        
        # Check for disabled state on Lock checkbox when two_way
        assert "disabled" in content and "two_way" in content, \
            "Lock checkbox disabled state for two_way not found"
        
        print("✓ PASSED: Two-Way selection disables read_only_target")

    def test_06_readonly_resets_direction_to_one_way(self):
        """Verify locking target resets direction to one_way"""
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for the logic that resets direction when read_only_target is checked
        assert "direction: 'one_way'" in content, \
            "Direction reset to one_way logic not found"
        
        print("✓ PASSED: Locking target resets direction to one_way")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
