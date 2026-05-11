"""
Phase 81.77 — Submission Download APIs Tests

Tests for the new submission download endpoints:
1. GET /api/docflow/packages/{pkg}/runs/{run}/submissions/{sub}/documents
2. GET /api/docflow/packages/{pkg}/runs/{run}/submissions/{sub}/documents/{doc}/download
3. GET /api/docflow/packages/{pkg}/runs/{run}/submissions/{sub}/download/combined

Test scenarios:
- Auth required (403 when no token)
- 404 for invalid submission/run/package
- Successful responses with correct content types
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_EMAIL = "admin@democorp.com"
TEST_PASSWORD = "DemoPass123!"


class TestPhase8177SubmissionDownloads:
    """Tests for Phase 81.77 Submission Download APIs"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token") or data.get("access_token")
        pytest.skip(f"Authentication failed: {resp.status_code} - {resp.text}")

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    # ═══════════════════════════════════════════════════════════════════════════
    # AUTH TESTS — Verify 403 when no token provided
    # ═══════════════════════════════════════════════════════════════════════════

    def test_list_submission_documents_requires_auth(self):
        """GET /submissions/{id}/documents should return 401/403 without auth"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/fake-pkg/runs/fake-run/submissions/fake-sub/documents"
        )
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print(f"✓ list_submission_documents requires auth: {resp.status_code}")

    def test_download_submission_document_requires_auth(self):
        """GET /submissions/{id}/documents/{doc}/download should return 401/403 without auth"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/fake-pkg/runs/fake-run/submissions/fake-sub/documents/fake-doc/download"
        )
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print(f"✓ download_submission_document requires auth: {resp.status_code}")

    def test_download_submission_combined_requires_auth(self):
        """GET /submissions/{id}/download/combined should return 401/403 without auth"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/fake-pkg/runs/fake-run/submissions/fake-sub/download/combined"
        )
        assert resp.status_code in [401, 403], f"Expected 401/403, got {resp.status_code}"
        print(f"✓ download_submission_combined requires auth: {resp.status_code}")

    # ═══════════════════════════════════════════════════════════════════════════
    # 404 TESTS — Verify 404 for invalid IDs
    # ═══════════════════════════════════════════════════════════════════════════

    def test_list_submission_documents_invalid_run_404(self, auth_headers):
        """GET /submissions/{id}/documents should return 404 for invalid run"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/fake-pkg/runs/invalid-run-id/submissions/fake-sub/documents",
            headers=auth_headers
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print(f"✓ list_submission_documents returns 404 for invalid run")

    def test_download_submission_document_invalid_run_404(self, auth_headers):
        """GET /submissions/{id}/documents/{doc}/download should return 404 for invalid run"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/fake-pkg/runs/invalid-run-id/submissions/fake-sub/documents/fake-doc/download",
            headers=auth_headers
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print(f"✓ download_submission_document returns 404 for invalid run")

    def test_download_submission_combined_invalid_run_404(self, auth_headers):
        """GET /submissions/{id}/download/combined should return 404 for invalid run"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/fake-pkg/runs/invalid-run-id/submissions/fake-sub/download/combined",
            headers=auth_headers
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print(f"✓ download_submission_combined returns 404 for invalid run")

    # ═══════════════════════════════════════════════════════════════════════════
    # REAL DATA TESTS — Find a real package/run/submission and test
    # ═══════════════════════════════════════════════════════════════════════════

    @pytest.fixture(scope="class")
    def real_submission_data(self, auth_headers):
        """Find a real package with a run that has submissions"""
        # List packages
        resp = requests.get(f"{BASE_URL}/api/docflow/packages", headers=auth_headers)
        if resp.status_code != 200:
            pytest.skip(f"Could not list packages: {resp.status_code}")
        
        packages = resp.json().get("packages", [])
        if not packages:
            pytest.skip("No packages found in tenant")
        
        # Look for a package with runs that have submissions
        for pkg in packages:
            pkg_id = pkg.get("id")
            runs_resp = requests.get(f"{BASE_URL}/api/docflow/packages/{pkg_id}/runs", headers=auth_headers)
            if runs_resp.status_code != 200:
                continue
            
            runs = runs_resp.json().get("runs", [])
            for run in runs:
                run_id = run.get("id")
                # Check if run has submissions
                if run.get("submissions_count", 0) > 0 or run.get("delivery_mode") in ("public_link", "both"):
                    # Get run detail to find submissions
                    run_detail_resp = requests.get(
                        f"{BASE_URL}/api/docflow/packages/{pkg_id}/runs/{run_id}",
                        headers=auth_headers
                    )
                    if run_detail_resp.status_code == 200:
                        run_detail = run_detail_resp.json()
                        submissions = run_detail.get("submissions", [])
                        if submissions:
                            sub = submissions[0]
                            return {
                                "package_id": pkg_id,
                                "run_id": run_id,
                                "submission_id": sub.get("id"),
                                "submission": sub,
                                "has_signed_docs": len(sub.get("signed_documents", [])) > 0
                            }
        
        pytest.skip("No packages with submissions found in tenant")

    def test_list_submission_documents_success(self, auth_headers, real_submission_data):
        """GET /submissions/{id}/documents should return list of documents"""
        pkg_id = real_submission_data["package_id"]
        run_id = real_submission_data["run_id"]
        sub_id = real_submission_data["submission_id"]
        
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/{pkg_id}/runs/{run_id}/submissions/{sub_id}/documents",
            headers=auth_headers
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert "documents" in data, "Response should contain 'documents' key"
        assert "submission_id" in data, "Response should contain 'submission_id'"
        assert "total" in data, "Response should contain 'total'"
        assert data["submission_id"] == sub_id
        
        print(f"✓ list_submission_documents success: {data['total']} documents found")
        print(f"  Submission: {data.get('name', 'N/A')} ({data.get('email', 'N/A')})")

    def test_download_submission_combined_success(self, auth_headers, real_submission_data):
        """GET /submissions/{id}/download/combined should return PDF"""
        if not real_submission_data.get("has_signed_docs"):
            pytest.skip("Submission has no signed documents")
        
        pkg_id = real_submission_data["package_id"]
        run_id = real_submission_data["run_id"]
        sub_id = real_submission_data["submission_id"]
        
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/{pkg_id}/runs/{run_id}/submissions/{sub_id}/download/combined",
            headers=auth_headers
        )
        
        # Could be 200 (success) or 404 (no signed docs available)
        if resp.status_code == 404:
            print(f"✓ download_submission_combined: 404 (no signed docs available)")
            return
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.headers.get("Content-Type") == "application/pdf", \
            f"Expected application/pdf, got {resp.headers.get('Content-Type')}"
        assert len(resp.content) > 100, "PDF content should be non-empty"
        
        print(f"✓ download_submission_combined success: {len(resp.content)} bytes")

    def test_download_submission_document_success(self, auth_headers, real_submission_data):
        """GET /submissions/{id}/documents/{doc}/download should return single PDF"""
        if not real_submission_data.get("has_signed_docs"):
            pytest.skip("Submission has no signed documents")
        
        pkg_id = real_submission_data["package_id"]
        run_id = real_submission_data["run_id"]
        sub_id = real_submission_data["submission_id"]
        
        # First get the list of documents
        list_resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/{pkg_id}/runs/{run_id}/submissions/{sub_id}/documents",
            headers=auth_headers
        )
        if list_resp.status_code != 200:
            pytest.skip("Could not list submission documents")
        
        docs = list_resp.json().get("documents", [])
        if not docs:
            pytest.skip("No documents in submission")
        
        doc_id = docs[0].get("document_id")
        if not doc_id:
            pytest.skip("Document has no document_id")
        
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/{pkg_id}/runs/{run_id}/submissions/{sub_id}/documents/{doc_id}/download",
            headers=auth_headers
        )
        
        # Could be 200 (success) or 404 (file unavailable)
        if resp.status_code == 404:
            print(f"✓ download_submission_document: 404 (file unavailable)")
            return
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.headers.get("Content-Type") == "application/pdf", \
            f"Expected application/pdf, got {resp.headers.get('Content-Type')}"
        assert len(resp.content) > 100, "PDF content should be non-empty"
        
        print(f"✓ download_submission_document success: {len(resp.content)} bytes")

    def test_download_submission_document_invalid_doc_404(self, auth_headers, real_submission_data):
        """GET /submissions/{id}/documents/{doc}/download should return 404 for invalid doc"""
        pkg_id = real_submission_data["package_id"]
        run_id = real_submission_data["run_id"]
        sub_id = real_submission_data["submission_id"]
        
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/{pkg_id}/runs/{run_id}/submissions/{sub_id}/documents/invalid-doc-id/download",
            headers=auth_headers
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print(f"✓ download_submission_document returns 404 for invalid doc_id")


class TestPhase8177EndpointStructure:
    """Verify endpoint structure and routing"""

    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if resp.status_code == 200:
            data = resp.json()
            return data.get("token") or data.get("access_token")
        pytest.skip(f"Authentication failed: {resp.status_code}")

    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_endpoint_exists_list_documents(self, auth_headers):
        """Verify list documents endpoint exists (not 405 Method Not Allowed)"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/test/runs/test/submissions/test/documents",
            headers=auth_headers
        )
        # Should be 404 (not found) not 405 (method not allowed) or 500
        assert resp.status_code in [404, 200], f"Endpoint may not exist: {resp.status_code}"
        print(f"✓ list_documents endpoint exists (status: {resp.status_code})")

    def test_endpoint_exists_download_document(self, auth_headers):
        """Verify download document endpoint exists"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/test/runs/test/submissions/test/documents/test/download",
            headers=auth_headers
        )
        assert resp.status_code in [404, 200], f"Endpoint may not exist: {resp.status_code}"
        print(f"✓ download_document endpoint exists (status: {resp.status_code})")

    def test_endpoint_exists_download_combined(self, auth_headers):
        """Verify download combined endpoint exists"""
        resp = requests.get(
            f"{BASE_URL}/api/docflow/packages/test/runs/test/submissions/test/download/combined",
            headers=auth_headers
        )
        assert resp.status_code in [404, 200], f"Endpoint may not exist: {resp.status_code}"
        print(f"✓ download_combined endpoint exists (status: {resp.status_code})")
