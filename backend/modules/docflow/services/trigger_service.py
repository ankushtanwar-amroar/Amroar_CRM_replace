"""
Trigger Service - Evaluates conditions for automatic document generation
"""
from typing import Dict, Any, List, Optional


class TriggerService:
    def __init__(self, db):
        self.db = db
    
    async def evaluate_trigger(self, template_id: str, crm_object_id: str, crm_object_type: str, tenant_id: str) -> bool:
        """
        Evaluate if trigger conditions are met for automatic document generation
        """
        # Get template with trigger configuration
        template = await self.db.docflow_templates.find_one({
            "id": template_id,
            "tenant_id": tenant_id
        })
        
        if not template:
            return False
        
        trigger_config = template.get("trigger_config")
        if not trigger_config or trigger_config.get("type") != "automatic":
            return False
        
        # Get CRM record
        collection = self._get_collection_for_type(crm_object_type)
        if not collection:
            return False
        
        record = await collection.find_one({"id": crm_object_id, "tenant_id": tenant_id})
        if not record:
            return False
        
        # Evaluate conditions
        conditions = trigger_config.get("conditions", [])
        return self._evaluate_conditions(record, conditions)
    
    def _evaluate_conditions(self, record: Dict, conditions: List[Dict]) -> bool:
        """
        Evaluate trigger conditions against record data
        Format: [{"field": "Stage", "operator": "equals", "value": "Closed Won"}]
        """
        if not conditions:
            return True
        
        for condition in conditions:
            field = condition.get("field")
            operator = condition.get("operator")
            expected_value = condition.get("value")
            
            # Get actual value from record
            actual_value = record.get("fields", {}).get(field)
            
            # Evaluate
            if operator == "equals":
                if actual_value != expected_value:
                    return False
            elif operator == "not_equals":
                if actual_value == expected_value:
                    return False
            elif operator == "contains":
                if expected_value not in str(actual_value):
                    return False
            elif operator == "greater_than":
                if not (actual_value and actual_value > expected_value):
                    return False
            elif operator == "less_than":
                if not (actual_value and actual_value < expected_value):
                    return False
        
        return True
    
    def _get_collection_for_type(self, object_type: str):
        """Get MongoDB collection for object type"""
        type_map = {
            "opportunity": self.db.opportunities,
            "account": self.db.accounts,
            "lead": self.db.leads,
            "contact": self.db.contacts,
            "order": self.db.orders
        }
        return type_map.get(object_type.lower(), self.db.object_records)
