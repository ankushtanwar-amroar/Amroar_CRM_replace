"""
Test for Email Template Default Status Fix
Verifies that:
1. No duplicate system templates are created when setting a custom template as default
2. Only one default template exists per category at any time
3. System template default status is properly preserved
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import uuid
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from modules.docflow.services.email_template_service import EmailTemplateService


@pytest.mark.asyncio
async def test_ensure_defaults_no_duplicate_after_custom_default():
    """
    Test scenario:
    1. Initial state: System template is default
    2. User sets custom template as default
    3. list_templates() is called which triggers ensure_defaults()
    4. Verify: No duplicate system template is created
    """
    # Mock database
    mock_db = MagicMock()
    mock_collection = AsyncMock()
    mock_db.docflow_email_templates = mock_collection
    
    service = EmailTemplateService(mock_db)
    tenant_id = str(uuid.uuid4())
    template_type = "signer_notification"
    
    # Mock: System template exists (without default status, as it would after set_default)
    system_template = {
        "id": "sys-123",
        "tenant_id": tenant_id,
        "name": "System Template",
        "template_type": template_type,
        "is_system": True,
        "is_default": False,  # Default status was removed by set_default()
        "body_html": "<p>old html</p>",
    }
    
    custom_template = {
        "id": "custom-456",
        "tenant_id": tenant_id,
        "name": "Custom Template",
        "template_type": template_type,
        "is_system": False,
        "is_default": True,  # Just set as default
        "body_html": "<p>custom html</p>",
    }
    
    # Configure mock responses for ensure_defaults()
    def find_one_side_effect(*args, **kwargs):
        query = args[0] if args else kwargs.get('filter', {})
        
        # Check for existing system template (not checking default status anymore)
        if query.get("is_system") and query.get("template_type") == template_type:
            return system_template
        
        # Check for existing default template
        if query.get("is_default") and query.get("template_type") == template_type:
            return custom_template
        
        return None
    
    mock_collection.find_one = AsyncMock(side_effect=find_one_side_effect)
    mock_collection.update_one = AsyncMock()
    mock_collection.insert_one = AsyncMock()
    
    # Call ensure_defaults
    await service.ensure_defaults(tenant_id)
    
    # Verify: insert_one should NOT be called (no new template created)
    mock_collection.insert_one.assert_not_called()
    
    # Verify: update_one was called to update the HTML if needed
    # (This is an implementation detail - the important part is no insert)
    
    print("✅ Test passed: No duplicate system template created")


@pytest.mark.asyncio
async def test_ensure_defaults_creates_system_template_when_no_default_exists():
    """
    Test scenario:
    1. First time setup: No system template exists
    2. No custom default exists
    3. ensure_defaults() should create system template with is_default: True
    """
    mock_db = MagicMock()
    mock_collection = AsyncMock()
    mock_db.docflow_email_templates = mock_collection
    
    service = EmailTemplateService(mock_db)
    tenant_id = str(uuid.uuid4())
    template_type = "signer_notification"
    
    # Configure mock: no templates exist
    mock_collection.find_one = AsyncMock(return_value=None)
    mock_collection.insert_one = AsyncMock()
    
    # Call ensure_defaults
    await service.ensure_defaults(tenant_id)
    
    # Verify: insert_one was called with is_default: True
    mock_collection.insert_one.assert_called_once()
    call_args = mock_collection.insert_one.call_args[0][0]
    
    assert call_args["is_default"] == True
    assert call_args["is_system"] == True
    assert call_args["template_type"] == template_type
    
    print("✅ Test passed: System template created with default status when none exists")


@pytest.mark.asyncio
async def test_ensure_defaults_preserves_custom_default():
    """
    Test scenario:
    1. System template doesn't exist
    2. Custom template is already set as default
    3. ensure_defaults() should create system template with is_default: False
    """
    mock_db = MagicMock()
    mock_collection = AsyncMock()
    mock_db.docflow_email_templates = mock_collection
    
    service = EmailTemplateService(mock_db)
    tenant_id = str(uuid.uuid4())
    template_type = "signer_notification"
    
    custom_default = {
        "id": "custom-default",
        "is_default": True,
        "is_system": False,
    }
    
    # Configure mock responses
    def find_one_side_effect(*args, **kwargs):
        query = args[0] if args else kwargs.get('filter', {})
        
        # System template doesn't exist
        if query.get("is_system"):
            return None
        
        # Custom default exists
        if query.get("is_default"):
            return custom_default
        
        return None
    
    mock_collection.find_one = AsyncMock(side_effect=find_one_side_effect)
    mock_collection.insert_one = AsyncMock()
    
    # Call ensure_defaults
    await service.ensure_defaults(tenant_id)
    
    # Verify: insert_one was called with is_default: False
    mock_collection.insert_one.assert_called_once()
    call_args = mock_collection.insert_one.call_args[0][0]
    
    assert call_args["is_default"] == False
    assert call_args["is_system"] == True
    
    print("✅ Test passed: System template created with is_default: False when custom default exists")


@pytest.mark.asyncio
async def test_set_default_workflow():
    """
    Test complete workflow:
    1. Set custom template as default
    2. Verify previous default is unset
    3. Verify new default is set
    """
    mock_db = MagicMock()
    mock_collection = AsyncMock()
    mock_db.docflow_email_templates = mock_collection
    
    service = EmailTemplateService(mock_db)
    tenant_id = str(uuid.uuid4())
    custom_template_id = "custom-123"
    template_type = "signer_notification"
    
    # Mock get_template response
    custom_template = {
        "id": custom_template_id,
        "tenant_id": tenant_id,
        "template_type": template_type,
        "is_system": False,
        "is_default": False,
    }
    
    mock_collection.find_one = AsyncMock(return_value=custom_template)
    mock_collection.update_many = AsyncMock()
    mock_collection.update_one = AsyncMock()
    
    # Call set_default
    result = await service.set_default(custom_template_id, tenant_id)
    
    # Verify: result is True
    assert result == True
    
    # Verify: update_many was called to unset other defaults
    mock_collection.update_many.assert_called_once()
    unset_call = mock_collection.update_many.call_args
    assert unset_call[0][0] == {
        "tenant_id": tenant_id,
        "template_type": template_type,
        "is_default": True
    }
    assert unset_call[0][1] == {"$set": {"is_default": False}}
    
    # Verify: update_one was called to set new default
    mock_collection.update_one.assert_called_once()
    set_call = mock_collection.update_one.call_args
    assert set_call[0][0] == {"id": custom_template_id, "tenant_id": tenant_id}
    assert set_call[0][1] == {"$set": {"is_default": True}}
    
    print("✅ Test passed: set_default works correctly")


if __name__ == "__main__":
    # Run tests with pytest
    import asyncio
    
    async def run_all_tests():
        await test_ensure_defaults_no_duplicate_after_custom_default()
        await test_ensure_defaults_creates_system_template_when_no_default_exists()
        await test_ensure_defaults_preserves_custom_default()
        await test_set_default_workflow()
    
    asyncio.run(run_all_tests())
    print("\n✅ All tests passed!")
