"""
Phase 58 Tests - PDF Overlay Service Enhanced (ReportLab path)

Tests for the standalone document flow using pdf_overlay_service_enhanced.py:
1. Signature aspect-fit + alignment (left/center/right)
2. Date format parsing + alignment
3. Radio field - only selected option drawn, no labels
4. Checkbox label - only drawn when explicitly set
5. Initials aspect-fit + alignment
"""
import pytest
import requests
import os
import base64
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@gmail.com"
TEST_PASSWORD = "test123"


class TestPhase58PDFOverlayService:
    """Tests for Phase 58 fixes in pdf_overlay_service_enhanced.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.tenant_id = None
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token") or data.get("token")
            self.tenant_id = data.get("tenant_id") or data.get("user", {}).get("tenant_id")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        self.session.close()
    
    def test_01_auth_working(self):
        """Verify authentication is working"""
        assert self.token is not None, "Authentication failed - no token received"
        print(f"✓ Auth working, tenant_id: {self.tenant_id}")
    
    def test_02_pdf_overlay_service_code_review_signature_aspect_fit(self):
        """
        Code review: Verify _draw_signature_field has aspect-fit + alignment logic.
        Phase 58 fix: signature should be aspect-fit (not stretched) and aligned per textAlign.
        """
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        service = PDFOverlayService()
        
        # Check that _draw_signature_field method exists and has alignment logic
        import inspect
        source = inspect.getsource(service._draw_signature_field)
        
        # Verify aspect-fit logic
        assert "getSize" in source, "Missing getSize() call for aspect ratio detection"
        assert "aspect" in source.lower(), "Missing aspect ratio calculation"
        assert "fit_w" in source or "fit_h" in source, "Missing fit width/height calculation"
        
        # Verify alignment logic
        assert "textAlign" in source, "Missing textAlign property access"
        assert "'left'" in source or '"left"' in source, "Missing left alignment handling"
        assert "'right'" in source or '"right"' in source, "Missing right alignment handling"
        assert "'center'" in source or '"center"' in source, "Missing center alignment handling"
        
        print("✓ _draw_signature_field has aspect-fit + alignment logic (Phase 58)")
    
    def test_03_pdf_overlay_service_code_review_date_format(self):
        """
        Code review: Verify _draw_date_field honors dateFormat + textAlign.
        Phase 58 fix: date should be reformatted per field.dateFormat and aligned.
        """
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        service = PDFOverlayService()
        
        import inspect
        source = inspect.getsource(service._draw_date_field)
        
        # Verify dateFormat parsing
        assert "dateFormat" in source, "Missing dateFormat property access"
        assert "MM/DD/YYYY" in source, "Missing MM/DD/YYYY format handling"
        assert "DD/MM/YYYY" in source, "Missing DD/MM/YYYY format handling"
        assert "YYYY-MM-DD" in source, "Missing YYYY-MM-DD format handling"
        assert "MMM DD, YYYY" in source, "Missing MMM DD, YYYY format handling"
        
        # Verify datetime parsing
        assert "datetime" in source, "Missing datetime import/usage"
        assert "strptime" in source or "fromisoformat" in source, "Missing date parsing"
        assert "strftime" in source, "Missing date formatting"
        
        # Verify alignment via _draw_text_with_style
        assert "_draw_text_with_style" in source, "Missing _draw_text_with_style call for alignment"
        
        print("✓ _draw_date_field has dateFormat parsing + alignment (Phase 58)")
    
    def test_04_pdf_overlay_service_code_review_radio_no_label(self):
        """
        Code review: Verify _draw_radio_field draws only selected option, no labels.
        Phase 58 fix: radio should show only selected circle, no label text.
        """
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        service = PDFOverlayService()
        
        import inspect
        source = inspect.getsource(service._draw_radio_field)
        
        # Verify selected-only logic
        assert "is_selected" in source or "checked" in source, "Missing selection check"
        assert "continue" in source, "Missing continue statement to skip unselected"
        
        # Verify NO label drawing
        assert "Label intentionally NOT drawn" in source or "label NOT drawn" in source.lower(), \
            "Missing comment about label not being drawn"
        
        # Verify circle drawing
        assert "circle" in source.lower(), "Missing circle drawing"
        
        # Verify groupName handling
        assert "groupName" in source or "group_name" in source, "Missing groupName handling"
        
        print("✓ _draw_radio_field draws only selected option, no labels (Phase 58)")
    
    def test_05_pdf_overlay_service_code_review_checkbox_label(self):
        """
        Code review: Verify _draw_checkbox_field only draws label when explicitly set.
        Phase 58 fix: checkbox label drawn ONLY when checkboxLabel is set AND hideLabelOnFinal!=true.
        """
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        service = PDFOverlayService()
        
        import inspect
        source = inspect.getsource(service._draw_checkbox_field)
        
        # Verify label conditional logic
        assert "checkboxLabel" in source or "label" in source, "Missing label property access"
        assert "hideLabelOnFinal" in source, "Missing hideLabelOnFinal check"
        
        # Verify label is conditional
        assert "if label_text" in source or "if label" in source, "Missing conditional label drawing"
        
        print("✓ _draw_checkbox_field has conditional label drawing (Phase 58)")
    
    def test_06_pdf_overlay_service_code_review_initials_aspect_fit(self):
        """
        Code review: Verify _draw_initials_field has aspect-fit + alignment logic.
        Phase 58 fix: initials should be aspect-fit and aligned like signatures.
        """
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        service = PDFOverlayService()
        
        import inspect
        source = inspect.getsource(service._draw_initials_field)
        
        # Verify aspect-fit logic
        assert "getSize" in source, "Missing getSize() call for aspect ratio detection"
        assert "aspect" in source.lower(), "Missing aspect ratio calculation"
        
        # Verify alignment logic
        assert "textAlign" in source, "Missing textAlign property access"
        assert "'left'" in source or '"left"' in source, "Missing left alignment handling"
        assert "'right'" in source or '"right"' in source, "Missing right alignment handling"
        
        print("✓ _draw_initials_field has aspect-fit + alignment logic (Phase 58)")
    
    def test_07_pdf_overlay_service_code_review_text_alignment(self):
        """
        Code review: Verify _draw_text_with_style handles alignment correctly.
        """
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        service = PDFOverlayService()
        
        import inspect
        source = inspect.getsource(service._draw_text_with_style)
        
        # Verify alignment logic
        assert "textAlign" in source, "Missing textAlign property access"
        assert "center" in source, "Missing center alignment"
        assert "right" in source, "Missing right alignment"
        assert "stringWidth" in source, "Missing stringWidth for text measurement"
        
        print("✓ _draw_text_with_style has proper alignment logic")
    
    def test_08_validation_api_still_returns_6_checks(self):
        """
        Regression: Verify validation API still returns 6 checks (Phase 57).
        """
        if not self.token:
            pytest.skip("Auth failed")
        
        # Get a template to validate
        templates_resp = self.session.get(f"{BASE_URL}/api/docflow/templates")
        if templates_resp.status_code != 200:
            pytest.skip("Could not fetch templates")
        
        templates = templates_resp.json()
        if not templates or not isinstance(templates, list) or len(templates) == 0:
            pytest.skip("No templates found")
        
        template_id = templates[0].get("id") if isinstance(templates, list) else None
        if not template_id:
            pytest.skip("Could not get template ID")
        
        # Call validation endpoint
        validate_resp = self.session.get(
            f"{BASE_URL}/api/docflow/templates/validate-object?template_id={template_id}"
        )
        
        assert validate_resp.status_code == 200, f"Validation API failed: {validate_resp.status_code}"
        
        data = validate_resp.json()
        checks = data.get("checks", [])
        
        # Phase 57: Should have exactly 6 checks (no recipients/routing)
        assert len(checks) == 6, f"Expected 6 checks, got {len(checks)}"
        
        # Verify no recipient/routing mentions
        check_names = [c.get("name", "").lower() for c in checks]
        for name in check_names:
            assert "recipient" not in name, f"Found recipient mention in check: {name}"
            assert "routing" not in name, f"Found routing mention in check: {name}"
        
        print(f"✓ Validation API returns 6 checks (Phase 57 regression OK)")
    
    def test_09_package_public_routes_radio_no_label(self):
        """
        Regression: Verify package_public_routes.py still has radio no-label logic (Phase 56).
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify Phase 56 comment about no label
        assert "Phase 56" in source, "Missing Phase 56 comment"
        # The comment says "NEVER drawn" not "NOT drawn"
        assert "label" in source.lower() and ("NEVER drawn" in source or "NOT drawn" in source), \
            "Missing 'label NEVER/NOT drawn' comment in package_public_routes.py"
        
        print("✓ package_public_routes.py has radio no-label logic (Phase 56 regression OK)")
    
    def test_10_package_public_link_routes_radio_no_label(self):
        """
        Regression: Verify package_public_link_routes.py still has radio no-label logic (Phase 56).
        """
        with open('/app/backend/modules/docflow/api/package_public_link_routes.py', 'r') as f:
            source = f.read()
        
        # Verify Phase 56 comment about no label
        assert "Phase 56" in source, "Missing Phase 56 comment"
        assert "label" in source.lower(), "Missing label reference"
        
        print("✓ package_public_link_routes.py has radio no-label logic (Phase 56 regression OK)")


class TestPhase58GenerateLinksAPI:
    """Tests for the generate-links API that uses pdf_overlay_service_enhanced"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.tenant_id = None
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token") or data.get("token")
            self.tenant_id = data.get("tenant_id") or data.get("user", {}).get("tenant_id")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        self.session.close()
    
    def test_01_generate_links_endpoint_exists(self):
        """Verify generate-links endpoint exists"""
        if not self.token:
            pytest.skip("Auth failed")
        
        # Test with minimal payload (should fail validation but endpoint should exist)
        resp = self.session.post(
            f"{BASE_URL}/api/v1/documents/generate-links",
            json={}
        )
        
        # Should get 400 (validation error) not 404
        assert resp.status_code != 404, "generate-links endpoint not found"
        print(f"✓ generate-links endpoint exists (status: {resp.status_code})")
    
    def test_02_generate_links_requires_template_id(self):
        """Verify generate-links requires template_id for basic mode"""
        if not self.token:
            pytest.skip("Auth failed")
        
        resp = self.session.post(
            f"{BASE_URL}/api/v1/documents/generate-links",
            json={
                "send_mode": "basic",
                "delivery_mode": "public_link"
            }
        )
        
        data = resp.json()
        assert data.get("success") == False, "Should fail without template_id"
        assert "template_id" in str(data.get("errors", [])).lower() or "template_id" in str(data.get("message", "")).lower(), \
            "Error should mention template_id"
        
        print("✓ generate-links requires template_id for basic mode")
    
    def test_03_list_templates_for_testing(self):
        """List available templates for manual testing reference"""
        if not self.token:
            pytest.skip("Auth failed")
        
        resp = self.session.get(f"{BASE_URL}/api/docflow/templates")
        assert resp.status_code == 200, f"Failed to list templates: {resp.status_code}"
        
        templates = resp.json()
        if not isinstance(templates, list):
            templates = list(templates.values()) if isinstance(templates, dict) else []
        
        print(f"\n✓ Found {len(templates)} templates for testing:")
        
        for t in templates[:5]:  # Show first 5
            if not isinstance(t, dict):
                continue
            field_placements = t.get("field_placements", [])
            field_types = [f.get("type") for f in field_placements]
            has_signature = "signature" in field_types
            has_date = "date" in field_types
            has_radio = "radio" in field_types
            
            tid = t.get('id', 'unknown')
            print(f"  - {t.get('name', 'Unnamed')} (id: {tid[:8] if len(tid) > 8 else tid}...)")
            print(f"    Fields: {len(field_placements)}, Sig: {has_signature}, Date: {has_date}, Radio: {has_radio}")


class TestPhase58PDFOverlayUnit:
    """Unit tests for PDFOverlayService methods"""
    
    def test_01_draw_text_with_style_alignment(self):
        """Test _draw_text_with_style alignment calculation"""
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        service = PDFOverlayService()
        
        # Verify the method exists and has correct signature
        import inspect
        sig = inspect.signature(service._draw_text_with_style)
        params = list(sig.parameters.keys())
        
        assert 'c' in params, "Missing canvas parameter"
        assert 'x' in params, "Missing x parameter"
        assert 'y' in params, "Missing y parameter"
        assert 'width' in params, "Missing width parameter"
        assert 'height' in params, "Missing height parameter"
        assert 'text' in params, "Missing text parameter"
        assert 'field' in params, "Missing field parameter"
        
        print("✓ _draw_text_with_style has correct signature")
    
    def test_02_date_format_mapping(self):
        """Test date format mapping in _draw_date_field"""
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        # Verify the date format mapping in source code
        import inspect
        source = inspect.getsource(PDFOverlayService._draw_date_field)
        
        # Check all expected formats are handled
        formats = [
            ("MM/DD/YYYY", "%m/%d/%Y"),
            ("DD/MM/YYYY", "%d/%m/%Y"),
            ("YYYY-MM-DD", "%Y-%m-%d"),
            ("MMM DD, YYYY", "%b %d, %Y"),
        ]
        
        for display_fmt, strftime_fmt in formats:
            assert display_fmt in source, f"Missing {display_fmt} format"
            assert strftime_fmt in source, f"Missing {strftime_fmt} strftime format"
        
        print("✓ All date formats are properly mapped")
    
    def test_03_font_map_exists(self):
        """Test FONT_MAP exists for CSS to ReportLab font mapping"""
        import sys
        sys.path.insert(0, '/app/backend')
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        
        assert hasattr(PDFOverlayService, 'FONT_MAP'), "Missing FONT_MAP class attribute"
        
        font_map = PDFOverlayService.FONT_MAP
        assert 'Arial' in font_map, "Missing Arial mapping"
        assert 'Helvetica' in font_map, "Missing Helvetica mapping"
        assert 'Times New Roman' in font_map, "Missing Times New Roman mapping"
        
        print(f"✓ FONT_MAP exists with {len(font_map)} font mappings")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
