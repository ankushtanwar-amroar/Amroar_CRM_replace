"""
Phase 81 SMS Mode Endpoint Tests

Tests for:
1. POST /api/public/packages/send - sms_mode validation and happy paths
2. POST /api/v1/documents/generate-links - sms_mode validation and happy paths
3. POST /api/docflow/packages/public/{token}/sms/send-otp - OTP generation (stub mode)
4. POST /api/docflow/packages/public/{token}/sms/verify-otp - OTP verification

Note: Twilio is NOT configured - all SMS endpoints run in stub mode (stubbed:true).
"""

import pytest
import requests
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# Test credentials
TEST_EMAIL = "test@gmail.com"
TEST_PASSWORD = "test123"


class TestPhase81SMSEndpoints:
    """Phase 81 SMS mode endpoint tests."""
    
    jwt_token = None
    api_key = None
    tenant_id = None
    template_id = None
    package_id = None
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get JWT token, API key, and template."""
        if not TestPhase81SMSEndpoints.jwt_token:
            # Login to get JWT token
            login_resp = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
            )
            assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
            data = login_resp.json()
            TestPhase81SMSEndpoints.jwt_token = data.get("access_token") or data.get("token")
            TestPhase81SMSEndpoints.tenant_id = data.get("tenant_id") or data.get("user", {}).get("tenant_id")
            
            # Get or create API key
            headers = {"Authorization": f"Bearer {TestPhase81SMSEndpoints.jwt_token}"}
            
            # List existing API keys
            keys_resp = requests.get(f"{BASE_URL}/api/public/packages/api-keys", headers=headers)
            if keys_resp.status_code == 200:
                keys = keys_resp.json().get("api_keys", [])
                active_keys = [k for k in keys if k.get("is_active")]
                if active_keys:
                    # We need to generate a new key since we can't retrieve the full key
                    pass
            
            # Generate a new API key for testing
            gen_resp = requests.post(
                f"{BASE_URL}/api/public/packages/api-keys/generate",
                headers=headers,
                json={"name": "Phase81 Test Key"}
            )
            if gen_resp.status_code == 200:
                TestPhase81SMSEndpoints.api_key = gen_resp.json().get("api_key")
            
            # Get a template for testing
            templates_resp = requests.get(
                f"{BASE_URL}/api/docflow/templates",
                headers=headers
            )
            if templates_resp.status_code == 200:
                templates = templates_resp.json().get("templates", [])
                if templates:
                    TestPhase81SMSEndpoints.template_id = templates[0].get("id")
    
    # ─────────────────────────────────────────────────────────────────────────
    # 1. POST /api/public/packages/send - SMS Mode Validation Tests
    # ─────────────────────────────────────────────────────────────────────────
    
    def test_01_packages_send_sms_mode_missing_phone_rejected(self):
        """POST /api/public/packages/send with sms_mode=true and missing phone should return 400."""
        if not self.api_key or not self.template_id:
            pytest.skip("API key or template not available")
        
        # First create a package blueprint
        headers = {"Authorization": f"Bearer {self.jwt_token}"}
        create_resp = requests.post(
            f"{BASE_URL}/api/docflow/packages",
            headers=headers,
            json={
                "name": "SMS Test Package",
                "documents": [{"template_id": self.template_id, "document_name": "Test Doc", "order": 1}],
                "recipients": [],
                "routing_config": {"mode": "sequential", "on_reject": "void"},
                "security_settings": {"require_auth": True, "session_timeout_minutes": 15}
            }
        )
        
        if create_resp.status_code not in (200, 201):
            pytest.skip(f"Could not create package: {create_resp.text}")
        
        package_id = create_resp.json().get("id") or create_resp.json().get("package", {}).get("id")
        TestPhase81SMSEndpoints.package_id = package_id
        
        # Now test send with sms_mode=true but missing phone
        api_headers = {"X-API-Key": self.api_key}
        send_resp = requests.post(
            f"{BASE_URL}/api/public/packages/send",
            headers=api_headers,
            json={
                "package_id": package_id,
                "recipients": [
                    {"name": "John Doe", "email": "john@example.com", "role": "signer", "routing_order": 1}
                    # Note: phone is missing
                ],
                "routing_mode": "sequential",
                "delivery_mode": "public_link",
                "sms_mode": True  # SMS mode enabled but no phone
            }
        )
        
        assert send_resp.status_code == 400, f"Expected 400, got {send_resp.status_code}: {send_resp.text}"
        error_data = send_resp.json()
        # Check that error mentions phone requirement
        error_text = str(error_data).lower()
        assert "phone" in error_text, f"Error should mention phone: {error_data}"
        print(f"✓ sms_mode=true with missing phone correctly rejected: {error_data.get('detail', error_data)}")
    
    def test_02_packages_send_sms_mode_false_success(self):
        """POST /api/public/packages/send with sms_mode=false (default) should succeed."""
        if not self.api_key or not self.package_id:
            pytest.skip("API key or package not available")
        
        api_headers = {"X-API-Key": self.api_key}
        send_resp = requests.post(
            f"{BASE_URL}/api/public/packages/send",
            headers=api_headers,
            json={
                "package_id": self.package_id,
                "recipients": [
                    {"name": "Jane Doe", "email": "jane@example.com", "role": "signer", "routing_order": 1}
                ],
                "routing_mode": "sequential",
                "delivery_mode": "public_link",
                "sms_mode": False  # SMS mode disabled
            }
        )
        
        assert send_resp.status_code == 200, f"Expected 200, got {send_resp.status_code}: {send_resp.text}"
        data = send_resp.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        print(f"✓ sms_mode=false send succeeded: run_id={data.get('run_id')}")
    
    def test_03_packages_send_sms_mode_true_with_phones_success(self):
        """POST /api/public/packages/send with sms_mode=true and ALL recipients having phone should succeed."""
        if not self.api_key or not self.package_id:
            pytest.skip("API key or package not available")
        
        api_headers = {"X-API-Key": self.api_key}
        send_resp = requests.post(
            f"{BASE_URL}/api/public/packages/send",
            headers=api_headers,
            json={
                "package_id": self.package_id,
                "recipients": [
                    {
                        "name": "SMS Signer",
                        "email": "sms@example.com",
                        "phone": "+15551234567",  # Phone provided
                        "role": "signer",
                        "routing_order": 1
                    }
                ],
                "routing_mode": "sequential",
                "delivery_mode": "public_link",
                "sms_mode": True  # SMS mode enabled with phone
            }
        )
        
        assert send_resp.status_code == 200, f"Expected 200, got {send_resp.status_code}: {send_resp.text}"
        data = send_resp.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        
        run_id = data.get("run_id")
        print(f"✓ sms_mode=true with phone succeeded: run_id={run_id}")
        
        # Store run_id for OTP tests
        TestPhase81SMSEndpoints.sms_run_id = run_id
        TestPhase81SMSEndpoints.sms_recipient_link = data.get("recipient_links", [{}])[0].get("access_link", "")
    
    # ─────────────────────────────────────────────────────────────────────────
    # 2. POST /api/v1/documents/generate-links - SMS Mode Validation Tests
    # ─────────────────────────────────────────────────────────────────────────
    
    def test_04_generate_links_sms_mode_missing_phone_rejected(self):
        """POST /api/v1/documents/generate-links with sms_mode=true and missing phone should return 400."""
        if not self.jwt_token or not self.template_id:
            pytest.skip("JWT token or template not available")
        
        headers = {"Authorization": f"Bearer {self.jwt_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/v1/documents/generate-links",
            headers=headers,
            json={
                "template_id": self.template_id,
                "document_name": "SMS Test Doc",
                "routing_type": "sequential",
                "delivery_mode": "public_link",
                "recipients": [
                    {"name": "No Phone User", "email": "nophone@example.com", "role": "signer", "routing_order": 1}
                    # Note: phone is missing
                ],
                "sms_mode": True  # SMS mode enabled but no phone
            }
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        error_data = resp.json()
        error_text = str(error_data).lower()
        assert "phone" in error_text, f"Error should mention phone: {error_data}"
        print(f"✓ generate-links sms_mode=true with missing phone correctly rejected")
    
    def test_05_generate_links_sms_mode_true_with_phones_success(self):
        """POST /api/v1/documents/generate-links with sms_mode=true and all phones should succeed."""
        if not self.jwt_token or not self.template_id:
            pytest.skip("JWT token or template not available")
        
        headers = {"Authorization": f"Bearer {self.jwt_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/v1/documents/generate-links",
            headers=headers,
            json={
                "template_id": self.template_id,
                "document_name": "SMS Test Doc Success",
                "routing_type": "sequential",
                "delivery_mode": "public_link",
                "recipients": [
                    {
                        "name": "Phone User",
                        "email": "phone@example.com",
                        "phone": "+15559876543",  # Phone provided
                        "role": "signer",
                        "routing_order": 1
                    }
                ],
                "sms_mode": True  # SMS mode enabled with phone
            }
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        
        doc_id = data.get("document_id")
        print(f"✓ generate-links sms_mode=true with phone succeeded: document_id={doc_id}")
        
        # Store for later verification
        TestPhase81SMSEndpoints.sms_doc_id = doc_id
        TestPhase81SMSEndpoints.sms_doc_link = data.get("public_link", "")
    
    def test_06_generate_links_sms_mode_false_success(self):
        """POST /api/v1/documents/generate-links with sms_mode=false should succeed (baseline)."""
        if not self.jwt_token or not self.template_id:
            pytest.skip("JWT token or template not available")
        
        headers = {"Authorization": f"Bearer {self.jwt_token}"}
        resp = requests.post(
            f"{BASE_URL}/api/v1/documents/generate-links",
            headers=headers,
            json={
                "template_id": self.template_id,
                "document_name": "No SMS Doc",
                "routing_type": "sequential",
                "delivery_mode": "public_link",
                "recipients": [
                    {"name": "Regular User", "email": "regular@example.com", "role": "signer", "routing_order": 1}
                ],
                "sms_mode": False  # SMS mode disabled (default)
            }
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        print(f"✓ generate-links sms_mode=false succeeded (baseline)")
    
    # ─────────────────────────────────────────────────────────────────────────
    # 3. Package SMS OTP Endpoints Tests
    # ─────────────────────────────────────────────────────────────────────────
    
    def test_07_package_sms_send_otp_stub_mode(self):
        """POST /api/docflow/packages/public/{token}/sms/send-otp should return stubbed:true."""
        # We need a package run with sms_mode=true and a recipient token
        # First, let's get the token from the run we created in test_03
        if not hasattr(TestPhase81SMSEndpoints, 'sms_run_id'):
            pytest.skip("No SMS run available from previous test")
        
        # Get the recipient token from DB
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import load_dotenv
        load_dotenv()
        
        async def get_token():
            client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
            db = client['crm_database']
            run = await db.docflow_packages.find_one(
                {"id": TestPhase81SMSEndpoints.sms_run_id, "_type": "run"},
                {"_id": 0, "recipients": 1}
            )
            client.close()
            if run and run.get("recipients"):
                return run["recipients"][0].get("public_token")
            return None
        
        token = asyncio.get_event_loop().run_until_complete(get_token())
        if not token:
            pytest.skip("Could not get recipient token")
        
        TestPhase81SMSEndpoints.sms_recipient_token = token
        
        # Call send-otp endpoint
        resp = requests.post(f"{BASE_URL}/api/docflow/packages/public/{token}/sms/send-otp")
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        assert data.get("stubbed") == True, f"Expected stubbed=True (Twilio not configured): {data}"
        print(f"✓ send-otp returned stubbed:true as expected")
    
    def test_08_package_sms_verify_otp_wrong_code(self):
        """POST /api/docflow/packages/public/{token}/sms/verify-otp with wrong OTP should return 400."""
        if not hasattr(TestPhase81SMSEndpoints, 'sms_recipient_token'):
            pytest.skip("No recipient token available")
        
        token = TestPhase81SMSEndpoints.sms_recipient_token
        
        # Try to verify with wrong code
        resp = requests.post(
            f"{BASE_URL}/api/docflow/packages/public/{token}/sms/verify-otp",
            json={"code": "000000"}  # Wrong code
        )
        
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        data = resp.json()
        error_text = str(data.get("detail", "")).lower()
        assert "incorrect" in error_text or "invalid" in error_text, f"Error should mention incorrect code: {data}"
        print(f"✓ verify-otp with wrong code correctly rejected: {data.get('detail')}")
    
    def test_09_package_sms_verify_otp_correct_code(self):
        """POST /api/docflow/packages/public/{token}/sms/verify-otp with correct OTP should succeed."""
        if not hasattr(TestPhase81SMSEndpoints, 'sms_recipient_token'):
            pytest.skip("No recipient token available")
        
        token = TestPhase81SMSEndpoints.sms_recipient_token
        
        # Get the OTP from DB (since we're in stub mode, it's stored there)
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import load_dotenv
        load_dotenv()
        
        async def get_otp():
            client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
            db = client['crm_database']
            run = await db.docflow_packages.find_one(
                {"id": TestPhase81SMSEndpoints.sms_run_id, "_type": "run"},
                {"_id": 0, "recipients": 1}
            )
            client.close()
            if run and run.get("recipients"):
                for r in run["recipients"]:
                    if r.get("public_token") == token:
                        return r.get("sms_otp")
            return None
        
        otp = asyncio.get_event_loop().run_until_complete(get_otp())
        if not otp:
            pytest.skip("Could not get OTP from DB")
        
        # Verify with correct code
        resp = requests.post(
            f"{BASE_URL}/api/docflow/packages/public/{token}/sms/verify-otp",
            json={"code": otp}
        )
        
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True, f"Expected success=True: {data}"
        print(f"✓ verify-otp with correct code succeeded")
        
        # Verify that recipient is now marked as sms_verified
        async def check_verified():
            client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
            db = client['crm_database']
            run = await db.docflow_packages.find_one(
                {"id": TestPhase81SMSEndpoints.sms_run_id, "_type": "run"},
                {"_id": 0, "recipients": 1}
            )
            client.close()
            if run and run.get("recipients"):
                for r in run["recipients"]:
                    if r.get("public_token") == token:
                        return r.get("sms_verified", False)
            return False
        
        is_verified = asyncio.get_event_loop().run_until_complete(check_verified())
        assert is_verified == True, "Recipient should be marked as sms_verified=true"
        print(f"✓ Recipient sms_verified=true confirmed in DB")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
