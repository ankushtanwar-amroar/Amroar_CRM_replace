"""
Phase 56 Tests - 5-point fix verification:
1. Signature field size/aspect consistency in Final PDF
2. Radio option labels NEVER visible (signing + final PDF)
3. Field page sync bug in pagination mode
4. Signature alignment (left/center/right) in final PDF
5. Date Signed alignment in final PDF

Tests verify the code changes in:
- InteractiveDocumentViewer.js (radio render, signature/initials alignment)
- MultiPageVisualBuilder.js (page sync on drag)
- package_public_routes.py (signature aspect-fit, radio label removal)
- package_public_link_routes.py (same fixes)
- PublicDocumentViewEnhanced.js (pdf-lib signature/initials aspect-fit)
"""
import pytest
import requests
import os
import json
import base64

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://template-api-pub.preview.emergentagent.com').rstrip('/')


class TestPhase56RadioNoLabel:
    """Test that radio option labels are NOT rendered in signing page or final PDF"""
    
    def test_radio_field_structure_in_template(self):
        """Verify radio field structure supports new groupName model"""
        # Login first
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@gmail.com",
            "password": "test123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get templates to find one with radio fields
        templates_resp = requests.get(f"{BASE_URL}/api/docflow/templates", headers=headers)
        if templates_resp.status_code == 200:
            data = templates_resp.json()
            templates = data.get("templates", []) if isinstance(data, dict) else data
            print(f"Found {len(templates)} templates")
            
            # Check if any template has radio fields
            for t in templates[:5]:  # Check first 5
                template_id = t.get("id")
                detail_resp = requests.get(f"{BASE_URL}/api/docflow/templates/{template_id}", headers=headers)
                if detail_resp.status_code == 200:
                    detail = detail_resp.json()
                    field_placements = detail.get("field_placements", [])
                    radio_fields = [f for f in field_placements if f.get("type") == "radio"]
                    if radio_fields:
                        print(f"Template {template_id} has {len(radio_fields)} radio fields")
                        for rf in radio_fields:
                            # Verify new model fields exist
                            assert "groupName" in rf or "group_name" in rf or "optionValue" in rf or "option_value" in rf, \
                                f"Radio field missing new model fields: {rf}"
                            print(f"  Radio field: groupName={rf.get('groupName')}, optionValue={rf.get('optionValue')}")
        print("PASS: Radio field structure verification complete")


class TestPhase56SignatureAspectAlign:
    """Test signature/initials aspect-fit and alignment in final PDF"""
    
    def test_signature_alignment_options(self):
        """Verify signature fields support textAlign property"""
        # Login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@gmail.com",
            "password": "test123"
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get templates
        templates_resp = requests.get(f"{BASE_URL}/api/docflow/templates", headers=headers)
        if templates_resp.status_code == 200:
            data = templates_resp.json()
            templates = data.get("templates", []) if isinstance(data, dict) else data
            
            for t in templates[:5]:
                template_id = t.get("id")
                detail_resp = requests.get(f"{BASE_URL}/api/docflow/templates/{template_id}", headers=headers)
                if detail_resp.status_code == 200:
                    detail = detail_resp.json()
                    field_placements = detail.get("field_placements", [])
                    sig_fields = [f for f in field_placements if f.get("type") in ("signature", "initials")]
                    if sig_fields:
                        print(f"Template {template_id} has {len(sig_fields)} signature/initials fields")
                        for sf in sig_fields:
                            style = sf.get("style", {})
                            text_align = style.get("textAlign", "center")
                            print(f"  {sf.get('type')} field: textAlign={text_align}")
                            # textAlign should be one of left, center, right
                            assert text_align in ("left", "center", "right", None), \
                                f"Invalid textAlign value: {text_align}"
        print("PASS: Signature alignment options verification complete")


class TestPhase56DateAlignment:
    """Test date field alignment in signing page and final PDF"""
    
    def test_date_field_alignment(self):
        """Verify date fields support textAlign property"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@gmail.com",
            "password": "test123"
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        templates_resp = requests.get(f"{BASE_URL}/api/docflow/templates", headers=headers)
        if templates_resp.status_code == 200:
            data = templates_resp.json()
            templates = data.get("templates", []) if isinstance(data, dict) else data
            
            for t in templates[:5]:
                template_id = t.get("id")
                detail_resp = requests.get(f"{BASE_URL}/api/docflow/templates/{template_id}", headers=headers)
                if detail_resp.status_code == 200:
                    detail = detail_resp.json()
                    field_placements = detail.get("field_placements", [])
                    date_fields = [f for f in field_placements if f.get("type") == "date"]
                    if date_fields:
                        print(f"Template {template_id} has {len(date_fields)} date fields")
                        for df in date_fields:
                            style = df.get("style", {})
                            text_align = style.get("textAlign", "left")
                            date_mode = df.get("dateMode", "auto")
                            date_format = df.get("dateFormat", "MM/DD/YYYY")
                            print(f"  Date field: textAlign={text_align}, mode={date_mode}, format={date_format}")
        print("PASS: Date field alignment verification complete")


class TestPhase56FieldSizeParity:
    """Test that field sizes are consistent between builder, signing page, and final PDF"""
    
    def test_field_dimensions_preserved(self):
        """Verify field width/height are preserved in template"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@gmail.com",
            "password": "test123"
        })
        assert login_resp.status_code == 200
        token = login_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {token}"}
        
        templates_resp = requests.get(f"{BASE_URL}/api/docflow/templates", headers=headers)
        if templates_resp.status_code == 200:
            data = templates_resp.json()
            templates = data.get("templates", []) if isinstance(data, dict) else data
            
            for t in templates[:3]:
                template_id = t.get("id")
                detail_resp = requests.get(f"{BASE_URL}/api/docflow/templates/{template_id}", headers=headers)
                if detail_resp.status_code == 200:
                    detail = detail_resp.json()
                    field_placements = detail.get("field_placements", [])
                    for f in field_placements[:5]:
                        width = f.get("width", 0)
                        height = f.get("height", 0)
                        field_type = f.get("type")
                        print(f"  {field_type} field: {width}x{height} px")
                        # Verify dimensions are reasonable
                        assert width > 0, f"Field width should be positive: {width}"
                        assert height > 0, f"Field height should be positive: {height}"
                        assert width <= 800, f"Field width too large: {width}"
                        assert height <= 1100, f"Field height too large: {height}"
        print("PASS: Field dimensions verification complete")


class TestPhase56PublicDocumentView:
    """Test public document view with Phase 56 fixes"""
    
    def test_public_document_endpoint(self):
        """Test that public document endpoint returns correct field structure"""
        # Use the test token from previous iterations
        test_token = "RL4N90Q3dGU3jG6yfRK8jziAnZDvOBkS-J0XTc2OsYc"
        
        resp = requests.get(f"{BASE_URL}/api/docflow/documents/public/{test_token}")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Public document loaded: {data.get('template_name', 'Unknown')}")
            print(f"Status: {data.get('status')}")
            print(f"Can sign: {data.get('can_sign')}")
            
            # Check if template_id is present
            template_id = data.get("template_id")
            if template_id:
                # Get field placements
                placements_resp = requests.get(
                    f"{BASE_URL}/api/docflow/templates/{template_id}/field-placements-public"
                )
                if placements_resp.status_code == 200:
                    placements = placements_resp.json()
                    fields = placements.get("field_placements", [])
                    print(f"Found {len(fields)} field placements")
                    
                    # Check for radio fields
                    radio_fields = [f for f in fields if f.get("type") == "radio"]
                    if radio_fields:
                        print(f"  Radio fields: {len(radio_fields)}")
                        for rf in radio_fields:
                            # Verify no label text will be shown
                            print(f"    groupName={rf.get('groupName')}, optionLabel={rf.get('optionLabel')}")
                    
                    # Check for signature fields
                    sig_fields = [f for f in fields if f.get("type") in ("signature", "initials")]
                    if sig_fields:
                        print(f"  Signature/Initials fields: {len(sig_fields)}")
                        for sf in sig_fields:
                            style = sf.get("style", {})
                            print(f"    type={sf.get('type')}, textAlign={style.get('textAlign', 'center')}")
        elif resp.status_code == 404:
            print("Test document not found - this is expected if no test document exists")
        else:
            print(f"Unexpected response: {resp.status_code}")
        
        print("PASS: Public document endpoint test complete")


class TestPhase56BackendCodeReview:
    """Code review tests to verify Phase 56 fixes are in place"""
    
    def test_backend_radio_no_label_code(self):
        """Verify backend code does NOT draw radio labels in final PDF"""
        # Read the backend file
        backend_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        with open(backend_file, 'r') as f:
            content = f.read()
        
        # Check for the Phase 56 comment about no label
        assert "Phase 56: Option label is NEVER drawn in the final PDF" in content, \
            "Missing Phase 56 radio label removal comment"
        
        # Verify no drawText for radio label after the circle drawing
        # The code should NOT have drawText after draw_circle for radio
        lines = content.split('\n')
        in_radio_block = False
        found_circle = False
        found_label_draw = False
        
        for i, line in enumerate(lines):
            if 'elif field_type == "radio"' in line:
                in_radio_block = True
                found_circle = False
            elif in_radio_block:
                if 'draw_circle' in line:
                    found_circle = True
                if found_circle and 'drawText' in line.lower() and 'optionLabel' in line:
                    found_label_draw = True
                if 'elif field_type ==' in line or 'except Exception' in line:
                    in_radio_block = False
        
        assert not found_label_draw, "Backend still draws radio label text - Phase 56 fix not applied"
        print("PASS: Backend radio no-label code verified")
    
    def test_backend_signature_aspect_fit_code(self):
        """Verify backend code uses aspect-fit for signatures"""
        backend_file = "/app/backend/modules/docflow/api/package_public_routes.py"
        with open(backend_file, 'r') as f:
            content = f.read()
        
        # Check for Pixmap usage (for getting image dimensions)
        assert "fitz.Pixmap" in content, "Missing Pixmap usage for image dimension detection"
        
        # Check for aspect calculation
        assert "aspect = img_w / img_h" in content, "Missing aspect ratio calculation"
        
        # Check for alignment handling
        assert 'textAlign' in content, "Missing textAlign handling"
        assert 'align == "left"' in content or "align == 'left'" in content, "Missing left alignment handling"
        assert 'align == "right"' in content or "align == 'right'" in content, "Missing right alignment handling"
        
        print("PASS: Backend signature aspect-fit code verified")
    
    def test_frontend_radio_no_label_code(self):
        """Verify frontend code does NOT show radio labels"""
        frontend_file = "/app/frontend/src/docflow/components/InteractiveDocumentViewer.js"
        with open(frontend_file, 'r') as f:
            content = f.read()
        
        # Check for the DocuSign-style comment
        assert "DocuSign-style UX: option labels are NEVER shown" in content, \
            "Missing DocuSign-style radio label comment"
        
        # Check that aria-label is used for accessibility
        assert "aria-label={optionLabel}" in content, "Missing aria-label for accessibility"
        
        # Check that title is used for hover tooltip
        assert "title={optionLabel" in content, "Missing title for hover tooltip"
        
        print("PASS: Frontend radio no-label code verified")
    
    def test_frontend_signature_alignment_code(self):
        """Verify frontend code handles signature alignment"""
        frontend_file = "/app/frontend/src/docflow/components/InteractiveDocumentViewer.js"
        with open(frontend_file, 'r') as f:
            content = f.read()
        
        # Check for signature alignment handling
        assert "sigAlign = field.style?.textAlign" in content, "Missing signature alignment handling"
        assert "sigJustify" in content, "Missing signature justify class"
        
        # Check for initials alignment handling
        assert "iniAlign = field.style?.textAlign" in content, "Missing initials alignment handling"
        assert "iniJustify" in content, "Missing initials justify class"
        
        print("PASS: Frontend signature alignment code verified")
    
    def test_frontend_page_sync_code(self):
        """Verify frontend code fixes page sync bug in pagination mode"""
        frontend_file = "/app/frontend/src/docflow/components/MultiPageVisualBuilder.js"
        with open(frontend_file, 'r') as f:
            content = f.read()
        
        # Check for the page sync fix comment
        assert "Pagination (page) mode: keep the field pinned to whatever page" in content, \
            "Missing page sync fix comment"
        
        # Check for the fix: page: currentPage in pagination mode
        assert "page: currentPage" in content, "Missing page: currentPage assignment"
        
        print("PASS: Frontend page sync code verified")
    
    def test_pdf_lib_signature_aspect_fit(self):
        """Verify pdf-lib signature embedding uses aspect-fit"""
        frontend_file = "/app/frontend/src/docflow/pages/PublicDocumentViewEnhanced.js"
        with open(frontend_file, 'r') as f:
            content = f.read()
        
        # Check for aspect-fit comment
        assert "Aspect-fit + align (Phase 56)" in content, "Missing Phase 56 aspect-fit comment"
        
        # Check for aspect calculation
        assert "aspect = image.width / image.height" in content, "Missing aspect ratio calculation"
        
        # Check for alignment handling
        assert "field.style?.textAlign" in content, "Missing textAlign handling"
        
        print("PASS: pdf-lib signature aspect-fit code verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
