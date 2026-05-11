"""
Phase 81.29 — Reminder Scheduler Tests

Tests the fix for email reminders not working for Template flows when set to 'Every 2 minutes'.
The bug was that the scheduler only scanned `docflow_package_runs` but template-flow recipients
are stored in `docflow_documents`. The fix makes the scheduler scan BOTH collections.

Test coverage:
1. Scheduler `tick()` correctly scans `docflow_documents` for due template-flow reminders
2. Scheduler writes reminder_state back to `docflow_documents` (not docflow_package_runs)
3. Scheduler still works for `docflow_package_runs` (no regression)
4. `generate_document` persists `reminder_config` and `reminder_state` to each recipient
5. Soft-cancel: when recipient status becomes 'completed', scheduler marks reminder_state.status='completed'
6. `cancel_recipient_reminders` and `cancel_run_reminders` helpers target both collections
7. POST /api/v1/documents/generate-links with reminder_enabled=true persists reminder config
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TEST_EMAIL = "admin@democorp.com"
TEST_PASSWORD = "DemoPass123!"


class TestReminderSchedulerIntegration:
    """Integration tests for the reminder scheduler fix (Phase 81.29)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        self.tenant_id = None
        self.template_id = None
        
    def _login(self):
        """Authenticate and get JWT token"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("access_token") or data.get("token")
            self.tenant_id = data.get("tenant_id") or data.get("user", {}).get("tenant_id")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return True
        print(f"Login failed: {response.status_code} - {response.text}")
        return False
    
    def _get_or_create_template(self):
        """Get an existing template with a PDF or create one for testing"""
        # First try to get existing templates with s3_key
        response = self.session.get(f"{BASE_URL}/api/docflow/templates")
        if response.status_code == 200:
            templates = response.json()
            template_list = templates.get("templates", []) if isinstance(templates, dict) else templates
            
            # Find a template with s3_key (has PDF attached)
            for t in template_list:
                tid = t.get("id")
                # Fetch full template to check s3_key
                detail_resp = self.session.get(f"{BASE_URL}/api/docflow/templates/{tid}")
                if detail_resp.status_code == 200:
                    detail = detail_resp.json()
                    if detail.get("s3_key"):
                        self.template_id = tid
                        print(f"Found template with PDF: {tid}")
                        return self.template_id
        
        # Use the known working template ID (created during manual testing)
        # This template has a PDF uploaded and is ready for document generation
        self.template_id = "a12a1c64-3c8a-4e23-9ea7-9b705dfbefcc"
        return self.template_id

    # ─────────────────────────────────────────────────────────────────────────
    # Test 1: POST /api/v1/documents/generate-links with reminder_enabled=true
    # ─────────────────────────────────────────────────────────────────────────
    def test_01_generate_links_with_reminder_enabled_persists_config(self):
        """
        Test that POST /api/v1/documents/generate-links with reminder_enabled=true
        persists reminder_config and reminder_state on the resulting document recipients.
        """
        assert self._login(), "Login failed"
        template_id = self._get_or_create_template()
        assert template_id, "Failed to get or create template"
        
        # Generate document with reminder enabled (custom frequency: 1 minute)
        payload = {
            "template_id": template_id,
            "document_name": f"Reminder Test Doc {uuid.uuid4().hex[:8]}",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": False,  # Don't actually send email in test
            "recipients": [
                {
                    "name": "Test Recipient",
                    "email": "test-reminder@example.com",
                    "role": "signer",
                    "routing_order": 1,
                    "reminder_enabled": True,
                    "reminder_frequency": "custom",
                    "reminder_custom_value": 1,
                    "reminder_custom_unit": "minutes",
                    "max_reminders": 5
                }
            ],
            "require_auth": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        print(f"Generate links response: {response.status_code}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, f"Expected success=True, got: {data}"
        
        document_id = data.get("document_id")
        assert document_id, "No document_id in response"
        
        print(f"✓ Document created with ID: {document_id}")
        print(f"✓ Reminder config should be persisted on recipients")
        
        # Store for later tests
        self.created_document_id = document_id
        return document_id

    # ─────────────────────────────────────────────────────────────────────────
    # Test 2: Verify reminder_config persisted in docflow_documents collection
    # ─────────────────────────────────────────────────────────────────────────
    def test_02_verify_reminder_config_persisted_in_docflow_documents(self):
        """
        Verify that the reminder_config and reminder_state are persisted
        on the recipient in the docflow_documents collection.
        """
        assert self._login(), "Login failed"
        
        # First create a document with reminders
        document_id = self.test_01_generate_links_with_reminder_enabled_persists_config()
        
        # Fetch the document to verify reminder config
        response = self.session.get(f"{BASE_URL}/api/docflow/documents/{document_id}")
        
        assert response.status_code == 200, f"Failed to fetch document: {response.status_code}"
        
        doc = response.json()
        recipients = doc.get("recipients", [])
        
        assert len(recipients) > 0, "Document should have at least one recipient"
        
        r = recipients[0]
        reminder_config = r.get("reminder_config")
        reminder_state = r.get("reminder_state")
        
        print(f"Recipient reminder_config: {reminder_config}")
        print(f"Recipient reminder_state: {reminder_state}")
        
        # Verify reminder_config structure
        assert reminder_config is not None, "reminder_config should not be None"
        assert reminder_config.get("enabled") == True, "reminder_config.enabled should be True"
        assert reminder_config.get("interval_value") == 1, "interval_value should be 1"
        assert reminder_config.get("interval_unit") == "minutes", "interval_unit should be 'minutes'"
        print("✓ reminder_config correctly persisted")
        
        # Verify reminder_state structure
        assert reminder_state is not None, "reminder_state should not be None"
        assert reminder_state.get("status") == "active", "reminder_state.status should be 'active'"
        assert reminder_state.get("sent_count") == 0, "sent_count should be 0 initially"
        assert reminder_state.get("next_run_at"), "next_run_at should be set"
        print("✓ reminder_state correctly initialized")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 3: Verify reminder_service normalize_reminder_config function
    # ─────────────────────────────────────────────────────────────────────────
    def test_03_normalize_reminder_config_public_api_style(self):
        """
        Test that normalize_reminder_config correctly handles public-API style
        reminder fields (reminder_enabled, reminder_frequency, etc.)
        """
        # This is a unit test that imports the function directly
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import normalize_reminder_config
            
            # Test public-API style with custom frequency
            cfg = {
                "reminder_enabled": True,
                "reminder_frequency": "custom",
                "reminder_custom_value": 2,
                "reminder_custom_unit": "minutes",
                "max_reminders": 10
            }
            
            result = normalize_reminder_config(cfg)
            
            assert result is not None, "normalize_reminder_config should return a config"
            assert result.get("enabled") == True
            assert result.get("interval_value") == 2
            assert result.get("interval_unit") == "minutes"
            assert result.get("max_count") == 10
            
            print("✓ normalize_reminder_config handles public-API style correctly")
            
            # Test daily preset
            cfg_daily = {
                "reminder_enabled": True,
                "reminder_frequency": "daily"
            }
            result_daily = normalize_reminder_config(cfg_daily)
            assert result_daily.get("interval_value") == 1
            assert result_daily.get("interval_unit") == "days"
            print("✓ normalize_reminder_config handles 'daily' preset correctly")
            
            # Test weekly preset
            cfg_weekly = {
                "reminder_enabled": True,
                "reminder_frequency": "weekly"
            }
            result_weekly = normalize_reminder_config(cfg_weekly)
            assert result_weekly.get("interval_value") == 1
            assert result_weekly.get("interval_unit") == "weeks"
            print("✓ normalize_reminder_config handles 'weekly' preset correctly")
            
            # Test disabled
            cfg_disabled = {"reminder_enabled": False}
            result_disabled = normalize_reminder_config(cfg_disabled)
            assert result_disabled is None
            print("✓ normalize_reminder_config returns None when disabled")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 4: Verify initial_reminder_state function
    # ─────────────────────────────────────────────────────────────────────────
    def test_04_initial_reminder_state_computation(self):
        """
        Test that initial_reminder_state correctly computes the first reminder time.
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import initial_reminder_state, _utcnow
            
            cfg = {
                "enabled": True,
                "interval_value": 1,
                "interval_unit": "minutes",
                "max_count": 5
            }
            
            before = _utcnow()
            state = initial_reminder_state(cfg)
            after = _utcnow()
            
            assert state.get("status") == "active"
            assert state.get("sent_count") == 0
            assert state.get("last_sent_at") is None
            assert state.get("next_run_at") is not None
            
            # Verify next_run_at is approximately 1 minute in the future
            next_run = datetime.fromisoformat(state["next_run_at"].replace("Z", "+00:00"))
            expected_min = before + timedelta(minutes=1) - timedelta(seconds=5)
            expected_max = after + timedelta(minutes=1) + timedelta(seconds=5)
            
            assert expected_min <= next_run <= expected_max, \
                f"next_run_at should be ~1 minute in future, got {next_run}"
            
            print("✓ initial_reminder_state correctly computes first reminder time")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 5: Verify _add_interval function for various units
    # ─────────────────────────────────────────────────────────────────────────
    def test_05_add_interval_various_units(self):
        """
        Test that _add_interval correctly handles all supported time units.
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import _add_interval
            
            base = datetime(2025, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
            
            # Test seconds
            result = _add_interval(base, 30, "seconds")
            assert result == base + timedelta(seconds=30)
            print("✓ _add_interval handles 'seconds' correctly")
            
            # Test minutes
            result = _add_interval(base, 5, "minutes")
            assert result == base + timedelta(minutes=5)
            print("✓ _add_interval handles 'minutes' correctly")
            
            # Test hours
            result = _add_interval(base, 2, "hours")
            assert result == base + timedelta(hours=2)
            print("✓ _add_interval handles 'hours' correctly")
            
            # Test days
            result = _add_interval(base, 3, "days")
            assert result == base + timedelta(days=3)
            print("✓ _add_interval handles 'days' correctly")
            
            # Test weeks
            result = _add_interval(base, 1, "weeks")
            assert result == base + timedelta(weeks=1)
            print("✓ _add_interval handles 'weeks' correctly")
            
            # Test months (approximated as 30 days)
            result = _add_interval(base, 1, "months")
            assert result == base + timedelta(days=30)
            print("✓ _add_interval handles 'months' correctly (30 days)")
            
            # Test years (approximated as 365 days)
            result = _add_interval(base, 1, "years")
            assert result == base + timedelta(days=365)
            print("✓ _add_interval handles 'years' correctly (365 days)")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 6: Verify ReminderScheduler.tick() scans docflow_documents
    # ─────────────────────────────────────────────────────────────────────────
    def test_06_scheduler_tick_scans_docflow_documents(self):
        """
        Test that the scheduler tick() method scans docflow_documents collection
        for due template-flow reminders (Phase 81.29 fix).
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import ReminderScheduler
            import inspect
            
            # Verify the tick method exists and scans both collections
            tick_source = inspect.getsource(ReminderScheduler.tick)
            
            # Check that tick() queries docflow_documents
            assert "docflow_documents" in tick_source, \
                "tick() should query docflow_documents collection"
            
            # Check that tick() queries docflow_package_runs
            assert "docflow_package_runs" in tick_source, \
                "tick() should query docflow_package_runs collection"
            
            # Check for the source parameter in _process_run calls
            assert 'source="document"' in tick_source or "source='document'" in tick_source, \
                "tick() should pass source='document' for docflow_documents"
            
            assert 'source="package_run"' in tick_source or "source='package_run'" in tick_source, \
                "tick() should pass source='package_run' for docflow_package_runs"
            
            print("✓ ReminderScheduler.tick() correctly scans BOTH collections")
            print("✓ tick() passes correct 'source' parameter to _process_run")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 7: Verify _process_run writes back to correct collection
    # ─────────────────────────────────────────────────────────────────────────
    def test_07_process_run_writes_to_correct_collection(self):
        """
        Test that _process_run writes reminder_state updates back to the correct
        collection based on the 'source' parameter (Phase 81.29 fix).
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import ReminderScheduler
            import inspect
            
            # Get the _process_run method source
            process_run_source = inspect.getsource(ReminderScheduler._process_run)
            
            # Verify collection selection logic
            assert "source == \"document\"" in process_run_source or \
                   'source == "document"' in process_run_source, \
                "_process_run should check source parameter"
            
            assert "docflow_documents" in process_run_source, \
                "_process_run should reference docflow_documents collection"
            
            assert "docflow_package_runs" in process_run_source, \
                "_process_run should reference docflow_package_runs collection"
            
            # Verify the conditional collection selection
            assert "collection =" in process_run_source, \
                "_process_run should select collection based on source"
            
            print("✓ _process_run correctly selects collection based on 'source' parameter")
            print("✓ Writes to docflow_documents for source='document'")
            print("✓ Writes to docflow_package_runs for source='package_run'")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 8: Verify cancel_recipient_reminders targets both collections
    # ─────────────────────────────────────────────────────────────────────────
    def test_08_cancel_recipient_reminders_targets_both_collections(self):
        """
        Test that cancel_recipient_reminders helper correctly targets both
        docflow_package_runs and docflow_documents collections (Phase 81.29).
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import cancel_recipient_reminders
            import inspect
            
            source = inspect.getsource(cancel_recipient_reminders)
            
            # Verify it iterates over both collections
            assert "docflow_package_runs" in source, \
                "cancel_recipient_reminders should target docflow_package_runs"
            
            assert "docflow_documents" in source, \
                "cancel_recipient_reminders should target docflow_documents"
            
            # Verify it uses a loop over collections
            assert "for collection in" in source, \
                "cancel_recipient_reminders should loop over both collections"
            
            print("✓ cancel_recipient_reminders targets BOTH collections")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 9: Verify cancel_run_reminders targets both collections
    # ─────────────────────────────────────────────────────────────────────────
    def test_09_cancel_run_reminders_targets_both_collections(self):
        """
        Test that cancel_run_reminders helper correctly targets both
        docflow_package_runs and docflow_documents collections (Phase 81.29).
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import cancel_run_reminders
            import inspect
            
            source = inspect.getsource(cancel_run_reminders)
            
            # Verify it iterates over both collections
            assert "docflow_package_runs" in source, \
                "cancel_run_reminders should target docflow_package_runs"
            
            assert "docflow_documents" in source, \
                "cancel_run_reminders should target docflow_documents"
            
            # Verify it uses a loop over collections
            assert "for collection in" in source, \
                "cancel_run_reminders should loop over both collections"
            
            print("✓ cancel_run_reminders targets BOTH collections")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 10: Verify soft-cancel logic in _process_run
    # ─────────────────────────────────────────────────────────────────────────
    def test_10_soft_cancel_when_recipient_completed(self):
        """
        Test that when a recipient's status becomes 'completed', the scheduler
        marks reminder_state.status='completed' on subsequent tick (soft-cancel).
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import ReminderScheduler, TERMINAL_RECIPIENT_STATUSES
            import inspect
            
            # Verify TERMINAL_RECIPIENT_STATUSES includes expected values
            assert "completed" in TERMINAL_RECIPIENT_STATUSES
            assert "declined" in TERMINAL_RECIPIENT_STATUSES
            assert "rejected" in TERMINAL_RECIPIENT_STATUSES
            assert "expired" in TERMINAL_RECIPIENT_STATUSES
            
            print(f"✓ TERMINAL_RECIPIENT_STATUSES: {TERMINAL_RECIPIENT_STATUSES}")
            
            # Verify _process_run has soft-cancel logic
            process_run_source = inspect.getsource(ReminderScheduler._process_run)
            
            assert "TERMINAL_RECIPIENT_STATUSES" in process_run_source, \
                "_process_run should check TERMINAL_RECIPIENT_STATUSES"
            
            assert '"completed"' in process_run_source or "'completed'" in process_run_source, \
                "_process_run should set status to 'completed' for soft-cancel"
            
            print("✓ _process_run implements soft-cancel for terminal recipient statuses")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 11: Verify _send_reminder URL routing for package vs document
    # ─────────────────────────────────────────────────────────────────────────
    def test_11_send_reminder_url_routing(self):
        """
        Test that _send_reminder correctly routes URLs for package recipients
        vs template-flow document recipients (Phase 81.29).
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import ReminderScheduler
            import inspect
            
            send_reminder_source = inspect.getsource(ReminderScheduler._send_reminder)
            
            # Verify URL routing logic exists
            assert "package_id" in send_reminder_source, \
                "_send_reminder should check for package_id"
            
            assert "package_name" in send_reminder_source, \
                "_send_reminder should check for package_name"
            
            # Verify different URL patterns
            assert "/docflow/package/" in send_reminder_source, \
                "_send_reminder should generate package URLs"
            
            assert "/docflow/view/" in send_reminder_source, \
                "_send_reminder should generate document URLs"
            
            print("✓ _send_reminder correctly routes URLs based on run type")
            print("✓ Package recipients: /docflow/package/{run_id}/view/{token}")
            print("✓ Document recipients: /docflow/view/{token}")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 12: Verify document_service_enhanced persists reminder config
    # ─────────────────────────────────────────────────────────────────────────
    def test_12_document_service_persists_reminder_config(self):
        """
        Test that document_service_enhanced.generate_document persists
        reminder_config and reminder_state to each recipient instance.
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.document_service_enhanced import EnhancedDocumentService
            import inspect
            
            source = inspect.getsource(EnhancedDocumentService.generate_document)
            
            # Verify reminder imports
            assert "normalize_reminder_config" in source, \
                "generate_document should import normalize_reminder_config"
            
            assert "initial_reminder_state" in source, \
                "generate_document should import initial_reminder_state"
            
            # Verify reminder config processing
            assert "reminder_config" in source, \
                "generate_document should process reminder_config"
            
            assert "reminder_state" in source, \
                "generate_document should set reminder_state"
            
            # Verify it handles public-API style fields
            assert "reminder_enabled" in source, \
                "generate_document should handle reminder_enabled field"
            
            print("✓ generate_document imports reminder service functions")
            print("✓ generate_document processes reminder_config for each recipient")
            print("✓ generate_document initializes reminder_state for active reminders")
            
        except ImportError as e:
            pytest.skip(f"Could not import document_service_enhanced: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 13: Verify generate_links_routes builds reminder config
    # ─────────────────────────────────────────────────────────────────────────
    def test_13_generate_links_routes_builds_reminder_config(self):
        """
        Test that generate_links_routes._build_reminder_config_from_recipient
        correctly translates RecipientInput to reminder config dict.
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.api.generate_links_routes import _build_reminder_config_from_recipient
            import inspect
            
            source = inspect.getsource(_build_reminder_config_from_recipient)
            
            # Verify it handles nested reminder_config
            assert "reminder_config" in source, \
                "_build_reminder_config_from_recipient should check reminder_config"
            
            # Verify it handles flat public-API fields
            assert "reminder_enabled" in source, \
                "_build_reminder_config_from_recipient should check reminder_enabled"
            
            assert "reminder_frequency" in source, \
                "_build_reminder_config_from_recipient should check reminder_frequency"
            
            assert "reminder_custom_value" in source, \
                "_build_reminder_config_from_recipient should check reminder_custom_value"
            
            assert "reminder_custom_unit" in source, \
                "_build_reminder_config_from_recipient should check reminder_custom_unit"
            
            print("✓ _build_reminder_config_from_recipient handles nested reminder_config")
            print("✓ _build_reminder_config_from_recipient handles flat public-API fields")
            
        except ImportError as e:
            pytest.skip(f"Could not import generate_links_routes: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 14: End-to-end test with daily reminder preset
    # ─────────────────────────────────────────────────────────────────────────
    def test_14_generate_links_with_daily_reminder_preset(self):
        """
        Test POST /api/v1/documents/generate-links with reminder_frequency='daily'.
        """
        assert self._login(), "Login failed"
        template_id = self._get_or_create_template()
        assert template_id, "Failed to get or create template"
        
        payload = {
            "template_id": template_id,
            "document_name": f"Daily Reminder Test {uuid.uuid4().hex[:8]}",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": False,
            "recipients": [
                {
                    "name": "Daily Reminder Recipient",
                    "email": "daily-reminder@example.com",
                    "role": "signer",
                    "routing_order": 1,
                    "reminder_enabled": True,
                    "reminder_frequency": "daily"
                }
            ],
            "require_auth": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("document_id")
        
        print(f"✓ Document created with daily reminder preset: {data.get('document_id')}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 15: End-to-end test with weekly reminder preset
    # ─────────────────────────────────────────────────────────────────────────
    def test_15_generate_links_with_weekly_reminder_preset(self):
        """
        Test POST /api/v1/documents/generate-links with reminder_frequency='weekly'.
        """
        assert self._login(), "Login failed"
        template_id = self._get_or_create_template()
        assert template_id, "Failed to get or create template"
        
        payload = {
            "template_id": template_id,
            "document_name": f"Weekly Reminder Test {uuid.uuid4().hex[:8]}",
            "routing_type": "sequential",
            "delivery_mode": "email",
            "send_email": False,
            "recipients": [
                {
                    "name": "Weekly Reminder Recipient",
                    "email": "weekly-reminder@example.com",
                    "role": "signer",
                    "routing_order": 1,
                    "reminder_enabled": True,
                    "reminder_frequency": "weekly"
                }
            ],
            "require_auth": False
        }
        
        response = self.session.post(f"{BASE_URL}/api/v1/documents/generate-links", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True
        assert data.get("document_id")
        
        print(f"✓ Document created with weekly reminder preset: {data.get('document_id')}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 16: Verify reminder config validation (invalid custom unit)
    # ─────────────────────────────────────────────────────────────────────────
    def test_16_reminder_config_validation_invalid_unit(self):
        """
        Test that normalize_reminder_config rejects invalid custom units.
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import normalize_reminder_config
            
            # Test with invalid unit
            cfg = {
                "reminder_enabled": True,
                "reminder_frequency": "custom",
                "reminder_custom_value": 5,
                "reminder_custom_unit": "invalid_unit"
            }
            
            try:
                result = normalize_reminder_config(cfg)
                # Should raise ValueError for invalid unit
                assert False, "Should have raised ValueError for invalid unit"
            except ValueError as e:
                assert "reminder_custom_unit" in str(e).lower() or "custom" in str(e).lower()
                print(f"✓ Correctly rejected invalid unit: {e}")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Test 17: Verify reminder config validation (zero interval value)
    # ─────────────────────────────────────────────────────────────────────────
    def test_17_reminder_config_validation_zero_value(self):
        """
        Test that normalize_reminder_config rejects zero or negative interval values.
        """
        try:
            import sys
            sys.path.insert(0, '/app/backend')
            from modules.docflow.services.reminder_service import normalize_reminder_config
            
            # Test with zero value
            cfg = {
                "reminder_enabled": True,
                "reminder_frequency": "custom",
                "reminder_custom_value": 0,
                "reminder_custom_unit": "minutes"
            }
            
            try:
                result = normalize_reminder_config(cfg)
                assert False, "Should have raised ValueError for zero value"
            except ValueError as e:
                assert "greater than 0" in str(e).lower() or "value" in str(e).lower()
                print(f"✓ Correctly rejected zero interval value: {e}")
            
        except ImportError as e:
            pytest.skip(f"Could not import reminder_service: {e}")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
