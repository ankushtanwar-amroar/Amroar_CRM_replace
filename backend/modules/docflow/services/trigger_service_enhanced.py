"""
Enhanced Trigger Service - Evaluates trigger conditions and auto-generates documents
Supports: onCreate, onUpdate, onStageChange, scheduled triggers
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class TriggerService:
    """Service to evaluate trigger conditions for auto document generation"""
    
    def __init__(self, db):
        self.db = db
    
    SUPPORTED_TRIGGER_TYPES = [
        "onCreate",      # When record is created
        "onUpdate",      # When record is updated
        "field_change",  # When specific field changes (legacy)
        "onStageChange", # When stage/status field changes
        "scheduled"      # Scheduled/time-based triggers
    ]
    
    SUPPORTED_OPERATORS = [
        "equals",           # field == value
        "not_equals",       # field != value
        "contains",         # value in field
        "not_contains",     # value not in field
        "greater_than",     # field > value
        "less_than",        # field < value
        "greater_or_equal", # field >= value
        "less_or_equal",    # field <= value
        "is_empty",         # field is null or empty
        "is_not_empty",     # field is not null and not empty
        "changes_to",       # field changed TO this value
        "changes_from",     # field changed FROM this value
    ]
    
    async def evaluate_triggers_for_object(self, object_type: str, object_id: str, 
                                          object_data: Dict[str, Any], tenant_id: str,
                                          event_type: str = "onUpdate",
                                          old_data: Dict[str, Any] = None):
        """
        Evaluate all active triggers for an object and generate documents if conditions match
        
        Args:
            object_type: "lead", "contact", "opportunity", etc.
            object_id: UUID of the object
            object_data: Current object data
            tenant_id: Tenant ID
            event_type: "onCreate", "onUpdate", "onStageChange"
            old_data: Previous object data (for change detection)
        """
        try:
            logger.info(f"🔍 Evaluating triggers for {object_type} {object_id}")
            logger.info(f"   Event type: {event_type}")
            logger.info(f"   Tenant ID: {tenant_id}")
            
            # Log key fields from record for debugging
            data_preview = {k: v for k, v in (object_data.get('data', object_data) or {}).items() 
                          if k in ['status', 'Status', 'email', 'Email', 'name', 'Name']}
            logger.info(f"   Key fields: {data_preview}")
            
            # Find templates with active triggers for this object type
            query = {
                "tenant_id": tenant_id,
                "trigger_config.enabled": True,
                "trigger_config.object_type": {"$regex": f"^{object_type}$", "$options": "i"}
            }
            logger.info(f"   Template query: {query}")
            
            templates = await self.db.docflow_templates.find(query).to_list(length=100)
            
            logger.info(f"📋 Found {len(templates)} templates with triggers for {object_type}")
            
            if not templates:
                # Check if any triggers exist at all for debugging
                all_triggers = await self.db.docflow_templates.find({
                    "tenant_id": tenant_id,
                    "trigger_config.enabled": True
                }, {"_id": 0, "name": 1, "trigger_config.object_type": 1}).to_list(length=10)
                
                if all_triggers:
                    logger.info(f"   Available triggers: {[t.get('name') + ' -> ' + t.get('trigger_config', {}).get('object_type', '?') for t in all_triggers]}")
                else:
                    logger.info(f"   No active triggers found for tenant {tenant_id}")
            
            triggered_count = 0
            
            for template in templates:
                trigger_config = template.get("trigger_config", {})
                template_name = template.get('name', 'Unnamed')
                
                logger.info(f"🔎 Evaluating template: {template_name} (ID: {template['id']})")
                logger.info(f"   Trigger config: type={trigger_config.get('trigger_type')}, object={trigger_config.get('object_type')}")
                logger.info(f"   Conditions: {trigger_config.get('conditions', [])}")
                
                # Check if trigger type matches event
                trigger_type = trigger_config.get("trigger_type", "onUpdate")
                
                # Normalize trigger type
                if trigger_type == "field_change":
                    trigger_type = "onUpdate"
                
                # Check if trigger should fire for this event
                should_evaluate = False
                
                if event_type == "onCreate" and trigger_type == "onCreate":
                    should_evaluate = True
                    logger.info(f"   ✓ Event match: onCreate")
                elif event_type == "onUpdate" and trigger_type in ["onUpdate", "field_change"]:
                    should_evaluate = True
                    logger.info(f"   ✓ Event match: onUpdate")
                elif event_type == "onStageChange" and trigger_type == "onStageChange":
                    should_evaluate = True
                    logger.info(f"   ✓ Event match: onStageChange")
                else:
                    logger.info(f"   ✗ Event mismatch: template expects '{trigger_type}', got '{event_type}'")
                
                if should_evaluate:
                    # Evaluate conditions
                    conditions_met = self._evaluate_conditions(
                        trigger_config.get("conditions", []), 
                        object_data, 
                        old_data
                    )
                    
                    if conditions_met:
                        logger.info(f"   ✅ Conditions MATCHED - Generating document")
                        
                        # Generate document
                        await self._generate_document_from_trigger(
                            template,
                            object_type,
                            object_id,
                            object_data,
                            tenant_id
                        )
                        triggered_count += 1
                    else:
                        logger.info(f"   ❌ Conditions NOT matched")
            
            logger.info(f"📊 Total triggered: {triggered_count} documents for {object_type} {object_id}")
            return triggered_count
            
        except Exception as e:
            logger.error(f"❌ Error evaluating triggers: {e}", exc_info=True)
            return 0
    
    def _evaluate_conditions(self, conditions: List[Dict[str, Any]], 
                            object_data: Dict[str, Any], 
                            old_data: Dict[str, Any] = None) -> bool:
        """
        Evaluate if all trigger conditions are met
        Supports all operators: equals, contains, greater_than, changes_to, etc.
        
        Args:
            conditions: List of condition objects
            object_data: Current object data
            old_data: Previous object data (for change detection)
        
        Returns:
            True if all conditions match (AND logic), or True if no conditions (fire always)
        """
        # If no conditions, trigger fires on every matching event
        if not conditions:
            logger.info("   ℹ️ No conditions defined - trigger fires on every event")
            return True
        
        logger.info(f"   📝 Evaluating {len(conditions)} condition(s)...")
        
        for i, condition in enumerate(conditions):
            field = condition.get("field")
            operator = condition.get("operator")
            value = condition.get("value")
            
            # Get current field value from object data
            field_value = self._get_field_value(object_data, field)
            
            # Get old field value if available
            old_field_value = self._get_field_value(old_data, field) if old_data else None
            
            logger.info(f"      Condition {i+1}: {field} {operator} '{value}'")
            logger.info(f"         Current value: '{field_value}' (type: {type(field_value).__name__})")
            if old_data:
                logger.info(f"         Old value: '{old_field_value}'")
            
            # Evaluate condition based on operator
            result = self._evaluate_single_condition(operator, field_value, value, old_field_value)
            logger.info(f"         Result: {'✅ PASS' if result else '❌ FAIL'}")
            
            if not result:
                return False
        
        # All conditions matched
        logger.info(f"   ✅ All {len(conditions)} conditions PASSED")
        return True
    
    def _get_field_value(self, data: Dict[str, Any], field_name: str) -> Any:
        """Get field value from object data, supporting multiple data structures"""
        if not data:
            return None
        
        # Try direct access
        if field_name in data:
            return data[field_name]
        
        # Try nested fields dict
        if 'fields' in data and field_name in data['fields']:
            return data['fields'][field_name]
        
        # Try nested data dict
        if 'data' in data and field_name in data['data']:
            return data['data'][field_name]
        
        return None
    
    def _evaluate_single_condition(self, operator: str, field_value: Any, 
                                   expected_value: Any, old_value: Any = None) -> bool:
        """Evaluate a single condition with the given operator"""
        
        try:
            if operator == "equals":
                return str(field_value).lower() == str(expected_value).lower()
            
            elif operator == "not_equals":
                return str(field_value).lower() != str(expected_value).lower()
            
            elif operator == "contains":
                return str(expected_value).lower() in str(field_value).lower()
            
            elif operator == "not_contains":
                return str(expected_value).lower() not in str(field_value).lower()
            
            elif operator == "greater_than":
                return float(field_value) > float(expected_value)
            
            elif operator == "less_than":
                return float(field_value) < float(expected_value)
            
            elif operator == "greater_or_equal":
                return float(field_value) >= float(expected_value)
            
            elif operator == "less_or_equal":
                return float(field_value) <= float(expected_value)
            
            elif operator == "is_empty":
                return field_value is None or str(field_value).strip() == ""
            
            elif operator == "is_not_empty":
                return field_value is not None and str(field_value).strip() != ""
            
            elif operator == "changes_to":
                # Field must have changed TO this value
                return str(field_value).lower() == str(expected_value).lower() and \
                       str(old_value).lower() != str(expected_value).lower()
            
            elif operator == "changes_from":
                # Field must have changed FROM this value
                return str(old_value).lower() == str(expected_value).lower() and \
                       str(field_value).lower() != str(expected_value).lower()
            
            else:
                logger.warning(f"Unknown operator: {operator}")
                return False
                
        except (ValueError, TypeError) as e:
            logger.error(f"Error evaluating condition {operator}: {e}")
            return False
    
    async def _generate_document_from_trigger(self, template: Dict[str, Any], object_type: str,
                                             object_id: str, object_data: Dict[str, Any], 
                                             tenant_id: str):
        """
        Generate document when trigger conditions are met.
        Uses the configured email_field from trigger_config to determine recipient email.
        Recipient name is optional - email will still be sent without it.
        """
        try:
            from ..services.document_service_enhanced import EnhancedDocumentService
            
            logger.info(f"🔧 Starting document generation from trigger...")
            
            doc_service = EnhancedDocumentService(self.db)
            trigger_config = template.get("trigger_config", {})
            
            # Get the configured email field (if specified)
            email_field = trigger_config.get("email_field")
            logger.info(f"   Configured email field: {email_field or 'Not specified (will use fallbacks)'}")
            
            # Try to get recipient email from configured field, then fallback to common email fields
            recipient_email = None
            
            if email_field:
                # Use the configured email field
                recipient_email = self._get_field_value(object_data, email_field)
                logger.info(f"   Email from configured field '{email_field}': {recipient_email}")
            
            if not recipient_email:
                # Fallback: Try common email field names (case-insensitive)
                email_candidates = ['email', 'Email', 'EMAIL', 'primary_email', 'work_email', 'contact_email']
                for field_name in email_candidates:
                    recipient_email = self._get_field_value(object_data, field_name)
                    if recipient_email:
                        logger.info(f"   Email found in fallback field '{field_name}': {recipient_email}")
                        break
            
            # Get recipient name (optional - try multiple common name fields)
            recipient_name = None
            name_candidates = [
                'name', 'Name', 'NAME',
                'full_name', 'fullName', 
                'first_name', 'firstName',
                'contact_name', 'contactName',
                'lead_name', 'leadName'
            ]
            
            for name_field in name_candidates:
                recipient_name = self._get_field_value(object_data, name_field)
                if recipient_name and str(recipient_name).strip():
                    logger.info(f"   Recipient name from '{name_field}': {recipient_name}")
                    break
            
            # If still no name, try combining first_name + last_name
            if not recipient_name:
                first_name = self._get_field_value(object_data, 'first_name') or self._get_field_value(object_data, 'firstName') or ''
                last_name = self._get_field_value(object_data, 'last_name') or self._get_field_value(object_data, 'lastName') or ''
                combined_name = f"{first_name} {last_name}".strip()
                if combined_name:
                    recipient_name = combined_name
                    logger.info(f"   Recipient name from first+last: {recipient_name}")
            
            if not recipient_email:
                logger.warning(f"❌ No email found for {object_type} {object_id}")
                logger.warning(f"   Configured email_field: {email_field}")
                logger.warning(f"   Available data keys: {list(object_data.keys())}")
                if 'data' in object_data:
                    logger.warning(f"   Available data.data keys: {list(object_data.get('data', {}).keys())}")
                return
            
            # Use email as name if no name found (email is required, name is optional)
            if not recipient_name:
                recipient_name = recipient_email.split('@')[0].replace('.', ' ').replace('_', ' ').title()
                logger.info(f"   Using derived name from email: {recipient_name}")
            
            logger.info(f"📧 Generating document for: {recipient_name} <{recipient_email}>")
            
            # Generate document
            document = await doc_service.generate_document(
                template_id=template['id'],
                crm_object_id=object_id,
                crm_object_type=object_type,
                user_id=template.get('created_by', 'system'),
                tenant_id=tenant_id,
                delivery_channels=["email", "public_link"],
                recipient_email=recipient_email,
                recipient_name=recipient_name
            )
            
            logger.info(f"✅ Document generated successfully!")
            logger.info(f"   Document ID: {document['id']}")
            logger.info(f"   Template: {template.get('name')}")
            logger.info(f"   Recipient: {recipient_email}")
            
        except Exception as e:
            logger.error(f"❌ Error generating document from trigger: {e}", exc_info=True)
            # Store error for debugging
            try:
                await self.db.docflow_trigger_errors.insert_one({
                    "template_id": template.get('id'),
                    "template_name": template.get('name'),
                    "object_type": object_type,
                    "object_id": object_id,
                    "tenant_id": tenant_id,
                    "error": str(e),
                    "timestamp": datetime.now(timezone.utc)
                })
            except:
                pass
