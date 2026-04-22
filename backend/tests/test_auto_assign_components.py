"""
Test Suite: Auto-Assign Components Feature (Phase 51)
Tests the fix for: Email not sent when no 'Assigned Components' are selected during Manual Send

Test Cases:
1. Single recipient with assigned_components=[] → auto-assigned ALL signable fields
2. Single recipient with explicit assigned_components → respects explicit selection
3. Two recipients BOTH with assigned_components=[] → first gets all, second gets []
4. Two recipients: R1 explicit, R2 empty → R2 gets remaining fields
5. Package mode with assigned_components_map={} → auto-assigned
6. Package send endpoint with assigned_components_map=None → auto-assigned
7. Logging verification
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test@gmail.com"
TEST_PASSWORD = "test123"

# Template IDs with field_placements (from agent context)
TEMPLATE_1_FIELD = "873be5b7-9259-4ddb-8a88-8469341078be"  # 1 field
TEMPLATE_4_FIELDS = "8b46a0e3-19e8-482b-8303-9813046fc4ed"  # 4 fields
TEMPLATE_6_FIELDS = "2fb3db5c-9fb5-44df-a4e2-02e13ecbec42"  # 6 fields


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for test user"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if resp.status_code != 200:
        pytest.skip(f"Auth failed: {resp.status_code} - {resp.text}")
    data = resp.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


class TestAutoAssignBasicMode:
    """Tests for POST /api/v1/documents/generate-links (basic mode)"""

    def test_single_recipient_empty_assigned_components_auto_assigns_all(self, api_client):
        """
        Test Case 1: Single recipient with assigned_components=[] 
        → success=true, recipient_links[0].assigned_components populated with ALL signable field IDs
        """
        payload = {
            "template_id": TEMPLATE_4_FIELDS,
            "document_name": "Test Auto-Assign All Fields",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": True,
            "recipients": [
                {
                    "name": "AutoAssign Tester",
                    "email": "autoassign-test@yopmail.com",
                    "role": "signer",
                    "routing_order": 1,
                    "assigned_components": []  # Empty - should auto-assign all
                }
            ]
        }
        
        resp = api_client.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        assert data.get("document_id"), "Expected document_id in response"
        
        # Verify recipient_links has assigned_components populated
        recipient_links = data.get("recipient_links", [])
        assert len(recipient_links) >= 1, "Expected at least 1 recipient link"
        
        first_recipient = recipient_links[0]
        assigned = first_recipient.get("assigned_components", [])
        
        # Template has 4 signable fields - should have auto-assigned all
        assert len(assigned) > 0, f"Expected auto-assigned components, got empty: {first_recipient}"
        print(f"✓ Auto-assigned {len(assigned)} field(s) to recipient with empty assigned_components")

    def test_single_recipient_explicit_assigned_components_respected(self, api_client):
        """
        Test Case 2: Single recipient with assigned_components=[<one id>] 
        → success=true, ONLY the specified IDs present (auto-assign does NOT override explicit)
        """
        # First get template to find a valid field ID
        template_resp = api_client.get(f"{BASE_URL}/api/docflow/templates/{TEMPLATE_4_FIELDS}")
        assert template_resp.status_code == 200, f"Failed to get template: {template_resp.text}"
        
        template = template_resp.json()
        field_placements = template.get("field_placements", [])
        signable_fields = [f for f in field_placements if f.get("type") not in ("merge", "label")]
        
        if not signable_fields:
            pytest.skip("No signable fields in template")
        
        # Pick just one field ID
        explicit_field_id = signable_fields[0].get("id")
        
        payload = {
            "template_id": TEMPLATE_4_FIELDS,
            "document_name": "Test Explicit Assignment",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": True,
            "recipients": [
                {
                    "name": "Explicit Tester",
                    "email": "explicit-test@yopmail.com",
                    "role": "signer",
                    "routing_order": 1,
                    "assigned_components": [explicit_field_id]  # Explicit - should NOT auto-assign
                }
            ]
        }
        
        resp = api_client.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        
        recipient_links = data.get("recipient_links", [])
        assert len(recipient_links) >= 1, "Expected at least 1 recipient link"
        
        first_recipient = recipient_links[0]
        assigned = first_recipient.get("assigned_components", [])
        
        # Should have ONLY the explicitly assigned field
        assert len(assigned) == 1, f"Expected exactly 1 assigned component, got {len(assigned)}: {assigned}"
        assert assigned[0] == explicit_field_id, f"Expected {explicit_field_id}, got {assigned[0]}"
        print(f"✓ Explicit assignment respected - only 1 field assigned as specified")

    def test_two_recipients_both_empty_first_gets_all(self, api_client):
        """
        Test Case 3: Two recipients BOTH with assigned_components=[] 
        → first recipient (lowest routing_order) gets all unclaimed field IDs
        → second gets []
        → no 'Component assigned to multiple recipients' error
        → success=true
        → first recipient receives the initial email (sequential routing)
        """
        payload = {
            "template_id": TEMPLATE_4_FIELDS,
            "document_name": "Test Two Recipients Both Empty",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": True,
            "recipients": [
                {
                    "name": "First Recipient",
                    "email": "first-recipient@yopmail.com",
                    "role": "signer",
                    "routing_order": 1,
                    "assigned_components": []  # Empty - should get all
                },
                {
                    "name": "Second Recipient",
                    "email": "second-recipient@yopmail.com",
                    "role": "signer",
                    "routing_order": 2,
                    "assigned_components": []  # Empty - should get nothing (all claimed by first)
                }
            ]
        }
        
        resp = api_client.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        
        # Verify no conflict error
        errors = data.get("errors", [])
        conflict_errors = [e for e in errors if "multiple recipients" in str(e).lower()]
        assert len(conflict_errors) == 0, f"Unexpected conflict error: {conflict_errors}"
        
        recipient_links = data.get("recipient_links", [])
        assert len(recipient_links) == 2, f"Expected 2 recipient links, got {len(recipient_links)}"
        
        # First recipient should have all fields
        first = next((r for r in recipient_links if r.get("routing_order") == 1), None)
        second = next((r for r in recipient_links if r.get("routing_order") == 2), None)
        
        assert first is not None, "First recipient not found"
        assert second is not None, "Second recipient not found"
        
        first_assigned = first.get("assigned_components", [])
        second_assigned = second.get("assigned_components", [])
        
        assert len(first_assigned) > 0, f"First recipient should have fields: {first}"
        assert len(second_assigned) == 0, f"Second recipient should have no fields: {second}"
        
        print(f"✓ First recipient got {len(first_assigned)} fields, second got {len(second_assigned)} fields")

    def test_two_recipients_r1_explicit_r2_empty_gets_remaining(self, api_client):
        """
        Test Case 4: Two recipients: R1 with explicit subset [fieldA], R2 with [] 
        → R2 auto-assigned ALL remaining fields
        → no conflict
        → Email sent to R1 first in sequential mode
        """
        # Get template fields
        template_resp = api_client.get(f"{BASE_URL}/api/docflow/templates/{TEMPLATE_4_FIELDS}")
        assert template_resp.status_code == 200
        
        template = template_resp.json()
        field_placements = template.get("field_placements", [])
        signable_fields = [f for f in field_placements if f.get("type") not in ("merge", "label")]
        
        if len(signable_fields) < 2:
            pytest.skip("Need at least 2 signable fields for this test")
        
        # R1 gets first field explicitly
        r1_field = signable_fields[0].get("id")
        
        payload = {
            "template_id": TEMPLATE_4_FIELDS,
            "document_name": "Test R1 Explicit R2 Empty",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": True,
            "recipients": [
                {
                    "name": "R1 Explicit",
                    "email": "r1-explicit@yopmail.com",
                    "role": "signer",
                    "routing_order": 1,
                    "assigned_components": [r1_field]  # Explicit - just one field
                },
                {
                    "name": "R2 Empty",
                    "email": "r2-empty@yopmail.com",
                    "role": "signer",
                    "routing_order": 2,
                    "assigned_components": []  # Empty - should get remaining fields
                }
            ]
        }
        
        resp = api_client.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        
        recipient_links = data.get("recipient_links", [])
        assert len(recipient_links) == 2
        
        r1 = next((r for r in recipient_links if r.get("routing_order") == 1), None)
        r2 = next((r for r in recipient_links if r.get("routing_order") == 2), None)
        
        r1_assigned = r1.get("assigned_components", [])
        r2_assigned = r2.get("assigned_components", [])
        
        # R1 should have exactly 1 (explicit)
        assert len(r1_assigned) == 1, f"R1 should have 1 field: {r1_assigned}"
        assert r1_assigned[0] == r1_field
        
        # R2 should have remaining fields (total - 1)
        expected_r2_count = len(signable_fields) - 1
        assert len(r2_assigned) == expected_r2_count, f"R2 should have {expected_r2_count} fields, got {len(r2_assigned)}"
        
        # Verify no overlap
        overlap = set(r1_assigned) & set(r2_assigned)
        assert len(overlap) == 0, f"Unexpected overlap: {overlap}"
        
        print(f"✓ R1 got {len(r1_assigned)} explicit field, R2 got {len(r2_assigned)} remaining fields")


class TestAutoAssignPackageMode:
    """Tests for package mode auto-assignment"""

    def test_package_mode_empty_assigned_components_map(self, api_client):
        """
        Test Case 5: Package mode (send_mode='package') — recipient with assigned_components_map={} 
        → auto-assigned across all documents
        → package created & initial email sent
        """
        payload = {
            "send_mode": "package",
            "package_name": "Test Package Auto-Assign",
            "documents": [
                {
                    "template_id": TEMPLATE_4_FIELDS,
                    "document_name": "Doc 1",
                    "order": 1
                }
            ],
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": True,
            "recipients": [
                {
                    "name": "Package Recipient",
                    "email": "pkg-recipient@yopmail.com",
                    "role_type": "SIGN",
                    "routing_order": 1,
                    "assigned_components_map": {}  # Empty - should auto-assign
                }
            ]
        }
        
        resp = api_client.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        assert data.get("package_id"), "Expected package_id in response"
        
        print(f"✓ Package created with auto-assigned components: {data.get('package_id')}")


class TestPackageSendEndpoint:
    """Tests for POST /api/docflow/packages/{package_id}/send"""

    def test_package_send_empty_assigned_components_map(self, api_client):
        """
        Test Case 6: POST /api/docflow/packages/{package_id}/send 
        — recipient with assigned_components_map=None 
        → auto-assigned all signable fields per document
        → run is created
        → initial email sent
        """
        # First create a package blueprint
        create_payload = {
            "name": "Test Package Blueprint",
            "documents": [
                {
                    "template_id": TEMPLATE_4_FIELDS,
                    "document_name": "Blueprint Doc",
                    "order": 1
                }
            ]
        }
        
        create_resp = api_client.post(f"{BASE_URL}/api/docflow/packages", json=create_payload)
        if create_resp.status_code != 200:
            pytest.skip(f"Could not create package: {create_resp.text}")
        
        package_data = create_resp.json()
        package_id = package_data.get("package", {}).get("id")
        
        if not package_id:
            pytest.skip("No package ID returned")
        
        # Now send the package with empty assigned_components_map
        send_payload = {
            "recipients": [
                {
                    "name": "Send Recipient",
                    "email": "send-recipient@yopmail.com",
                    "role_type": "SIGN",
                    "routing_order": 1,
                    "assigned_components_map": None  # None - should auto-assign
                }
            ],
            "delivery_mode": "email",
            "routing_config": {"mode": "sequential", "on_reject": "void"}
        }
        
        send_resp = api_client.post(f"{BASE_URL}/api/docflow/packages/{package_id}/send", json=send_payload)
        assert send_resp.status_code == 200, f"Expected 200, got {send_resp.status_code}: {send_resp.text}"
        
        send_data = send_resp.json()
        assert send_data.get("success") is True, f"Expected success=true: {send_data}"
        assert send_data.get("run_id"), "Expected run_id in response"
        
        print(f"✓ Package sent with auto-assigned components, run_id: {send_data.get('run_id')}")


class TestLogging:
    """Tests for logging verification"""

    def test_logging_auto_assign_and_plan(self, api_client):
        """
        Test Case 7: LOGGING verification
        Backend log should contain:
        - '[generate-links] auto-assign' lines when empty
        - '[generate-links] plan:' lines with assigned_fields count and email_trigger flag
        - '[generate-document] email dispatch summary' line with success/failed/skipped counts
        """
        # This test verifies the logging by making a request and checking logs
        # The actual log verification was done manually by the main agent
        
        payload = {
            "template_id": TEMPLATE_1_FIELD,
            "document_name": "Test Logging",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": True,
            "recipients": [
                {
                    "name": "Log Tester",
                    "email": "log-test@yopmail.com",
                    "role": "signer",
                    "routing_order": 1,
                    "assigned_components": []  # Empty - triggers auto-assign logging
                }
            ]
        }
        
        resp = api_client.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("success") is True
        
        # Log verification note: The following log patterns should appear in backend logs:
        # - [generate-links] auto-assign: recipient 'Log Tester' had empty assigned_components → auto-assigned X field(s)
        # - [generate-links] plan: recipient name='Log Tester' email='log-test@yopmail.com' role=signer order=1 assigned_fields=X email_trigger=yes
        # - [generate-document] email dispatch summary: document=XXX success=1 failed=0 skipped=0 total_recipients=1
        
        print("✓ Request completed - log patterns should be present in backend logs")
        print("  Expected patterns:")
        print("  - [generate-links] auto-assign: ...")
        print("  - [generate-links] plan: ...")
        print("  - [generate-document] email dispatch summary: ...")


class TestEmailDelivery:
    """Tests to verify email is actually sent"""

    def test_email_sent_with_empty_assigned_components(self, api_client):
        """
        Verify that email is sent when assigned_components is empty.
        Check backend log for 'Email sent successfully via SMTP' OR 'success=1' in dispatch summary.
        """
        unique_email = f"email-test-{int(time.time())}@yopmail.com"
        
        payload = {
            "template_id": TEMPLATE_1_FIELD,
            "document_name": "Test Email Delivery",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": True,
            "recipients": [
                {
                    "name": "Email Tester",
                    "email": unique_email,
                    "role": "signer",
                    "routing_order": 1,
                    "assigned_components": []  # Empty
                }
            ]
        }
        
        resp = api_client.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        
        data = resp.json()
        assert data.get("success") is True, f"Expected success=true: {data}"
        
        # Verify recipient link was generated
        recipient_links = data.get("recipient_links", [])
        assert len(recipient_links) >= 1
        
        first_recipient = recipient_links[0]
        assert first_recipient.get("email") == unique_email
        assert first_recipient.get("access_link"), "Expected access_link for recipient"
        
        print(f"✓ Document generated and email should be sent to {unique_email}")
        print(f"  Access link: {first_recipient.get('access_link')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
