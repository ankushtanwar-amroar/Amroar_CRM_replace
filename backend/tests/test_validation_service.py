"""
Tests for DocFlow ValidationService.

Verifies the validation contract:
- Exactly 8 checks run every time (deterministic count)
- Each check produces status ∈ {passed, warning, error}
- A fully-configured Salesforce template reaches 100% score (no false warnings)
- A minimal/empty template produces 0% with the SAME total_checks
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.modules.docflow.services.validation_service import (
    ValidationService,
    TOTAL_CHECKS,
    CHECK_DEFINITIONS,
)


def _make_db_mock(tenant_object=None, schema_object=None):
    db = MagicMock()
    db.tenant_objects = MagicMock()
    db.tenant_objects.find_one = AsyncMock(return_value=tenant_object)
    db.schema_objects = MagicMock()
    db.schema_objects.find_one = AsyncMock(return_value=schema_object)
    db.schema_fields = MagicMock()
    db.schema_fields.find_one = AsyncMock(return_value=None)
    db.metadata_fields = MagicMock()
    db.metadata_fields.find_one = AsyncMock(return_value=None)
    db.docflow_templates = MagicMock()
    db.docflow_templates.find_one = AsyncMock(return_value=None)
    return db


def test_total_checks_constant_is_eight():
    assert TOTAL_CHECKS == 8
    assert len(CHECK_DEFINITIONS) == 8
    ids = {d["id"] for d in CHECK_DEFINITIONS}
    assert ids == {
        "template_name", "document_file", "crm_connection",
        "recipients", "routing_mode", "field_placements",
        "signature_fields", "merge_fields",
    }


def test_empty_template_returns_8_checks_with_low_score():
    db = _make_db_mock()
    svc = ValidationService(db)
    result = asyncio.run(svc.validate_template_obj({}, tenant_id="t1"))

    assert result["total_checks"] == 8
    assert len(result["checks"]) == 8
    # Empty template fails core checks → low score, not valid
    assert result["valid"] is False
    assert result["score"] < 50
    # Must have template_name + document_file errors
    error_ids = {c["id"] for c in result["checks"] if c["status"] == "error"}
    assert "template_name" in error_ids
    assert "document_file" in error_ids


def test_fully_configured_salesforce_template_reaches_100():
    """Critical: a fully-configured Salesforce template must score 100% with NO false CRM warnings."""
    db = _make_db_mock()
    svc = ValidationService(db)

    template = {
        "name": "Sales NDA",
        "file_url": "https://example.com/nda.pdf",
        "crm_connection": {
            "provider": "salesforce",
            "connection_id": "sf-conn-123",
            "object_name": "Opportunity",
        },
        "recipients": [
            {"id": "r1", "role": "signer", "routing_order": 1},
            {"id": "r2", "role": "approver", "routing_order": 2},
        ],
        "routing_mode": "sequential",
        "field_placements": [
            {"type": "signature", "recipient_id": "r1"},
            {"type": "date", "recipient_id": "r1"},
            {"type": "merge", "mergeObject": "Opportunity", "mergeField": "Name"},
        ],
    }

    result = asyncio.run(svc.validate_template_obj(template, tenant_id="t1"))
    assert result["total_checks"] == 8
    assert result["score"] == 100, f"Expected 100%, got {result['score']}%. Failures: {[c for c in result['checks'] if c['status'] != 'passed']}"
    assert result["valid"] is True
    assert len(result["errors"]) == 0
    assert len(result["warnings"]) == 0


def test_salesforce_without_connection_id_shows_warning_not_error():
    """Salesforce without connection_id → WARNING (soft) so document generation isn't blocked for legacy/public-link flows."""
    db = _make_db_mock()
    svc = ValidationService(db)
    template = {
        "name": "Test",
        "file_url": "x.pdf",
        "crm_connection": {"provider": "salesforce", "object_name": "Account"},
        "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
        "routing_mode": "sequential",
        "field_placements": [{"type": "signature", "recipient_id": "r1"}],
    }
    result = asyncio.run(svc.validate_template_obj(template, tenant_id="t1"))
    crm_check = next(c for c in result["checks"] if c["id"] == "crm_connection")
    assert crm_check["status"] == "warning"
    assert "connection" in crm_check["message"].lower()
    # Template should still be "valid" (no hard errors) so doc generation proceeds
    assert result["valid"] is True


def test_score_is_deterministic_across_runs():
    """Running the same template twice produces identical results (no fluctuation)."""
    db = _make_db_mock()
    svc = ValidationService(db)
    template = {
        "name": "Test",
        "file_url": "x.pdf",
        "crm_connection": {"provider": "salesforce", "connection_id": "c1", "object_name": "Account"},
        "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
        "routing_mode": "sequential",
        "field_placements": [{"type": "signature", "recipient_id": "r1"}],
    }
    r1 = asyncio.run(svc.validate_template_obj(template, tenant_id="t1"))
    r2 = asyncio.run(svc.validate_template_obj(template, tenant_id="t1"))
    assert r1["score"] == r2["score"]
    assert r1["total_checks"] == r2["total_checks"]
    assert [c["status"] for c in r1["checks"]] == [c["status"] for c in r2["checks"]]


def test_merge_field_misconfiguration_is_error():
    db = _make_db_mock()
    svc = ValidationService(db)
    template = {
        "name": "Test",
        "file_url": "x.pdf",
        "crm_connection": {"provider": "salesforce", "connection_id": "c1", "object_name": "Account"},
        "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
        "routing_mode": "sequential",
        "field_placements": [
            {"type": "signature", "recipient_id": "r1"},
            {"type": "merge", "label": "BrokenField"},  # missing object & field
        ],
    }
    result = asyncio.run(svc.validate_template_obj(template, tenant_id="t1"))
    merge_check = next(c for c in result["checks"] if c["id"] == "merge_fields")
    assert merge_check["status"] == "error"
    assert "BrokenField" in merge_check["message"]


def test_no_crm_connection_shows_warning_not_error():
    """If no CRM is attached at all, it should be a soft WARNING (CRM is optional)."""
    db = _make_db_mock()
    svc = ValidationService(db)
    template = {
        "name": "Test",
        "file_url": "x.pdf",
        "recipients": [{"id": "r1", "role": "signer", "routing_order": 1}],
        "routing_mode": "sequential",
        "field_placements": [{"type": "signature", "recipient_id": "r1"}],
    }
    result = asyncio.run(svc.validate_template_obj(template, tenant_id="t1"))
    crm_check = next(c for c in result["checks"] if c["id"] == "crm_connection")
    assert crm_check["status"] == "warning"


def test_empty_recipients_no_longer_emits_warning():
    """Phase 49.2: empty recipients list no longer produces a validation warning."""
    db = _make_db_mock()
    svc = ValidationService(db)
    template = {
        "name": "Draft",
        "file_url": "x.pdf",
        "recipients": [],
        "routing_mode": "sequential",
        "field_placements": [{"type": "signature"}],
    }
    result = asyncio.run(svc.validate_template_obj(template, tenant_id="t1"))
    rec_check = next(c for c in result["checks"] if c["id"] == "recipients")
    assert rec_check["status"] == "passed"
    # No warning/error should mention "No recipients configured"
    for c in result["checks"]:
        assert "add at least one signer" not in c.get("message", "")
