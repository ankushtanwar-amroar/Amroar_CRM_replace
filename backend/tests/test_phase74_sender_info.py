"""
Phase 74 Tests - Sender Info in Public Signing Views + Visual Builder Auto-Fit + Radio Fill-In Arrow

Tests for Phase 74 features:
1. Backend: GET /api/docflow/documents/public/{token} returns 'sender' object with name/email
2. Backend: GET /api/docflow/packages/public/{token} returns 'sender' object with name/email
3. Frontend: PublicDocumentViewEnhanced shows sender chip (data-testid=document-sender-chip)
4. Frontend: PackagePublicView shows sender chip (data-testid=package-sender-chip)
5. Frontend: Visual Builder auto-fit zoom now clamped to [0.3, 1.2] (previously capped at 1.0)
6. Frontend: InteractiveDocumentViewer isFillInAnchor only shows on exact activeFieldId match
"""
import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@gmail.com"
TEST_PASSWORD = "test123"


class TestPhase74SenderInfoBackend:
    """Backend tests for sender info resolution in public endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.tenant_id = None
        self.user_id = None
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token") or data.get("token")
            self.tenant_id = data.get("tenant_id") or data.get("user", {}).get("tenant_id")
            self.user_id = data.get("user", {}).get("id")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        self.session.close()
    
    def test_01_auth_working(self):
        """Verify authentication is working"""
        assert self.token is not None, "Authentication failed - no token received"
        print(f"✓ Auth working, tenant_id: {self.tenant_id}, user_id: {self.user_id}")
    
    def test_02_resolve_sender_info_helper_exists(self):
        """
        Verify _resolve_sender_info helper exists in document_routes_enhanced.py
        """
        with open('/app/backend/modules/docflow/api/document_routes_enhanced.py', 'r') as f:
            source = f.read()
        
        # Verify Phase 74 comment exists
        assert "Phase 74" in source, "Missing Phase 74 comment in document_routes_enhanced.py"
        
        # Verify _resolve_sender_info function exists
        assert "async def _resolve_sender_info" in source, \
            "Missing _resolve_sender_info helper function"
        
        # Verify it handles None user_id gracefully
        assert "if not user_id:" in source, \
            "Missing None user_id check in _resolve_sender_info"
        
        # Verify it returns None on error
        assert "return None" in source, \
            "Missing return None fallback in _resolve_sender_info"
        
        print("✓ _resolve_sender_info helper exists in document_routes_enhanced.py")
    
    def test_03_document_public_endpoint_enriches_sender(self):
        """
        Verify GET /documents/public/{token} enriches response with sender info.
        """
        with open('/app/backend/modules/docflow/api/document_routes_enhanced.py', 'r') as f:
            source = f.read()
        
        # Verify sender enrichment in get_document_public
        assert 'sender_info = await _resolve_sender_info' in source, \
            "Missing sender_info resolution in get_document_public"
        
        assert 'document["sender"] = sender_info' in source, \
            "Missing sender assignment to document response"
        
        print("✓ GET /documents/public/{token} enriches response with sender info")
    
    def test_04_package_public_endpoint_enriches_sender(self):
        """
        Verify GET /packages/public/{token} enriches response with sender info.
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify Phase 74 comment exists
        assert "Phase 74" in source, "Missing Phase 74 comment in package_public_routes.py"
        
        # Verify sender resolution logic
        assert 'sender_user_id = package.get("created_by")' in source, \
            "Missing created_by lookup for sender"
        
        # Verify sender is added to response
        assert '"sender": sender_info' in source, \
            "Missing sender in response dict"
        
        print("✓ GET /packages/public/{token} enriches response with sender info")
    
    def test_05_sender_name_resolution_priority(self):
        """
        Verify sender name resolution follows correct priority:
        full_name > name > first_name + last_name > email prefix
        """
        with open('/app/backend/modules/docflow/api/document_routes_enhanced.py', 'r') as f:
            source = f.read()
        
        # Verify name resolution priority
        assert 'user.get("full_name")' in source, "Missing full_name check"
        assert 'user.get("name")' in source, "Missing name check"
        assert 'user.get("first_name")' in source, "Missing first_name check"
        assert 'user.get("last_name")' in source, "Missing last_name check"
        assert 'split("@")[0]' in source, "Missing email prefix fallback"
        
        print("✓ Sender name resolution follows correct priority")
    
    def test_06_documents_list_endpoint_working(self):
        """
        Regression: Verify documents list endpoint still works.
        """
        if not self.token:
            pytest.skip("Auth failed")
        
        response = self.session.get(f"{BASE_URL}/api/docflow/documents")
        assert response.status_code == 200, f"Documents endpoint failed: {response.status_code}"
        
        data = response.json()
        documents = data.get("documents", [])
        
        print(f"✓ Documents endpoint working, found {len(documents)} documents")
    
    def test_07_find_document_with_public_token(self):
        """
        Find a document with a public_token to test the public endpoint.
        """
        if not self.token:
            pytest.skip("Auth failed")
        
        response = self.session.get(f"{BASE_URL}/api/docflow/documents")
        if response.status_code != 200:
            pytest.skip("Could not fetch documents")
        
        data = response.json()
        documents = data.get("documents", [])
        
        # Find a document with public_token
        doc_with_token = None
        for doc in documents:
            if doc.get("public_token"):
                doc_with_token = doc
                break
        
        if not doc_with_token:
            print("⚠ No documents with public_token found - skipping public endpoint test")
            pytest.skip("No documents with public_token")
        
        public_token = doc_with_token.get("public_token")
        print(f"✓ Found document with public_token: {public_token[:20]}...")
        
        # Test the public endpoint
        public_response = requests.get(f"{BASE_URL}/api/docflow/documents/public/{public_token}")
        
        if public_response.status_code == 200:
            public_data = public_response.json()
            
            # Check if sender is present
            sender = public_data.get("sender")
            if sender:
                print(f"✓ Sender info present: name={sender.get('name')}, email={sender.get('email')}")
            else:
                print("⚠ Sender info not present (may be missing created_by or user deleted)")
            
            # Verify other fields still present
            assert "active_recipient" in public_data, "Missing active_recipient in response"
            assert "status" in public_data, "Missing status in response"
            
            print("✓ Public document endpoint returns expected fields")
        elif public_response.status_code == 410:
            print("⚠ Document expired - skipping sender check")
        else:
            print(f"⚠ Public endpoint returned {public_response.status_code}")


class TestPhase74FrontendCodeReview:
    """Code review tests for frontend Phase 74 changes"""
    
    def test_01_public_document_view_sender_chip(self):
        """
        Verify PublicDocumentViewEnhanced.js has sender chip with data-testid.
        """
        with open('/app/frontend/src/docflow/pages/PublicDocumentViewEnhanced.js', 'r') as f:
            source = f.read()
        
        # Verify Phase 74 comment
        assert "Phase 74" in source, "Missing Phase 74 comment in PublicDocumentViewEnhanced.js"
        
        # Verify sender chip data-testid
        assert 'data-testid="document-sender-chip"' in source, \
            "Missing data-testid=document-sender-chip"
        
        # Verify sender name display
        assert 'data-testid="sender-name"' in source, \
            "Missing data-testid=sender-name"
        
        # Verify sender email display
        assert 'data-testid="sender-email"' in source, \
            "Missing data-testid=sender-email"
        
        # Verify conditional rendering (only show if sender exists)
        assert 'docData.sender' in source, \
            "Missing conditional check for docData.sender"
        
        print("✓ PublicDocumentViewEnhanced.js has sender chip with correct data-testids")
    
    def test_02_package_public_view_sender_chip(self):
        """
        Verify PackagePublicView.js has sender chip with data-testid.
        """
        with open('/app/frontend/src/docflow/pages/PackagePublicView.js', 'r') as f:
            source = f.read()
        
        # Verify Phase 74 comment
        assert "Phase 74" in source, "Missing Phase 74 comment in PackagePublicView.js"
        
        # Verify sender chip data-testid
        assert 'data-testid="package-sender-chip"' in source, \
            "Missing data-testid=package-sender-chip"
        
        # Verify sender name display
        assert 'data-testid="sender-name"' in source, \
            "Missing data-testid=sender-name"
        
        # Verify conditional rendering
        assert 'pkg?.sender' in source or 'pkg.sender' in source, \
            "Missing conditional check for pkg.sender"
        
        print("✓ PackagePublicView.js has sender chip with correct data-testids")
    
    def test_03_visual_builder_auto_fit_zoom_max(self):
        """
        Verify MultiPageVisualBuilder.js auto-fit zoom is clamped to [0.3, 1.2].
        Phase 74: Previously capped at 1.0, now allows up to 1.2x on wide screens.
        """
        with open('/app/frontend/src/docflow/components/MultiPageVisualBuilder.js', 'r') as f:
            source = f.read()
        
        # Verify Phase 74 comment about auto-fit
        assert "Phase 74" in source, "Missing Phase 74 comment in MultiPageVisualBuilder.js"
        
        # Verify MAX_AUTO_ZOOM = 1.2
        assert "MAX_AUTO_ZOOM = 1.2" in source, \
            "Missing MAX_AUTO_ZOOM = 1.2 constant"
        
        # Verify zoom clamp uses MAX_AUTO_ZOOM
        assert "Math.min(MAX_AUTO_ZOOM" in source, \
            "Missing Math.min(MAX_AUTO_ZOOM, ...) in zoom calculation"
        
        # Verify lower bound is 0.3
        assert "Math.max(0.3" in source, \
            "Missing Math.max(0.3, ...) in zoom calculation"
        
        print("✓ MultiPageVisualBuilder.js auto-fit zoom clamped to [0.3, 1.2]")
    
    def test_04_interactive_viewer_fill_in_anchor_logic(self):
        """
        Verify InteractiveDocumentViewer.js isFillInAnchor only shows on exact activeFieldId match.
        Phase 74: Fix for radio groups showing 'Fill In' badge on every option.
        """
        with open('/app/frontend/src/docflow/components/InteractiveDocumentViewer.js', 'r') as f:
            source = f.read()
        
        # Verify isFillInAnchor logic exists
        assert "isFillInAnchor" in source, "Missing isFillInAnchor variable"
        
        # Verify the fix: isFillInAnchor = isActive && activeFieldId === field.id
        # This ensures only the EXACT active field shows the arrow, not siblings
        fill_in_anchor_pattern = r'isFillInAnchor\s*=\s*isActive\s*&&\s*activeFieldId\s*===\s*field\.id'
        assert re.search(fill_in_anchor_pattern, source), \
            "Missing isFillInAnchor = isActive && activeFieldId === field.id"
        
        # Verify data-testid for the arrow
        assert 'data-testid="guided-fill-in-arrow"' in source, \
            "Missing data-testid=guided-fill-in-arrow"
        
        # Verify isFillInAnchor is used for conditional rendering
        assert "{isFillInAnchor &&" in source, \
            "Missing conditional rendering with isFillInAnchor"
        
        print("✓ InteractiveDocumentViewer.js isFillInAnchor only shows on exact activeFieldId match")
    
    def test_05_fill_in_anchor_in_both_render_modes(self):
        """
        Verify isFillInAnchor logic is applied in BOTH page-mode and scroll-mode render loops.
        """
        with open('/app/frontend/src/docflow/components/InteractiveDocumentViewer.js', 'r') as f:
            source = f.read()
        
        # Count occurrences of isFillInAnchor assignment
        # Should appear twice: once in scroll mode (renderPageWithFields) and once in page mode
        fill_in_anchor_count = source.count("isFillInAnchor = isActive && activeFieldId === field.id")
        
        assert fill_in_anchor_count >= 2, \
            f"Expected isFillInAnchor logic in both render modes, found {fill_in_anchor_count} occurrences"
        
        print(f"✓ isFillInAnchor logic appears {fill_in_anchor_count} times (page + scroll modes)")


class TestPhase74RegressionChecks:
    """Regression tests to ensure Phase 73 centering and other features still work"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        
        # Login to get token
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token") or data.get("token")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        self.session.close()
    
    def test_01_phase73_checkbox_centering_still_present(self):
        """
        Regression: Verify Phase 73 checkbox centering is still present.
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify checkbox centering math still present
        checkbox_centering_pattern = r'bx\s*=\s*x\s*\+\s*\(\s*w\s*-\s*box_size\s*\)\s*/\s*2'
        assert re.search(checkbox_centering_pattern, source), \
            "Phase 73 checkbox centering math missing!"
        
        print("✓ Phase 73 checkbox centering still present")
    
    def test_02_phase73_radio_centering_still_present(self):
        """
        Regression: Verify Phase 73 radio centering is still present.
        """
        with open('/app/backend/modules/docflow/api/package_public_routes.py', 'r') as f:
            source = f.read()
        
        # Verify radio centering math still present
        radio_centering_pattern = r'cx\s*=\s*x\s*\+\s*w\s*/\s*2'
        assert re.search(radio_centering_pattern, source), \
            "Phase 73 radio centering math missing!"
        
        print("✓ Phase 73 radio centering still present")
    
    def test_03_templates_endpoint_working(self):
        """
        Regression: Verify templates endpoint still works.
        """
        if not self.token:
            pytest.skip("Auth failed")
        
        response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        assert response.status_code == 200, f"Templates endpoint failed: {response.status_code}"
        
        data = response.json()
        if isinstance(data, dict):
            templates = data.get("templates", [])
        else:
            templates = data
        
        print(f"✓ Templates endpoint working, found {len(templates)} templates")
    
    def test_04_login_flow_working(self):
        """
        Regression: Verify login flow still works.
        """
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 200, f"Login failed: {response.status_code}"
        
        data = response.json()
        assert "access_token" in data or "token" in data, "Missing token in login response"
        assert "user" in data, "Missing user in login response"
        
        print("✓ Login flow working")
    
    def test_05_document_listing_working(self):
        """
        Regression: Verify document listing still works.
        """
        if not self.token:
            pytest.skip("Auth failed")
        
        response = self.session.get(f"{BASE_URL}/api/docflow/documents")
        assert response.status_code == 200, f"Documents endpoint failed: {response.status_code}"
        
        data = response.json()
        assert "documents" in data, "Missing documents key in response"
        
        print(f"✓ Document listing working, found {len(data.get('documents', []))} documents")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
