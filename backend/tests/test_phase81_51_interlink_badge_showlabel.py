"""
Phase 81.51 — Interlink Badge + Show Label in Preview/Signing Tests

Tests:
1. Backend regression: GET /api/docflow/templates/{id} returns linked_to AND showLabelInPreview
2. PUT /api/docflow/templates/{id} accepts showLabelInPreview in field_placements
3. Templates without showLabelInPreview continue to work (default = label visible)
4. Interlinked fanout still works after showLabelInPreview is added
"""

import pytest
import requests
import os
import uuid
from datetime import datetime

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

# Test credentials
TEST_EMAIL = "admin@democorp.com"
TEST_PASSWORD = "DemoPass123!"


class TestPhase8151InterlinkBadgeShowLabel:
    """Phase 81.51 — Interlink Badge + Show Label in Preview/Signing Tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Store created template IDs for cleanup
        self.created_template_ids = []
        
        yield
        
        # Cleanup: delete test templates
        for tid in self.created_template_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/docflow/templates/{tid}")
            except:
                pass
    
    def test_01_create_template_with_showLabelInPreview_false(self):
        """Test: Create template with showLabelInPreview=false on a text field"""
        template_data = {
            "name": f"Phase81_51_ShowLabel_Test_{uuid.uuid4().hex[:8]}",
            "description": "Test template for showLabelInPreview feature",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": f"text_field_{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "label": "Address Field",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 40,
                    "page": 1,
                    "showLabelInPreview": False,  # NEW: Hide label in preview/signing
                    "placeholder": "Enter address",
                    "required": False
                }
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert resp.status_code == 201, f"Create template failed: {resp.text}"
        
        template = resp.json()
        self.created_template_ids.append(template["id"])
        
        # Verify field_placements contains showLabelInPreview
        placements = template.get("field_placements", [])
        assert len(placements) == 1, "Expected 1 field placement"
        assert placements[0].get("showLabelInPreview") == False, "showLabelInPreview should be False"
        
        print(f"✓ Created template with showLabelInPreview=false: {template['id']}")
    
    def test_02_get_template_returns_showLabelInPreview(self):
        """Test: GET /api/docflow/templates/{id} returns showLabelInPreview field"""
        # Create template first
        template_data = {
            "name": f"Phase81_51_GetTest_{uuid.uuid4().hex[:8]}",
            "description": "Test GET returns showLabelInPreview",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": f"text_field_{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "label": "Test Field",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 40,
                    "page": 1,
                    "showLabelInPreview": False
                }
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert create_resp.status_code == 201
        template_id = create_resp.json()["id"]
        self.created_template_ids.append(template_id)
        
        # GET the template
        get_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}")
        assert get_resp.status_code == 200, f"GET template failed: {get_resp.text}"
        
        template = get_resp.json()
        placements = template.get("field_placements", [])
        assert len(placements) == 1
        assert placements[0].get("showLabelInPreview") == False, "GET should return showLabelInPreview=false"
        
        print(f"✓ GET template returns showLabelInPreview correctly")
    
    def test_03_update_template_with_showLabelInPreview(self):
        """Test: PUT /api/docflow/templates/{id} accepts showLabelInPreview"""
        # Create template without showLabelInPreview
        template_data = {
            "name": f"Phase81_51_UpdateTest_{uuid.uuid4().hex[:8]}",
            "description": "Test UPDATE with showLabelInPreview",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": "text_field_update_test",
                    "type": "text",
                    "label": "Update Test Field",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 40,
                    "page": 1
                    # No showLabelInPreview initially
                }
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert create_resp.status_code == 201
        template_id = create_resp.json()["id"]
        self.created_template_ids.append(template_id)
        
        # Update with showLabelInPreview=false
        update_data = {
            "field_placements": [
                {
                    "id": "text_field_update_test",
                    "type": "text",
                    "label": "Update Test Field",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 40,
                    "page": 1,
                    "showLabelInPreview": False  # Add showLabelInPreview
                }
            ]
        }
        
        update_resp = self.session.put(f"{BASE_URL}/api/docflow/templates/{template_id}", json=update_data)
        assert update_resp.status_code == 200, f"Update template failed: {update_resp.text}"
        
        # Verify the update persisted
        get_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}")
        assert get_resp.status_code == 200
        
        template = get_resp.json()
        placements = template.get("field_placements", [])
        assert len(placements) == 1
        assert placements[0].get("showLabelInPreview") == False, "showLabelInPreview should persist after update"
        
        print(f"✓ PUT template accepts and persists showLabelInPreview")
    
    def test_04_template_without_showLabelInPreview_defaults_to_visible(self):
        """Test: Templates without showLabelInPreview continue to work (default = label visible)"""
        # Create template without showLabelInPreview
        template_data = {
            "name": f"Phase81_51_DefaultTest_{uuid.uuid4().hex[:8]}",
            "description": "Test default behavior without showLabelInPreview",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": "text_field_default_test",
                    "type": "text",
                    "label": "Default Test Field",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 40,
                    "page": 1
                    # No showLabelInPreview - should default to true (visible)
                }
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert create_resp.status_code == 201
        template_id = create_resp.json()["id"]
        self.created_template_ids.append(template_id)
        
        # GET the template
        get_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}")
        assert get_resp.status_code == 200
        
        template = get_resp.json()
        placements = template.get("field_placements", [])
        assert len(placements) == 1
        
        # showLabelInPreview should be undefined (not explicitly set)
        # Frontend treats undefined as true (default visible)
        show_label = placements[0].get("showLabelInPreview")
        # Either undefined/None or True is acceptable (default behavior)
        assert show_label is None or show_label == True, f"Default should be None or True, got: {show_label}"
        
        print(f"✓ Template without showLabelInPreview works correctly (default visible)")
    
    def test_05_linked_to_and_showLabelInPreview_coexist(self):
        """Test: linked_to and showLabelInPreview can coexist on the same field"""
        template_data = {
            "name": f"Phase81_51_CoexistTest_{uuid.uuid4().hex[:8]}",
            "description": "Test linked_to and showLabelInPreview coexistence",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": "text_field_coexist_test",
                    "type": "text",
                    "label": "Coexist Test Field",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 40,
                    "page": 1,
                    "showLabelInPreview": False,
                    "linked_to": {
                        "enabled": True,
                        "template_id": "some-template-id",
                        "field_id": "some-field-id",
                        "read_only_target": True
                    }
                }
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert create_resp.status_code == 201
        template_id = create_resp.json()["id"]
        self.created_template_ids.append(template_id)
        
        # GET and verify both fields exist
        get_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}")
        assert get_resp.status_code == 200
        
        template = get_resp.json()
        placements = template.get("field_placements", [])
        assert len(placements) == 1
        
        field = placements[0]
        assert field.get("showLabelInPreview") == False, "showLabelInPreview should be False"
        assert field.get("linked_to", {}).get("enabled") == True, "linked_to.enabled should be True"
        assert field.get("linked_to", {}).get("template_id") == "some-template-id"
        assert field.get("linked_to", {}).get("field_id") == "some-field-id"
        assert field.get("linked_to", {}).get("read_only_target") == True
        
        print(f"✓ linked_to and showLabelInPreview coexist correctly")
    
    def test_06_showLabelInPreview_true_explicit(self):
        """Test: showLabelInPreview=true is explicitly saved and returned"""
        template_data = {
            "name": f"Phase81_51_ExplicitTrueTest_{uuid.uuid4().hex[:8]}",
            "description": "Test explicit showLabelInPreview=true",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": "text_field_explicit_true",
                    "type": "text",
                    "label": "Explicit True Field",
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 40,
                    "page": 1,
                    "showLabelInPreview": True  # Explicitly true
                }
            ]
        }
        
        create_resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert create_resp.status_code == 201
        template_id = create_resp.json()["id"]
        self.created_template_ids.append(template_id)
        
        # GET and verify
        get_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}")
        assert get_resp.status_code == 200
        
        template = get_resp.json()
        placements = template.get("field_placements", [])
        assert len(placements) == 1
        assert placements[0].get("showLabelInPreview") == True, "showLabelInPreview should be True"
        
        print(f"✓ showLabelInPreview=true is explicitly saved and returned")
    
    def test_07_code_review_frontend_interlink_badge_canvas(self):
        """Code review: Verify canvas interlink badge exists in MultiPageVisualBuilder.js"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-n", "canvas-interlink-", "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"],
            capture_output=True, text=True
        )
        
        assert "canvas-interlink-" in result.stdout, "canvas-interlink-{field.id} data-testid not found"
        assert "isInterlinked(field)" in open("/app/frontend/src/docflow/components/MultiPageVisualBuilder.js").read(), \
            "isInterlinked helper not found"
        
        print(f"✓ Canvas interlink badge code exists: {result.stdout.strip()}")
    
    def test_08_code_review_frontend_interlink_badge_placed_list(self):
        """Code review: Verify placed list interlink badge exists in MultiPageVisualBuilder.js"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-n", "placed-list-interlink-", "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"],
            capture_output=True, text=True
        )
        
        assert "placed-list-interlink-" in result.stdout, "placed-list-interlink-{field.id} data-testid not found"
        
        print(f"✓ Placed list interlink badge code exists: {result.stdout.strip()}")
    
    def test_09_code_review_frontend_interlink_badge_signer(self):
        """Code review: Verify signer interlink badge exists in InteractiveDocumentViewer.js"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-n", "signer-interlink-", "/app/frontend/src/docflow/components/InteractiveDocumentViewer.js"],
            capture_output=True, text=True
        )
        
        assert "signer-interlink-" in result.stdout, "signer-interlink-{field.id} data-testid not found"
        
        # Verify it appears in both page mode and scroll mode
        lines = result.stdout.strip().split('\n')
        assert len(lines) >= 2, f"Expected signer-interlink in both page and scroll modes, found {len(lines)} occurrences"
        
        print(f"✓ Signer interlink badge code exists in both modes: {result.stdout.strip()}")
    
    def test_10_code_review_frontend_show_label_checkbox(self):
        """Code review: Verify Show Label checkbox exists in MultiPageVisualBuilder.js"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-n", "field-show-label-checkbox", "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"],
            capture_output=True, text=True
        )
        
        assert "field-show-label-checkbox" in result.stdout, "field-show-label-checkbox data-testid not found"
        
        # Verify the checkbox is connected to showLabelInPreview property
        content = open("/app/frontend/src/docflow/components/MultiPageVisualBuilder.js").read()
        assert "showLabelInPreview" in content, "showLabelInPreview property not found"
        assert "Show Label in Preview / Signing" in content, "Checkbox label text not found"
        
        print(f"✓ Show Label checkbox code exists: {result.stdout.strip()}")
    
    def test_11_code_review_frontend_visible_label_signer(self):
        """Code review: Verify visibleLabel logic exists in InteractiveDocumentViewer.js"""
        import subprocess
        
        result = subprocess.run(
            ["grep", "-n", "visibleLabel", "/app/frontend/src/docflow/components/InteractiveDocumentViewer.js"],
            capture_output=True, text=True
        )
        
        assert "visibleLabel" in result.stdout, "visibleLabel variable not found"
        
        # Verify the logic: showLabelInPreview === false ? '' : (field.label || '')
        content = open("/app/frontend/src/docflow/components/InteractiveDocumentViewer.js").read()
        assert "showLabelInPreview === false" in content, "showLabelInPreview check not found"
        
        print(f"✓ visibleLabel logic exists: {result.stdout.strip()[:200]}...")
    
    def test_12_regression_phase81_49_fanout_code_exists(self):
        """Regression: Verify Phase 81.49 fanout code still exists after Phase 81.51 changes"""
        import subprocess
        
        # Check backend fanout code
        result = subprocess.run(
            ["grep", "-n", "linked_to", "/app/backend/modules/docflow/api/package_public_routes.py"],
            capture_output=True, text=True
        )
        
        assert "linked_to" in result.stdout, "linked_to fanout code not found in package_public_routes.py"
        
        # Check frontend fanout code
        result2 = subprocess.run(
            ["grep", "-n", "fanoutLinkedFieldValue", "/app/frontend/src/docflow/pages/PackagePublicView.js"],
            capture_output=True, text=True
        )
        
        assert "fanoutLinkedFieldValue" in result2.stdout, "fanoutLinkedFieldValue not found in PackagePublicView.js"
        
        print(f"✓ Phase 81.49 fanout code still exists")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
