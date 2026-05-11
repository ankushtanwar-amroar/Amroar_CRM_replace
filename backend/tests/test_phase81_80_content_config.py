"""
Phase 81.80 — Dynamic Content Configuration API Tests

Tests for the content configuration system that allows tenants to customize
consent disclosure, review & continue, and SMS disclaimer content.

Section types: consent_disclosure, review_continue, sms_disclaimer
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin@democorp.com"
TEST_PASSWORD = "DemoPass123!"

# Known package run ID from previous tests (for public endpoint testing)
KNOWN_RUN_ID = "ba180c77-b87f-4581-b969-f10f6e7160ec"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for Demo Corp tenant."""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    token = data.get("access_token")
    assert token, "No access_token in login response"
    return token


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token."""
    return {"Authorization": f"Bearer {auth_token}"}


class TestPublicContentConfigEndpoint:
    """Tests for GET /api/docflow/public/content-config (no auth required)"""

    def test_public_endpoint_no_params_returns_defaults(self):
        """Public endpoint without params returns system defaults."""
        response = requests.get(f"{BASE_URL}/api/docflow/public/content-config")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_default_only") is True
        assert data.get("tenant_id") is None
        
        sections = data.get("sections", {})
        assert "consent_disclosure" in sections
        assert "review_continue" in sections
        assert "sms_disclaimer" in sections
        
        # Each section should have is_default=True
        for section_type, section in sections.items():
            assert section.get("is_default") is True
            assert section.get("content") is not None

    def test_public_endpoint_with_package_id_resolves_tenant(self):
        """Public endpoint with package_id resolves tenant and returns their config."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/public/content-config",
            params={"package_id": KNOWN_RUN_ID}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_default_only") is False
        assert data.get("tenant_id") is not None
        
        sections = data.get("sections", {})
        assert len(sections) == 3

    def test_public_endpoint_with_invalid_package_id_returns_defaults(self):
        """Public endpoint with invalid package_id returns defaults (no 404)."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/public/content-config",
            params={"package_id": "nonexistent-id-12345"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_default_only") is True


class TestAuthContentConfigEndpoints:
    """Tests for authenticated content config endpoints."""

    def test_get_all_sections_without_auth_returns_403(self):
        """GET /api/docflow/content-config without auth returns 403."""
        response = requests.get(f"{BASE_URL}/api/docflow/content-config")
        assert response.status_code == 403

    def test_get_all_sections_with_auth(self, auth_headers):
        """GET /api/docflow/content-config returns all 3 sections."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("tenant_id") is not None
        
        sections = data.get("sections", {})
        assert "consent_disclosure" in sections
        assert "review_continue" in sections
        assert "sms_disclaimer" in sections

    def test_get_single_section_consent_disclosure(self, auth_headers):
        """GET /api/docflow/content-config/consent_disclosure returns section."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/consent_disclosure",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("section_type") == "consent_disclosure"
        assert "content" in data
        assert "is_default" in data
        
        content = data.get("content", {})
        assert "title" in content
        assert "sections" in content

    def test_get_single_section_review_continue(self, auth_headers):
        """GET /api/docflow/content-config/review_continue returns section."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/review_continue",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("section_type") == "review_continue"
        
        content = data.get("content", {})
        assert "body_html" in content
        assert "checkbox_text" in content

    def test_get_single_section_sms_disclaimer(self, auth_headers):
        """GET /api/docflow/content-config/sms_disclaimer returns section."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/sms_disclaimer",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("section_type") == "sms_disclaimer"
        
        content = data.get("content", {})
        assert "info_box_message" in content
        assert "bullets" in content

    def test_get_invalid_section_type_returns_400(self, auth_headers):
        """GET /api/docflow/content-config/invalid_type returns 400."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/invalid_section",
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_get_defaults_endpoint(self, auth_headers):
        """GET /api/docflow/content-config/_defaults/all returns all defaults."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/_defaults/all",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        defaults = data.get("defaults", {})
        assert "consent_disclosure" in defaults
        assert "review_continue" in defaults
        assert "sms_disclaimer" in defaults


class TestUpdateContentConfig:
    """Tests for PUT /api/docflow/content-config/{section_type}"""

    def test_put_without_auth_returns_403(self):
        """PUT without auth returns 403."""
        response = requests.put(
            f"{BASE_URL}/api/docflow/content-config/review_continue",
            json={"content": {"title": "Test"}}
        )
        assert response.status_code == 403

    def test_put_update_section_and_verify_persistence(self, auth_headers):
        """PUT updates section; subsequent GET shows is_default=False."""
        # Update the section
        custom_content = {
            "title": "TEST_Custom Review Title",
            "subtitle": "TEST_Custom Subtitle",
            "body_html": "<p>TEST custom body content</p>",
            "footer_html": "<p>TEST custom footer</p>",
            "checkbox_text": "I agree to TEST custom terms",
            "error_text": "Please agree to TEST terms",
            "continue_label": "TEST Proceed",
            "disclosure_link_text": "Read TEST disclosure"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/docflow/content-config/review_continue",
            headers=auth_headers,
            json={"content": custom_content}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_default") is False
        assert data.get("content", {}).get("title") == "TEST_Custom Review Title"
        
        # Verify persistence with GET
        get_response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/review_continue",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        
        get_data = get_response.json()
        assert get_data.get("is_default") is False
        assert get_data.get("content", {}).get("title") == "TEST_Custom Review Title"

    def test_put_invalid_section_type_returns_400(self, auth_headers):
        """PUT with invalid section type returns 400."""
        response = requests.put(
            f"{BASE_URL}/api/docflow/content-config/invalid_type",
            headers=auth_headers,
            json={"content": {"title": "Test"}}
        )
        assert response.status_code == 400

    def test_put_empty_content_returns_400(self, auth_headers):
        """PUT with empty content object returns 400."""
        response = requests.put(
            f"{BASE_URL}/api/docflow/content-config/review_continue",
            headers=auth_headers,
            json={"content": {}}
        )
        assert response.status_code == 400


class TestResetContentConfig:
    """Tests for POST /api/docflow/content-config/{section_type}/reset"""

    def test_reset_without_auth_returns_403(self):
        """POST reset without auth returns 403."""
        response = requests.post(
            f"{BASE_URL}/api/docflow/content-config/review_continue/reset"
        )
        assert response.status_code == 403

    def test_reset_restores_default_content(self, auth_headers):
        """POST reset deletes customization; GET returns is_default=True."""
        # First ensure there's a customization
        requests.put(
            f"{BASE_URL}/api/docflow/content-config/review_continue",
            headers=auth_headers,
            json={"content": {"title": "Temp Custom Title"}}
        )
        
        # Reset
        response = requests.post(
            f"{BASE_URL}/api/docflow/content-config/review_continue/reset",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("is_default") is True
        assert data.get("content", {}).get("title") == "Review and Continue"
        
        # Verify with GET
        get_response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/review_continue",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        assert get_response.json().get("is_default") is True

    def test_reset_invalid_section_type_returns_400(self, auth_headers):
        """POST reset with invalid section type returns 400."""
        response = requests.post(
            f"{BASE_URL}/api/docflow/content-config/invalid_type/reset",
            headers=auth_headers
        )
        assert response.status_code == 400


class TestContentConfigDefaults:
    """Tests for default content structure and variable placeholders."""

    def test_consent_disclosure_default_has_variable_placeholders(self, auth_headers):
        """Consent disclosure default content contains {{company_name}} etc."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/_defaults/all",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        defaults = response.json().get("defaults", {})
        consent = defaults.get("consent_disclosure", {})
        
        # Check for variable placeholders in content
        sections = consent.get("sections", [])
        assert len(sections) > 0
        
        # At least one section should have {{company_name}}
        all_content = " ".join([s.get("content", "") for s in sections])
        assert "{{company_name}}" in all_content

    def test_review_continue_default_has_variable_placeholders(self, auth_headers):
        """Review continue default content contains {{user_name}} etc."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/_defaults/all",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        defaults = response.json().get("defaults", {})
        review = defaults.get("review_continue", {})
        
        body_html = review.get("body_html", "")
        assert "{{user_name}}" in body_html
        assert "{{company_name}}" in body_html

    def test_sms_disclaimer_default_has_phone_placeholder(self, auth_headers):
        """SMS disclaimer default content contains {{phone}} placeholder."""
        response = requests.get(
            f"{BASE_URL}/api/docflow/content-config/_defaults/all",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        defaults = response.json().get("defaults", {})
        sms = defaults.get("sms_disclaimer", {})
        
        info_box = sms.get("info_box_message", "")
        assert "{{phone}}" in info_box


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
