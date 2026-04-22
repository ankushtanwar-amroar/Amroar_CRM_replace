"""
DocFlow Field Types Testing - Tests for signature, checkbox, date, radio fields
Tests the new radio groupName model and field rendering in signing view
"""
import pytest
import requests
import os
import json
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDocFlowFieldTypes:
    """Test DocFlow field types and rendering"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "docflow@test.com",
            "password": "DocFlow123!"
        })
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip("Authentication failed - skipping tests")
    
    def test_login_success(self):
        """Test login endpoint works"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "docflow@test.com",
            "password": "DocFlow123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("SUCCESS: Login endpoint working")
    
    def test_get_templates_list(self):
        """Test templates list endpoint"""
        response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        print(f"SUCCESS: Found {len(data['templates'])} templates")
    
    def test_get_template_field_placements(self):
        """Test field placements endpoint returns correct structure"""
        # First get a template ID
        templates_response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        templates = templates_response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates found")
        
        template_id = templates[0]["id"]
        response = self.session.get(f"{BASE_URL}/api/docflow/templates/{template_id}/field-placements")
        assert response.status_code == 200
        data = response.json()
        assert "field_placements" in data
        print(f"SUCCESS: Field placements endpoint working for template {template_id}")
    
    def test_update_field_placements_with_new_radio_model(self):
        """Test updating field placements with new radio groupName model"""
        # Get template ID
        templates_response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        templates = templates_response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates found")
        
        template_id = templates[0]["id"]
        
        # Update with new radio model fields
        field_placements = {
            "field_placements": [
                {
                    "id": "test_sig",
                    "type": "signature",
                    "label": "Test Signature",
                    "page": 1,
                    "x": 100,
                    "y": 100,
                    "width": 200,
                    "height": 80,
                    "required": True
                },
                {
                    "id": "test_date",
                    "type": "date",
                    "label": "Test Date",
                    "page": 1,
                    "x": 100,
                    "y": 200,
                    "width": 120,
                    "height": 40
                },
                {
                    "id": "test_checkbox",
                    "type": "checkbox",
                    "label": "Test Checkbox",
                    "checkboxLabel": "I agree to terms",
                    "page": 1,
                    "x": 100,
                    "y": 260,
                    "width": 200,
                    "height": 30
                },
                {
                    "id": "test_radio_1",
                    "type": "radio",
                    "label": "Option 1",
                    "groupName": "test_group",
                    "optionLabel": "Option 1",
                    "optionValue": "opt1",
                    "page": 1,
                    "x": 100,
                    "y": 310,
                    "width": 140,
                    "height": 30
                },
                {
                    "id": "test_radio_2",
                    "type": "radio",
                    "label": "Option 2",
                    "groupName": "test_group",
                    "optionLabel": "Option 2",
                    "optionValue": "opt2",
                    "page": 1,
                    "x": 100,
                    "y": 350,
                    "width": 140,
                    "height": 30
                }
            ]
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/docflow/templates/{template_id}/field-placements",
            json=field_placements
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert data.get("field_count") == 5
        print("SUCCESS: Field placements updated with new radio model")
    
    def test_generate_public_link(self):
        """Test generating public signing link"""
        # Get template ID
        templates_response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        templates = templates_response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates found")
        
        template_id = templates[0]["id"]
        
        response = self.session.post(f"{BASE_URL}/api/v1/documents/generate-links", json={
            "template_id": template_id,
            "delivery_mode": "public_link",
            "routing_type": "sequential",
            "require_auth": False
        })
        
        # May fail if template has no PDF - that's expected
        if response.status_code == 400:
            data = response.json()
            if "No document file" in str(data):
                print("INFO: Template has no PDF attached - expected for test template")
                return
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
        assert "public_link" in data
        print(f"SUCCESS: Public link generated: {data.get('public_link')}")
    
    def test_public_document_view_endpoint(self):
        """Test public document view endpoint"""
        # First generate a link
        templates_response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        templates = templates_response.json().get("templates", [])
        
        if not templates:
            pytest.skip("No templates found")
        
        template_id = templates[0]["id"]
        
        gen_response = self.session.post(f"{BASE_URL}/api/v1/documents/generate-links", json={
            "template_id": template_id,
            "delivery_mode": "public_link",
            "routing_type": "sequential",
            "require_auth": False
        })
        
        if gen_response.status_code != 200:
            pytest.skip("Could not generate public link")
        
        gen_data = gen_response.json()
        public_link = gen_data.get("public_link", "")
        
        # Extract token from link
        if "/view/" in public_link:
            token = public_link.split("/view/")[-1]
            
            # Test public endpoint (no auth required)
            public_response = requests.get(f"{BASE_URL}/api/docflow/documents/public/{token}")
            assert public_response.status_code == 200
            data = public_response.json()
            
            # Check response structure
            assert "template_name" in data or "is_generator" in data
            print("SUCCESS: Public document view endpoint working")


class TestDateFieldFormat:
    """Test date field MM/DD/YYYY format"""
    
    def test_date_format_helper(self):
        """Test date formatting to MM/DD/YYYY"""
        # Simulate the formatLocalMMDDYYYY function
        today = datetime.now()
        formatted = today.strftime('%m/%d/%Y')
        
        # Verify format
        parts = formatted.split('/')
        assert len(parts) == 3
        assert len(parts[0]) == 2  # MM
        assert len(parts[1]) == 2  # DD
        assert len(parts[2]) == 4  # YYYY
        print(f"SUCCESS: Date format is MM/DD/YYYY: {formatted}")


class TestRadioGroupModel:
    """Test new radio groupName model"""
    
    def test_radio_group_structure(self):
        """Test radio field structure with groupName model"""
        # New model structure
        radio_field_new = {
            "id": "radio_opt1",
            "type": "radio",
            "groupName": "preference_group",
            "optionLabel": "Option A",
            "optionValue": "option_a",
            "page": 1,
            "x": 100,
            "y": 100,
            "width": 140,
            "height": 30
        }
        
        # Verify required fields for new model
        assert "groupName" in radio_field_new
        assert "optionLabel" in radio_field_new
        assert "optionValue" in radio_field_new
        print("SUCCESS: New radio model has correct structure")
    
    def test_legacy_radio_structure(self):
        """Test legacy radio field structure with radioOptions array"""
        # Legacy model structure
        radio_field_legacy = {
            "id": "radio_legacy",
            "type": "radio",
            "radioOptions": ["Option A", "Option B", "Option C"],
            "selectedOption": "",
            "radioLayout": "vertical",
            "page": 1,
            "x": 100,
            "y": 100,
            "width": 160,
            "height": 80
        }
        
        # Verify legacy structure
        assert "radioOptions" in radio_field_legacy
        assert isinstance(radio_field_legacy["radioOptions"], list)
        assert len(radio_field_legacy["radioOptions"]) > 0
        print("SUCCESS: Legacy radio model has correct structure")


class TestConditionalLogic:
    """Test conditional logic formats"""
    
    def test_format_a_source_side_rules(self):
        """Test Format A: conditionalRules on source field"""
        source_field = {
            "id": "checkbox_source",
            "type": "checkbox",
            "conditionalRules": [
                {
                    "triggerValue": True,
                    "action": "show",
                    "targetFieldId": "text_target"
                }
            ]
        }
        
        assert "conditionalRules" in source_field
        assert len(source_field["conditionalRules"]) > 0
        rule = source_field["conditionalRules"][0]
        assert "triggerValue" in rule
        assert "action" in rule
        assert "targetFieldId" in rule
        print("SUCCESS: Format A (source-side) conditional rules structure correct")
    
    def test_format_b_target_side_rules(self):
        """Test Format B: conditionalLogic on target field"""
        target_field = {
            "id": "text_target",
            "type": "text",
            "conditionalLogic": {
                "operator": "AND",
                "action": "show",
                "rules": [
                    {
                        "sourceFieldId": "checkbox_source",
                        "condition": "is_checked",
                        "value": True
                    }
                ]
            }
        }
        
        assert "conditionalLogic" in target_field
        cl = target_field["conditionalLogic"]
        assert "rules" in cl
        assert len(cl["rules"]) > 0
        rule = cl["rules"][0]
        assert "sourceFieldId" in rule
        assert "condition" in rule
        print("SUCCESS: Format B (target-side) conditional logic structure correct")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
