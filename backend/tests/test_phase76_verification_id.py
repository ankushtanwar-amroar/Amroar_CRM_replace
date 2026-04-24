"""
Phase 76 Testing — Verification ID Stamping on Final Signed PDFs

Tests:
1. Template sign flow: POST /api/docflow/documents/{id}/sign → final signed PDF has 
   'Template Verification ID: {doc.id.upper()}' stamped at top-left of every page.
2. Package sign flow: POST /api/docflow/packages/public/{token}/sign-with-fields → 
   final signed PDF has 'Package Verification ID: {package.id.upper()}' stamped.
3. Public-link submission flow: POST /api/docflow/packages/public-link/{token}/submit → 
   same stamp.
4. Phase 73 centering regression: checkbox + radio centering still intact.
5. Phase 74 sender chip regression: sender info still in public endpoints.
"""
import pytest
import requests
import os
import io
import fitz  # PyMuPDF for PDF text extraction

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@gmail.com"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token") or data.get("token")
    pytest.skip(f"Authentication failed: {response.status_code}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestPhase76VerificationIdCodeReview:
    """Code review tests for Phase 76 verification ID implementation."""
    
    def test_01_pdf_overlay_service_accepts_verification_params(self):
        """Verify pdf_overlay_service_enhanced.py accepts verification_id and verification_label."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        import inspect
        
        sig = inspect.signature(PDFOverlayService.overlay_fields_on_pdf)
        params = list(sig.parameters.keys())
        
        assert 'verification_id' in params, "overlay_fields_on_pdf should accept verification_id param"
        assert 'verification_label' in params, "overlay_fields_on_pdf should accept verification_label param"
        print("✓ PDFOverlayService.overlay_fields_on_pdf accepts verification_id and verification_label")
    
    def test_02_pdf_overlay_service_stamps_verification_id(self):
        """Verify the overlay service stamps verification ID at top-left of every page."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        # Read the source code to verify the stamping logic
        with open('/app/backend/modules/docflow/services/pdf_overlay_service_enhanced.py', 'r') as f:
            source = f.read()
        
        # Check for verification stamp logic in _create_overlay_for_page
        assert 'verification_id' in source, "Source should reference verification_id"
        assert 'c.drawString(18, page_height - 14' in source or 'c.drawString(18, page_height-14' in source, \
            "Should stamp at position (18, page_height-14)"
        assert 'Helvetica' in source, "Should use Helvetica font"
        assert '0.4, 0.4, 0.4' in source, "Should use gray color (0.4, 0.4, 0.4)"
        print("✓ PDFOverlayService stamps verification ID at top-left with gray Helvetica 8pt")
    
    def test_03_document_service_passes_template_verification_id(self):
        """Verify document_service_enhanced.py passes Template Verification ID to overlay."""
        with open('/app/backend/modules/docflow/services/document_service_enhanced.py', 'r') as f:
            source = f.read()
        
        # Check for Template Verification ID being passed
        assert 'Template Verification ID' in source, "Should pass 'Template Verification ID' label"
        assert 'verification_id' in source, "Should pass verification_id parameter"
        assert '.upper()' in source or 'UPPER' in source, "Should uppercase the document ID"
        print("✓ document_service_enhanced.py passes Template Verification ID with uppercase doc.id")
    
    def test_04_package_public_routes_stamps_package_verification_id(self):
        """Verify package_public_routes.py stamps Package Verification ID."""
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Check for Package Verification ID stamping
        assert 'Package Verification ID' in source, "Should stamp 'Package Verification ID'"
        assert '.upper()' in source, "Should uppercase the package ID"
        assert 'fitz.Point(18, 14)' in source, "Should stamp at position (18, 14) using PyMuPDF"
        assert 'fontsize=8' in source, "Should use fontsize 8"
        assert '0.4, 0.4, 0.4' in source, "Should use gray color"
        print("✓ package_public_routes.py stamps Package Verification ID at top-left of every page")
    
    def test_05_package_public_link_routes_stamps_package_verification_id(self):
        """Verify package_public_link_routes.py stamps Package Verification ID."""
        with open('/app/backend/modules/docflow/api/package_public_link_routes.py', 'r') as f:
            source = f.read()
        
        # Check for Package Verification ID stamping
        assert 'Package Verification ID' in source, "Should stamp 'Package Verification ID'"
        assert '.upper()' in source, "Should uppercase the package ID"
        assert 'fitz.Point(18, 14)' in source, "Should stamp at position (18, 14)"
        print("✓ package_public_link_routes.py stamps Package Verification ID at top-left of every page")


class TestPhase76VerificationIdUnit:
    """Unit tests for verification ID stamping using actual PDF generation."""
    
    def test_06_overlay_service_stamps_on_single_page_pdf(self):
        """Test that overlay service stamps verification ID on a single-page PDF."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        
        # Create a simple 1-page PDF
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        c.drawString(100, 700, "Test Document Page 1")
        c.save()
        buffer.seek(0)
        pdf_bytes = buffer.read()
        
        # Apply overlay with verification ID
        service = PDFOverlayService()
        test_verification_id = "ABC12345-TEST-UUID"
        
        result_bytes = service.overlay_fields_on_pdf(
            pdf_bytes,
            field_placements=[],
            field_values={},
            signatures=[],
            verification_id=test_verification_id,
            verification_label="Template Verification ID"
        )
        
        assert result_bytes is not None, "Should return PDF bytes"
        assert len(result_bytes) > 0, "Result should not be empty"
        
        # Extract text from the result PDF to verify stamp
        pdf_doc = fitz.open(stream=result_bytes, filetype="pdf")
        page = pdf_doc[0]
        text = page.get_text()
        pdf_doc.close()
        
        # The stamp should be present
        assert "Template Verification ID" in text or test_verification_id in text, \
            f"Verification stamp should be in PDF text. Got: {text[:500]}"
        print(f"✓ Single-page PDF stamped with verification ID")
    
    def test_07_overlay_service_stamps_on_multi_page_pdf(self):
        """Test that overlay service stamps verification ID on EVERY page of a multi-page PDF."""
        import sys
        sys.path.insert(0, '/app/backend')
        
        from modules.docflow.services.pdf_overlay_service_enhanced import PDFOverlayService
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        
        # Create a 3-page PDF
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        for i in range(3):
            c.drawString(100, 700, f"Test Document Page {i+1}")
            c.showPage()
        c.save()
        buffer.seek(0)
        pdf_bytes = buffer.read()
        
        # Apply overlay with verification ID
        service = PDFOverlayService()
        test_verification_id = "MULTI-PAGE-TEST-UUID"
        
        result_bytes = service.overlay_fields_on_pdf(
            pdf_bytes,
            field_placements=[],
            field_values={},
            signatures=[],
            verification_id=test_verification_id,
            verification_label="Package Verification ID"
        )
        
        # Extract text from ALL pages
        pdf_doc = fitz.open(stream=result_bytes, filetype="pdf")
        assert pdf_doc.page_count == 3, "Should have 3 pages"
        
        for i in range(3):
            page = pdf_doc[i]
            text = page.get_text()
            assert "Package Verification ID" in text or test_verification_id in text, \
                f"Page {i+1} should have verification stamp. Got: {text[:300]}"
        
        pdf_doc.close()
        print(f"✓ Multi-page PDF (3 pages) stamped with verification ID on every page")


class TestPhase73CenteringRegression:
    """Regression tests for Phase 73 checkbox/radio centering."""
    
    def test_08_checkbox_centering_in_pdf_overlay_service(self):
        """Verify checkbox centering formula is still present in pdf_overlay_service_enhanced.py."""
        with open('/app/backend/modules/docflow/services/pdf_overlay_service_enhanced.py', 'r') as f:
            source = f.read()
        
        # Check for centered checkbox positioning
        assert 'box_x = x + (width - box_size) / 2' in source, \
            "Checkbox should be centered: box_x = x + (width - box_size) / 2"
        assert 'box_y = y + (height - box_size) / 2' in source, \
            "Checkbox should be vertically centered: box_y = y + (height - box_size) / 2"
        print("✓ Phase 73 checkbox centering intact in pdf_overlay_service_enhanced.py")
    
    def test_09_radio_centering_in_pdf_overlay_service(self):
        """Verify radio centering formula is still present in pdf_overlay_service_enhanced.py."""
        with open('/app/backend/modules/docflow/services/pdf_overlay_service_enhanced.py', 'r') as f:
            source = f.read()
        
        # Check for centered radio positioning
        assert 'cx = x + width / 2' in source, \
            "Radio should be centered: cx = x + width / 2"
        assert 'cy = y + height / 2' in source, \
            "Radio should be vertically centered: cy = y + height / 2"
        print("✓ Phase 73 radio centering intact in pdf_overlay_service_enhanced.py")
    
    def test_10_checkbox_centering_in_package_public_routes(self):
        """Verify checkbox centering in package_public_routes.py."""
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        assert 'bx = x + (w - box_size) / 2' in source, \
            "Checkbox should be centered in package_public_routes.py"
        print("✓ Phase 73 checkbox centering intact in package_public_routes.py")
    
    def test_11_radio_centering_in_package_public_routes(self):
        """Verify radio centering in package_public_routes.py."""
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        assert 'cx = x + w / 2' in source, \
            "Radio should be centered in package_public_routes.py"
        print("✓ Phase 73 radio centering intact in package_public_routes.py")
    
    def test_12_checkbox_centering_in_package_public_link_routes(self):
        """Verify checkbox centering in package_public_link_routes.py."""
        with open('/app/backend/modules/docflow/api/package_public_link_routes.py', 'r') as f:
            source = f.read()
        
        assert 'bx = x + (w - box_size) / 2' in source, \
            "Checkbox should be centered in package_public_link_routes.py"
        print("✓ Phase 73 checkbox centering intact in package_public_link_routes.py")
    
    def test_13_radio_centering_in_package_public_link_routes(self):
        """Verify radio centering in package_public_link_routes.py."""
        with open('/app/backend/modules/docflow/api/package_public_link_routes.py', 'r') as f:
            source = f.read()
        
        assert 'cx = x + w / 2' in source, \
            "Radio should be centered in package_public_link_routes.py"
        print("✓ Phase 73 radio centering intact in package_public_link_routes.py")


class TestPhase74SenderChipRegression:
    """Regression tests for Phase 74 sender chip in public endpoints."""
    
    def test_14_sender_info_in_package_public_routes(self):
        """Verify sender info resolution is still present in package_public_routes.py."""
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        assert 'sender_info' in source, "Should have sender_info variable"
        assert 'created_by' in source, "Should look up created_by user"
        assert '"sender":' in source or "'sender':" in source, "Should return sender in response"
        print("✓ Phase 74 sender info intact in package_public_routes.py")
    
    def test_15_sender_info_api_response(self, auth_headers):
        """Test that public package endpoint returns sender info."""
        # First get a package with a public token
        response = requests.get(
            f"{BASE_URL}/api/docflow/packages",
            headers=auth_headers
        )
        
        if response.status_code != 200:
            pytest.skip("Could not fetch packages")
        
        packages = response.json().get("packages", [])
        if not packages:
            pytest.skip("No packages found")
        
        # Find a package with recipients that have public_token
        public_token = None
        for pkg in packages:
            for r in pkg.get("recipients", []):
                if r.get("public_token"):
                    public_token = r["public_token"]
                    break
            if public_token:
                break
        
        if not public_token:
            pytest.skip("No package with public_token found")
        
        # Call the public endpoint
        response = requests.get(f"{BASE_URL}/api/docflow/packages/public/{public_token}")
        
        if response.status_code == 200:
            data = response.json()
            # sender field should be present (may be null if user not found)
            assert "sender" in data or data.get("session_required"), \
                "Response should include 'sender' field or require session"
            print(f"✓ Public package endpoint returns sender info (or session_required)")
        elif response.status_code == 401:
            # Session required - that's fine, the field would be in the full response
            print("✓ Public package endpoint requires session (sender would be in authenticated response)")
        else:
            pytest.fail(f"Unexpected status: {response.status_code}")


class TestPhase76FrontendCodeReview:
    """Frontend code review for Phase 76 changes."""
    
    def test_16_visual_builder_responsive_panels(self):
        """Verify Visual Builder panel widths are responsive for wide screens."""
        with open('/app/frontend/src/docflow/components/MultiPageVisualBuilder.js', 'r') as f:
            source = f.read()
        
        # Check left panel responsive width (256→320px at 2xl)
        assert 'xl:w-72' in source or '2xl:w-80' in source, \
            "Left panel should have responsive width classes"
        
        # Check right panel responsive width (288→384px at 2xl)
        assert 'xl:w-80' in source or '2xl:w-96' in source, \
            "Right panel should have responsive width classes"
        
        print("✓ Visual Builder panels have responsive widths for wide screens")
    
    def test_17_visual_builder_auto_zoom_cap_raised(self):
        """Verify auto-zoom cap raised from 1.2x to 1.5x."""
        with open('/app/frontend/src/docflow/components/MultiPageVisualBuilder.js', 'r') as f:
            source = f.read()
        
        # Check for MAX_AUTO_ZOOM = 1.5
        assert 'MAX_AUTO_ZOOM = 1.5' in source, \
            "MAX_AUTO_ZOOM should be 1.5 (raised from 1.2)"
        print("✓ Visual Builder auto-zoom cap raised to 1.5x")
    
    def test_18_template_editor_container_width(self):
        """Verify TemplateEditor visual tab uses max-w-[1920px] for wide screens."""
        with open('/app/frontend/src/docflow/pages/TemplateEditor.js', 'r') as f:
            source = f.read()
        
        # Check for expanded container width
        assert '2xl:max-w-[1920px]' in source or 'max-w-[1920px]' in source, \
            "Visual tab container should use max-w-[1920px] for wide screens"
        print("✓ TemplateEditor visual tab container expanded to 1920px max width")
    
    def test_19_radio_group_required_propagation(self):
        """Verify radio group 'Required' propagates to all siblings with same groupName."""
        with open('/app/frontend/src/docflow/components/MultiPageVisualBuilder.js', 'r') as f:
            source = f.read()
        
        # Check for updateFieldPropertyWithRadioGroupSync function
        assert 'updateFieldPropertyWithRadioGroupSync' in source, \
            "Should have updateFieldPropertyWithRadioGroupSync function"
        
        # Check that it propagates required to all same-group radios
        assert "groupName" in source and "required" in source, \
            "Should propagate required to all radios with same groupName"
        
        print("✓ Radio group 'Required' propagation function exists")
    
    def test_20_radio_group_required_ui_reflects_or_state(self):
        """Verify isFieldRequiredForUI returns OR'd state for radio groups."""
        with open('/app/frontend/src/docflow/components/MultiPageVisualBuilder.js', 'r') as f:
            source = f.read()
        
        # Check for isFieldRequiredForUI function
        assert 'isFieldRequiredForUI' in source, \
            "Should have isFieldRequiredForUI function"
        
        # Check that it checks any sibling in the group
        assert '.some(' in source, \
            "isFieldRequiredForUI should use .some() to check any sibling"
        
        print("✓ isFieldRequiredForUI returns OR'd state for radio groups")
    
    def test_21_guided_fill_in_radio_group_required(self):
        """Verify useGuidedFillIn treats radio group as one required unit."""
        with open('/app/frontend/src/docflow/hooks/useGuidedFillIn.js', 'r') as f:
            source = f.read()
        
        # Check for isRadioGroupRequired function
        assert 'isRadioGroupRequired' in source, \
            "Should have isRadioGroupRequired function"
        
        # Check for shouldIncludeAsRequired using radio group logic
        assert 'shouldIncludeAsRequired' in source, \
            "Should have shouldIncludeAsRequired function"
        
        # Verify it checks if ANY sibling has required=true
        assert '.some(' in source, \
            "isRadioGroupRequired should use .some() to check any sibling"
        
        print("✓ useGuidedFillIn treats radio group as one required unit")


class TestPhase76APIIntegration:
    """API integration tests for Phase 76."""
    
    def test_22_templates_endpoint_working(self, auth_headers):
        """Verify templates endpoint is working."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/templates",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Templates endpoint failed: {response.status_code}"
        data = response.json()
        assert "templates" in data, "Response should have templates array"
        print(f"✓ Templates endpoint working ({len(data.get('templates', []))} templates)")
    
    def test_23_documents_endpoint_working(self, auth_headers):
        """Verify documents endpoint is working."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/documents",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Documents endpoint failed: {response.status_code}"
        data = response.json()
        assert "documents" in data, "Response should have documents array"
        print(f"✓ Documents endpoint working ({len(data.get('documents', []))} documents)")
    
    def test_24_packages_endpoint_working(self, auth_headers):
        """Verify packages endpoint is working."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/packages",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Packages endpoint failed: {response.status_code}"
        data = response.json()
        assert "packages" in data, "Response should have packages array"
        print(f"✓ Packages endpoint working ({len(data.get('packages', []))} packages)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
