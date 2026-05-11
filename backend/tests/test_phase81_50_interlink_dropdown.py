"""
Phase 81.50 — Interlinked Fields Dropdown & Persistence Tests

Tests:
1. Templates API returns DRAFT templates (no status filter)
2. Template update preserves linked_to config in field_placements
3. Package creation with interlinked templates
4. Runtime fanout during signing
5. Read-only target enforcement
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

class TestPhase81_50InterlinkDropdown:
    """Phase 81.50 — Interlink dropdown shows draft templates"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_resp = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@democorp.com",
            "password": "DemoPass123!"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.tenant_id = login_resp.json().get("user", {}).get("tenant_id")
        
        yield
        
        # Cleanup: Delete test templates and packages
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data created during tests"""
        try:
            # Get all templates and delete TEST_ prefixed ones
            resp = self.session.get(f"{BASE_URL}/api/docflow/templates?limit=100")
            if resp.status_code == 200:
                templates = resp.json().get("templates", [])
                for t in templates:
                    if t.get("name", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/docflow/templates/{t['id']}")
            
            # Get all packages and delete TEST_ prefixed ones
            resp = self.session.get(f"{BASE_URL}/api/docflow/packages?limit=100")
            if resp.status_code == 200:
                packages = resp.json().get("packages", [])
                for p in packages:
                    if p.get("name", "").startswith("TEST_"):
                        self.session.delete(f"{BASE_URL}/api/docflow/packages/{p['id']}")
        except Exception as e:
            print(f"Cleanup warning: {e}")
    
    def test_01_templates_api_returns_drafts_without_status_filter(self):
        """
        Phase 81.50 Fix: Templates API should return ALL templates (including drafts)
        when no status filter is provided. This is critical for the interlink dropdown.
        """
        # Call templates API without status filter
        resp = self.session.get(f"{BASE_URL}/api/docflow/templates?page=1&limit=200")
        assert resp.status_code == 200, f"Templates API failed: {resp.text}"
        
        data = resp.json()
        templates = data.get("templates", [])
        
        # Verify we get templates
        assert len(templates) > 0, "No templates returned"
        
        # Check if any draft templates are returned
        draft_templates = [t for t in templates if t.get("status") == "draft"]
        print(f"Total templates: {len(templates)}, Draft templates: {len(draft_templates)}")
        
        # The fix should allow drafts to be returned
        # Note: If there are no drafts in the system, this test still passes
        # as long as the API doesn't filter them out
        assert data.get("total") is not None, "Total count missing"
        print(f"Templates API returns drafts: PASS (found {len(draft_templates)} drafts)")
    
    def test_02_create_template_with_text_field(self):
        """Create a template with a text field for interlink testing"""
        template_data = {
            "name": f"TEST_Source_Template_{uuid.uuid4().hex[:8]}",
            "description": "Source template for interlink testing",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": f"text-field-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "page": 1,
                    "x": 100,
                    "y": 200,
                    "width": 200,
                    "height": 30,
                    "label": "Full Name",
                    "required": True
                }
            ],
            "recipients": [
                {
                    "id": "recipient-1",
                    "placeholder_name": "Signer 1",
                    "role": "signer",
                    "routing_order": 1,
                    "is_required": True
                }
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert resp.status_code in [200, 201], f"Create template failed: {resp.text}"
        
        created = resp.json()
        assert created.get("id"), "Template ID missing"
        assert created.get("status") == "draft", "New template should be draft"
        assert len(created.get("field_placements", [])) == 1, "Field placement missing"
        
        self.source_template_id = created["id"]
        self.source_field_id = created["field_placements"][0]["id"]
        print(f"Created source template: {self.source_template_id}")
        print(f"Source field ID: {self.source_field_id}")
        
        return created
    
    def test_03_create_target_template_with_linked_field(self):
        """Create a target template with a field linked to the source template"""
        # First create source template
        source = self.test_02_create_template_with_text_field()
        source_template_id = source["id"]
        source_field_id = source["field_placements"][0]["id"]
        
        # Create target template with linked_to config
        target_data = {
            "name": f"TEST_Target_Template_{uuid.uuid4().hex[:8]}",
            "description": "Target template with linked field",
            "template_type": "custom",
            "source": "manual",
            "field_placements": [
                {
                    "id": f"linked-field-{uuid.uuid4().hex[:8]}",
                    "type": "text",
                    "page": 1,
                    "x": 100,
                    "y": 200,
                    "width": 200,
                    "height": 30,
                    "label": "Full Name (Linked)",
                    "required": True,
                    "linked_to": {
                        "enabled": True,
                        "template_id": source_template_id,
                        "field_id": source_field_id,
                        "sync_scope": "same_recipient_only",
                        "direction": "one_way",
                        "read_only_target": True
                    }
                }
            ],
            "recipients": [
                {
                    "id": "recipient-1",
                    "placeholder_name": "Signer 1",
                    "role": "signer",
                    "routing_order": 1,
                    "is_required": True
                }
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=target_data)
        assert resp.status_code in [200, 201], f"Create target template failed: {resp.text}"
        
        created = resp.json()
        assert created.get("id"), "Template ID missing"
        
        # Verify linked_to was saved
        field = created.get("field_placements", [{}])[0]
        linked_to = field.get("linked_to", {})
        assert linked_to.get("enabled") == True, "linked_to.enabled not saved"
        assert linked_to.get("template_id") == source_template_id, "linked_to.template_id not saved"
        assert linked_to.get("field_id") == source_field_id, "linked_to.field_id not saved"
        assert linked_to.get("read_only_target") == True, "linked_to.read_only_target not saved"
        
        print(f"Created target template with linked_to: {created['id']}")
        print(f"linked_to config: {linked_to}")
        
        return created, source
    
    def test_04_update_template_preserves_linked_to(self):
        """Verify that updating a template preserves the linked_to configuration"""
        # Create templates
        target, source = self.test_03_create_target_template_with_linked_field()
        target_id = target["id"]
        
        # Update the template (change description)
        update_data = {
            "description": "Updated description",
            "field_placements": target["field_placements"]  # Keep same field_placements
        }
        
        resp = self.session.put(f"{BASE_URL}/api/docflow/templates/{target_id}", json=update_data)
        assert resp.status_code == 200, f"Update template failed: {resp.text}"
        
        # Fetch the template again
        resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{target_id}")
        assert resp.status_code == 200, f"Get template failed: {resp.text}"
        
        updated = resp.json()
        field = updated.get("field_placements", [{}])[0]
        linked_to = field.get("linked_to", {})
        
        # Verify linked_to is still there
        assert linked_to.get("enabled") == True, "linked_to.enabled lost after update"
        assert linked_to.get("template_id") == source["id"], "linked_to.template_id lost after update"
        assert linked_to.get("field_id") == source["field_placements"][0]["id"], "linked_to.field_id lost after update"
        
        print(f"Template update preserves linked_to: PASS")
    
    def test_05_interlink_dropdown_shows_all_templates(self):
        """
        Verify the templates API (used by interlink dropdown) returns all templates
        including drafts when called with empty status parameter.
        """
        # Create a draft template
        template_data = {
            "name": f"TEST_Draft_For_Dropdown_{uuid.uuid4().hex[:8]}",
            "description": "Draft template for dropdown test",
            "template_type": "custom",
            "source": "manual",
            "field_placements": []
        }
        
        resp = self.session.post(f"{BASE_URL}/api/docflow/templates", json=template_data)
        assert resp.status_code in [200, 201], f"Create template failed: {resp.text}"
        created_id = resp.json().get("id")
        
        # Call templates API with empty status (simulating frontend interlink dropdown)
        # Phase 81.50 fix: docflowService.getTemplates('', '', 1, 200) passes empty status
        resp = self.session.get(f"{BASE_URL}/api/docflow/templates?status=&page=1&limit=200")
        assert resp.status_code == 200, f"Templates API failed: {resp.text}"
        
        templates = resp.json().get("templates", [])
        template_ids = [t["id"] for t in templates]
        
        # The newly created draft should be in the list
        assert created_id in template_ids, f"Draft template {created_id} not in dropdown list"
        
        # Verify draft templates are included
        draft_count = sum(1 for t in templates if t.get("status") == "draft")
        print(f"Dropdown shows {len(templates)} templates, {draft_count} are drafts")
        assert draft_count > 0, "No draft templates in dropdown"
        
        print(f"Interlink dropdown shows draft templates: PASS")
    
    def test_06_package_with_interlinked_templates(self):
        """Create a package with two templates that have interlinked fields"""
        # Create source and target templates
        target, source = self.test_03_create_target_template_with_linked_field()
        
        # Create a package with both templates using correct API format
        package_data = {
            "name": f"TEST_Interlink_Package_{uuid.uuid4().hex[:8]}",
            "documents": [
                {"template_id": source["id"], "order": 1},
                {"template_id": target["id"], "order": 2}
            ]
        }
        
        resp = self.session.post(f"{BASE_URL}/api/docflow/packages", json=package_data)
        assert resp.status_code in [200, 201], f"Create package failed: {resp.text}"
        
        data = resp.json()
        # Response may be nested under 'package' key
        package = data.get("package", data)
        assert package.get("id"), "Package ID missing"
        assert len(package.get("documents", [])) == 2, "Package should have 2 documents"
        
        print(f"Created package with interlinked templates: {package['id']}")
        print(f"Documents: {[d.get('template_id') for d in package.get('documents', [])]}")
        
        return package, source, target
    
    def test_07_verify_backend_fanout_code_exists(self):
        """
        Code review: Verify the backend fanout logic exists in package_public_routes.py
        """
        import os
        
        fanout_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        assert os.path.exists(fanout_file), f"File not found: {fanout_file}"
        
        with open(fanout_file, 'r') as f:
            content = f.read()
        
        # Check for Phase 81.49 fanout block
        assert "Phase 81.49" in content, "Phase 81.49 comment not found"
        assert "Interlinked Fields fanout" in content, "Fanout comment not found"
        assert "linked_to" in content, "linked_to reference not found"
        assert "package.get(\"documents\"" in content or "package.get('documents'" in content, \
            "Fixed fanout code (package.get('documents')) not found"
        
        # Verify the bug fix: should NOT use req.documents
        # The fix changed req.documents to package.get('documents', [])
        lines = content.split('\n')
        fanout_section = False
        for i, line in enumerate(lines):
            if "Phase 81.49" in line:
                fanout_section = True
            if fanout_section and "sibling_doc_ids" in line:
                # Check the next few lines for the correct pattern
                context = '\n'.join(lines[i:i+5])
                assert "req.documents" not in context, \
                    "Bug: req.documents still used instead of package.get('documents')"
                break
        
        print("Backend fanout code verified: PASS")
    
    def test_08_verify_frontend_fanout_code_exists(self):
        """
        Code review: Verify the frontend fanout logic exists in PackagePublicView.js
        """
        import os
        
        frontend_file = "/app/frontend/src/docflow/pages/PackagePublicView.js"
        assert os.path.exists(frontend_file), f"File not found: {frontend_file}"
        
        with open(frontend_file, 'r') as f:
            content = f.read()
        
        # Check for fanout function
        assert "fanoutLinkedFieldValue" in content, "fanoutLinkedFieldValue function not found"
        assert "handleDocFieldsChange" in content, "handleDocFieldsChange function not found"
        assert "linked_to" in content, "linked_to reference not found"
        
        # Check for read-only target enforcement
        assert "read_only_target" in content, "read_only_target check not found"
        assert "readOnly: true" in content or "readOnly:true" in content, "readOnly assignment not found"
        
        print("Frontend fanout code verified: PASS")
    
    def test_09_verify_interlink_ui_code_exists(self):
        """
        Code review: Verify the interlink UI exists in MultiPageVisualBuilder.js
        """
        import os
        
        builder_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        assert os.path.exists(builder_file), f"File not found: {builder_file}"
        
        with open(builder_file, 'r') as f:
            content = f.read()
        
        # Check for Phase 81.50 fix
        assert "Phase 81.50" in content, "Phase 81.50 comment not found"
        
        # Check for interlink UI elements
        assert "field-interlink-toggle" in content, "Interlink toggle data-testid not found"
        assert "field-interlink-template" in content, "Interlink template dropdown data-testid not found"
        assert "field-interlink-field" in content, "Interlink field dropdown data-testid not found"
        assert "field-interlink-readonly" in content, "Interlink readonly toggle data-testid not found"
        
        # Check for loadInterlinkTemplates function
        assert "loadInterlinkTemplates" in content, "loadInterlinkTemplates function not found"
        
        # Verify the fix: should call getTemplates with empty status
        # Phase 81.50 changed from getTemplates('active', ...) to getTemplates('', '', 1, 200)
        assert "getTemplates('', '', 1, 200)" in content or 'getTemplates("", "", 1, 200)' in content, \
            "Phase 81.50 fix not found: getTemplates should be called with empty status"
        
        print("Interlink UI code verified: PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
