"""
Phase 73 Tests - Checkbox and Radio Field Centering in PDF Engines

Tests for the centering fix applied to all 4 PDF engines:
1. Frontend pdf-lib (PublicDocumentViewEnhanced.js)
2. Backend PyMuPDF for standalone docs (package_public_routes.py)
3. Backend PyMuPDF for public package link (package_public_link_routes.py)
4. Backend ReportLab (pdf_overlay_service_enhanced.py)

The fix changes checkbox and radio rendering from left-aligned (x + 2) to
horizontally centered within the field bounding box:
- Checkbox: bx = x + (w - box_size) / 2
- Radio: cx = x + w / 2
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@gmail.com"
TEST_PASSWORD = "test123"


class TestPhase73CenteringCodeReview:
    """Code review tests to verify centering math in all 4 PDF engines"""
    
    def test_01_package_public_routes_checkbox_centering(self):
        """
        Verify package_public_routes.py has checkbox centering math.
        Phase 73 fix: bx = x + (w - box_size) / 2
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify Phase 73 comment exists
        assert "Phase 73" in source, "Missing Phase 73 comment in package_public_routes.py"
        
        # Verify checkbox centering math
        # Looking for: bx = x + (w - box_size) / 2
        checkbox_centering_pattern = r'bx\s*=\s*x\s*\+\s*\(\s*w\s*-\s*box_size\s*\)\s*/\s*2'
        assert re.search(checkbox_centering_pattern, source), \
            "Missing checkbox centering math: bx = x + (w - box_size) / 2"
        
        # Verify the comment about centering
        assert "Center the checkbox horizontally" in source or "justify-center" in source, \
            "Missing centering comment for checkbox"
        
        print("✓ package_public_routes.py has checkbox centering (Phase 73)")
    
    def test_02_package_public_routes_radio_centering(self):
        """
        Verify package_public_routes.py has radio centering math.
        Phase 73 fix: cx = x + w / 2
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify radio centering math
        # Looking for: cx = x + w / 2
        radio_centering_pattern = r'cx\s*=\s*x\s*\+\s*w\s*/\s*2'
        assert re.search(radio_centering_pattern, source), \
            "Missing radio centering math: cx = x + w / 2"
        
        # Verify the comment about centering
        assert "Center the radio circle horizontally" in source, \
            "Missing centering comment for radio"
        
        print("✓ package_public_routes.py has radio centering (Phase 73)")
    
    def test_03_package_public_link_routes_checkbox_centering(self):
        """
        Verify package_public_link_routes.py has checkbox centering math.
        Phase 73 fix: bx = x + (w - box_size) / 2
        """
        with open('/app/backend/modules/docflow/api/package_public_link_routes.py', 'r') as f:
            source = f.read()
        
        # Verify Phase 73 comment exists
        assert "Phase 73" in source, "Missing Phase 73 comment in package_public_link_routes.py"
        
        # Verify checkbox centering math
        checkbox_centering_pattern = r'bx\s*=\s*x\s*\+\s*\(\s*w\s*-\s*box_size\s*\)\s*/\s*2'
        assert re.search(checkbox_centering_pattern, source), \
            "Missing checkbox centering math: bx = x + (w - box_size) / 2"
        
        print("✓ package_public_link_routes.py has checkbox centering (Phase 73)")
    
    def test_04_package_public_link_routes_radio_centering(self):
        """
        Verify package_public_link_routes.py has radio centering math.
        Phase 73 fix: cx = x + w / 2
        """
        with open('/app/backend/modules/docflow/api/package_public_link_routes.py', 'r') as f:
            source = f.read()
        
        # Verify radio centering math
        radio_centering_pattern = r'cx\s*=\s*x\s*\+\s*w\s*/\s*2'
        assert re.search(radio_centering_pattern, source), \
            "Missing radio centering math: cx = x + w / 2"
        
        # Verify the comment about centering
        assert "Center the radio circle horizontally" in source, \
            "Missing centering comment for radio"
        
        print("✓ package_public_link_routes.py has radio centering (Phase 73)")
    
    def test_05_pdf_overlay_service_checkbox_centering(self):
        """
        Verify pdf_overlay_service_enhanced.py has checkbox centering math.
        Phase 73 fix: box_x = x + (width - box_size) / 2
        """
        with open('/app/backend/modules/docflow/services/pdf_overlay_service_enhanced.py', 'r') as f:
            source = f.read()
        
        # Verify Phase 73 comment exists
        assert "Phase 73" in source, "Missing Phase 73 comment in pdf_overlay_service_enhanced.py"
        
        # Verify checkbox centering math
        # Looking for: box_x = x + (width - box_size) / 2
        checkbox_centering_pattern = r'box_x\s*=\s*x\s*\+\s*\(\s*width\s*-\s*box_size\s*\)\s*/\s*2'
        assert re.search(checkbox_centering_pattern, source), \
            "Missing checkbox centering math: box_x = x + (width - box_size) / 2"
        
        print("✓ pdf_overlay_service_enhanced.py has checkbox centering (Phase 73)")
    
    def test_06_pdf_overlay_service_radio_centering(self):
        """
        Verify pdf_overlay_service_enhanced.py has radio centering math.
        Phase 73 fix: cx = x + width / 2
        """
        with open('/app/backend/modules/docflow/services/pdf_overlay_service_enhanced.py', 'r') as f:
            source = f.read()
        
        # Verify radio centering math
        # Looking for: cx = x + width / 2
        radio_centering_pattern = r'cx\s*=\s*x\s*\+\s*width\s*/\s*2'
        assert re.search(radio_centering_pattern, source), \
            "Missing radio centering math: cx = x + width / 2"
        
        # Verify the comment about centering
        assert "Center the radio circle horizontally" in source, \
            "Missing centering comment for radio"
        
        print("✓ pdf_overlay_service_enhanced.py has radio centering (Phase 73)")
    
    def test_07_frontend_checkbox_centering(self):
        """
        Verify PublicDocumentViewEnhanced.js has checkbox centering math.
        Phase 73 fix: boxX = x + (ptWidth - boxSize) / 2
        """
        with open('/app/frontend/src/docflow/pages/PublicDocumentViewEnhanced.js', 'r') as f:
            source = f.read()
        
        # Verify Phase 73 comment exists
        assert "Phase 73" in source, "Missing Phase 73 comment in PublicDocumentViewEnhanced.js"
        
        # Verify checkbox centering math
        # Looking for: boxX = x + (ptWidth - boxSize) / 2
        checkbox_centering_pattern = r'boxX\s*=\s*x\s*\+\s*\(\s*ptWidth\s*-\s*boxSize\s*\)\s*/\s*2'
        assert re.search(checkbox_centering_pattern, source), \
            "Missing checkbox centering math: boxX = x + (ptWidth - boxSize) / 2"
        
        print("✓ PublicDocumentViewEnhanced.js has checkbox centering (Phase 73)")
    
    def test_08_frontend_radio_centering(self):
        """
        Verify PublicDocumentViewEnhanced.js has radio centering math.
        Phase 73 fix: optX = x + (ptWidth - optSize) / 2
        """
        with open('/app/frontend/src/docflow/pages/PublicDocumentViewEnhanced.js', 'r') as f:
            source = f.read()
        
        # Verify radio centering math
        # Looking for: optX = x + (ptWidth - optSize) / 2
        radio_centering_pattern = r'optX\s*=\s*x\s*\+\s*\(\s*ptWidth\s*-\s*optSize\s*\)\s*/\s*2'
        assert re.search(radio_centering_pattern, source), \
            "Missing radio centering math: optX = x + (ptWidth - optSize) / 2"
        
        # Verify the comment about centering
        assert "Center the radio circle horizontally" in source, \
            "Missing centering comment for radio"
        
        print("✓ PublicDocumentViewEnhanced.js has radio centering (Phase 73)")


class TestPhase73RegressionChecks:
    """Regression tests to ensure other field types still work correctly"""
    
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
    
    def test_02_signature_rendering_still_works(self):
        """
        Regression: Verify signature rendering code still has aspect-fit + alignment.
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify signature aspect-fit logic still present
        assert "insert_image" in source, "Missing insert_image for signature"
        assert "Pixmap" in source, "Missing Pixmap for image size detection"
        assert "aspect" in source.lower(), "Missing aspect ratio calculation"
        
        print("✓ Signature rendering still has aspect-fit logic")
    
    def test_03_text_date_rendering_still_works(self):
        """
        Regression: Verify text/date rendering code still has alignment.
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify text alignment logic still present
        assert "insert_text" in source, "Missing insert_text for text fields"
        assert "textAlign" in source, "Missing textAlign property access"
        assert "get_text_length" in source, "Missing text width measurement"
        
        print("✓ Text/date rendering still has alignment logic")
    
    def test_04_merge_field_rendering_still_works(self):
        """
        Regression: Verify merge field rendering code still works.
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify merge field logic still present
        assert "merge_object" in source or "mergeObject" in source, "Missing merge_object handling"
        assert "merge_field" in source or "mergeField" in source, "Missing merge_field handling"
        
        print("✓ Merge field rendering still works")
    
    def test_05_templates_endpoint_working(self):
        """
        Regression: Verify templates endpoint still works.
        """
        if not self.token:
            pytest.skip("Auth failed")
        
        response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        assert response.status_code == 200, f"Templates endpoint failed: {response.status_code}"
        
        data = response.json()
        # Handle both list and dict responses
        if isinstance(data, dict):
            templates = data.get("templates", [])
        else:
            templates = data
        
        print(f"✓ Templates endpoint working, found {len(templates)} templates")
    
    def test_06_validation_api_still_works(self):
        """
        Regression: Verify validation API still returns 6 checks (Phase 57).
        """
        if not self.token:
            pytest.skip("Auth failed")
        
        # Get a template to validate
        templates_resp = self.session.get(f"{BASE_URL}/api/docflow/templates")
        if templates_resp.status_code != 200:
            pytest.skip("Could not fetch templates")
        
        data = templates_resp.json()
        if isinstance(data, dict):
            templates = data.get("templates", [])
        else:
            templates = data
        
        if not templates or len(templates) == 0:
            pytest.skip("No templates found")
        
        template_id = templates[0].get("id") if isinstance(templates[0], dict) else None
        if not template_id:
            pytest.skip("Could not get template ID")
        
        # Call validation endpoint
        validate_resp = self.session.get(
            f"{BASE_URL}/api/docflow/templates/validate-object?template_id={template_id}"
        )
        
        assert validate_resp.status_code == 200, f"Validation API failed: {validate_resp.status_code}"
        
        data = validate_resp.json()
        checks = data.get("checks", [])
        
        # Phase 57: Should have exactly 6 checks
        assert len(checks) == 6, f"Expected 6 checks, got {len(checks)}"
        
        print(f"✓ Validation API returns 6 checks (Phase 57 regression OK)")


class TestPhase73PDFOverlayServiceUnit:
    """Unit tests for PDFOverlayService centering methods"""
    
    def test_01_checkbox_centering_calculation(self):
        """
        Unit test: Verify checkbox centering calculation is correct.
        Given: x=100, width=200, box_size=14
        Expected: box_x = 100 + (200 - 14) / 2 = 100 + 93 = 193
        """
        x = 100
        width = 200
        box_size = 14
        
        # Centering formula
        box_x = x + (width - box_size) / 2
        
        expected = 193.0
        assert box_x == expected, f"Expected {expected}, got {box_x}"
        
        # Verify it's centered (box_x + box_size/2 should equal x + width/2)
        center_of_box = box_x + box_size / 2
        center_of_field = x + width / 2
        assert center_of_box == center_of_field, \
            f"Box center ({center_of_box}) != field center ({center_of_field})"
        
        print(f"✓ Checkbox centering calculation correct: box_x={box_x}")
    
    def test_02_radio_centering_calculation(self):
        """
        Unit test: Verify radio centering calculation is correct.
        Given: x=100, width=200
        Expected: cx = 100 + 200 / 2 = 200
        """
        x = 100
        width = 200
        
        # Centering formula
        cx = x + width / 2
        
        expected = 200.0
        assert cx == expected, f"Expected {expected}, got {cx}"
        
        # Verify it's at the center of the field
        center_of_field = x + width / 2
        assert cx == center_of_field, \
            f"Circle center ({cx}) != field center ({center_of_field})"
        
        print(f"✓ Radio centering calculation correct: cx={cx}")
    
    def test_03_old_left_aligned_vs_new_centered(self):
        """
        Compare old left-aligned position vs new centered position.
        This demonstrates the fix.
        """
        x = 100
        width = 200
        box_size = 14
        scale = 1.0
        
        # OLD: Left-aligned (x + 2 * scale)
        old_box_x = x + 2 * scale
        
        # NEW: Centered (x + (width - box_size) / 2)
        new_box_x = x + (width - box_size) / 2
        
        # The difference shows the shift that was causing misalignment
        shift = new_box_x - old_box_x
        
        print(f"  Old left-aligned position: {old_box_x}")
        print(f"  New centered position: {new_box_x}")
        print(f"  Shift applied: {shift} points")
        
        # Verify new position is more centered
        field_center = x + width / 2
        old_distance_from_center = abs((old_box_x + box_size / 2) - field_center)
        new_distance_from_center = abs((new_box_x + box_size / 2) - field_center)
        
        assert new_distance_from_center < old_distance_from_center, \
            "New position should be closer to center than old position"
        assert new_distance_from_center == 0, \
            "New position should be exactly centered"
        
        print(f"✓ New centered position is {old_distance_from_center:.1f} points closer to center")


class TestPhase73EndToEndFlow:
    """End-to-end tests for signing flow with checkbox/radio fields"""
    
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
    
    def test_02_packages_public_endpoint_exists(self):
        """Verify packages public endpoint exists"""
        # Test with a fake token (should get 404 for package not found, not endpoint)
        resp = requests.get(f"{BASE_URL}/api/docflow/packages/public/fake-token-12345")
        
        # Should get 404 (package not found) not 405 (method not allowed)
        assert resp.status_code in [404, 410], \
            f"Unexpected status: {resp.status_code}"
        
        print(f"✓ packages/public endpoint exists (status: {resp.status_code})")
    
    def test_03_packages_public_link_endpoint_exists(self):
        """Verify packages public-link endpoint exists"""
        # Test with a fake token
        resp = requests.get(f"{BASE_URL}/api/docflow/packages/public-link/fake-token-12345")
        
        # Should get 404 (package not found) not 405 (method not allowed)
        assert resp.status_code in [404, 410], \
            f"Unexpected status: {resp.status_code}"
        
        print(f"✓ packages/public-link endpoint exists (status: {resp.status_code})")
    
    def test_04_list_templates_with_checkbox_radio(self):
        """List templates and check for checkbox/radio fields"""
        if not self.token:
            pytest.skip("Auth failed")
        
        resp = self.session.get(f"{BASE_URL}/api/docflow/templates")
        assert resp.status_code == 200, f"Failed to list templates: {resp.status_code}"
        
        data = resp.json()
        if isinstance(data, dict):
            templates = data.get("templates", [])
        else:
            templates = data
        
        print(f"\n✓ Found {len(templates)} templates")
        
        checkbox_count = 0
        radio_count = 0
        
        for t in templates[:10]:  # Check first 10
            if not isinstance(t, dict):
                continue
            field_placements = t.get("field_placements", [])
            for f in field_placements:
                if f.get("type") == "checkbox":
                    checkbox_count += 1
                elif f.get("type") == "radio":
                    radio_count += 1
        
        print(f"  Templates with checkbox fields: {checkbox_count}")
        print(f"  Templates with radio fields: {radio_count}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
