"""
DateTime Resolver - Resolves dynamic DateTime sources for Delay nodes
Supports Salesforce-like "Wait Until DateTime" behavior
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple
from dateutil import parser as dateutil_parser

logger = logging.getLogger(__name__)


class DateTimeResolver:
    """
    Resolves dynamic DateTime sources from flow execution context
    Supports: trigger fields, get_records outputs, variables, inputs, formulas
    """
    
    @staticmethod
    def resolve_datetime_source(
        source_config: Dict[str, Any],
        execution_context: Dict[str, Any]
    ) -> Tuple[Optional[datetime], Optional[str]]:
        """
        Resolve a DateTime source from execution context
        
        Args:
            source_config: Dict with 'type' and 'ref' keys
                - type: 'trigger_field' | 'get_record_field' | 'variable' | 'input' | 'formula'
                - ref: Reference string (e.g., 'Trigger.Lead.FollowUpDateTime__c')
            execution_context: Flow execution context with all available data
            
        Returns:
            Tuple of (datetime_value, error_message)
            - If successful: (datetime, None)
            - If failed: (None, error_message)
        """
        source_type = source_config.get("type")
        source_ref = source_config.get("ref")
        
        if not source_type or not source_ref:
            return None, "Missing source type or reference"
        
        logger.info(f"   Resolving DateTime source: type={source_type}, ref={source_ref}")
        
        try:
            if source_type == "trigger_field":
                return DateTimeResolver._resolve_trigger_field(source_ref, execution_context)
            elif source_type == "get_record_field":
                return DateTimeResolver._resolve_get_record_field(source_ref, execution_context)
            elif source_type == "variable":
                return DateTimeResolver._resolve_variable(source_ref, execution_context)
            elif source_type == "input":
                return DateTimeResolver._resolve_input(source_ref, execution_context)
            elif source_type == "formula":
                return DateTimeResolver._resolve_formula(source_ref, execution_context)
            else:
                return None, f"Unknown source type: {source_type}"
        except Exception as e:
            logger.error(f"   ❌ Error resolving DateTime source: {e}")
            return None, str(e)
    
    @staticmethod
    def _resolve_trigger_field(ref: str, context: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[str]]:
        """
        Resolve DateTime from trigger record field
        Example ref: "Trigger.Lead.FollowUpDateTime__c"
        """
        # Parse reference: Trigger.ObjectName.FieldName
        parts = ref.split(".")
        if len(parts) < 3:
            return None, f"Invalid trigger field reference: {ref}"
        
        field_name = parts[-1]  # Last part is the field name
        
        # Get trigger context
        trigger_context = context.get("trigger", {}) or context.get("record", {})
        
        if not trigger_context:
            return None, "No trigger context found in execution"
        
        # Get field value
        field_value = trigger_context.get(field_name)
        
        if field_value is None:
            return None, f"Field '{field_name}' is null or not found in trigger"
        
        # Parse as datetime
        dt = DateTimeResolver._parse_datetime_value(field_value)
        if dt is None:
            return None, f"Field '{field_name}' is not a valid DateTime"
        
        logger.info(f"   ✅ Resolved trigger field: {field_name} = {dt}")
        return dt, None
    
    @staticmethod
    def _resolve_get_record_field(ref: str, context: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[str]]:
        """
        Resolve DateTime from Get Records step output
        Example ref: "Get_Account.NextRenewalDateTime__c"
        """
        # Parse reference: StepName.FieldName
        parts = ref.split(".")
        if len(parts) < 2:
            return None, f"Invalid get record field reference: {ref}"
        
        step_name = parts[0]
        field_name = parts[1]
        
        # Look for step output in context.node_outputs
        node_outputs = context.get("node_outputs", {})
        step_output = node_outputs.get(step_name)
        
        if not step_output:
            return None, f"Step '{step_name}' output not found"
        
        # Get Records can return single record or array
        record = None
        if isinstance(step_output, list):
            if len(step_output) == 0:
                return None, f"Step '{step_name}' returned no records"
            record = step_output[0]  # Use first record
        elif isinstance(step_output, dict):
            record = step_output
        else:
            return None, f"Invalid step output format for '{step_name}'"
        
        # Get field value
        field_value = record.get(field_name)
        
        if field_value is None:
            return None, f"Field '{field_name}' is null in Get Records output"
        
        # Parse as datetime
        dt = DateTimeResolver._parse_datetime_value(field_value)
        if dt is None:
            return None, f"Field '{field_name}' is not a valid DateTime"
        
        logger.info(f"   ✅ Resolved Get Records field: {step_name}.{field_name} = {dt}")
        return dt, None
    
    @staticmethod
    def _resolve_variable(ref: str, context: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[str]]:
        """
        Resolve DateTime from Assignment Variable
        Example ref: "varNextRunAt"
        """
        # Variables are stored in context.variables
        variables = context.get("variables", {})
        
        if ref not in variables:
            return None, f"Variable '{ref}' not found"
        
        var_value = variables.get(ref)
        
        if var_value is None:
            return None, f"Variable '{ref}' is null"
        
        # Parse as datetime
        dt = DateTimeResolver._parse_datetime_value(var_value)
        if dt is None:
            return None, f"Variable '{ref}' is not a valid DateTime"
        
        logger.info(f"   ✅ Resolved variable: {ref} = {dt}")
        return dt, None
    
    @staticmethod
    def _resolve_input(ref: str, context: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[str]]:
        """
        Resolve DateTime from Input Variable
        Example ref: "inputScheduledAt"
        """
        # Input variables are in context.input_variables or context.inputs
        inputs = context.get("input_variables", {}) or context.get("inputs", {})
        
        if ref not in inputs:
            return None, f"Input variable '{ref}' not found"
        
        input_value = inputs.get(ref)
        
        if input_value is None:
            return None, f"Input variable '{ref}' is null"
        
        # Parse as datetime
        dt = DateTimeResolver._parse_datetime_value(input_value)
        if dt is None:
            return None, f"Input variable '{ref}' is not a valid DateTime"
        
        logger.info(f"   ✅ Resolved input: {ref} = {dt}")
        return dt, None
    
    @staticmethod
    def _resolve_formula(ref: str, context: Dict[str, Any]) -> Tuple[Optional[datetime], Optional[str]]:
        """
        Resolve DateTime from Formula Variable output
        Example ref: "formulaNextReminderAt"
        """
        # Formula outputs are stored in context.formula_outputs or context.variables
        formula_outputs = context.get("formula_outputs", {}) or context.get("variables", {})
        
        if ref not in formula_outputs:
            return None, f"Formula '{ref}' not found"
        
        formula_value = formula_outputs.get(ref)
        
        if formula_value is None:
            return None, f"Formula '{ref}' returned null"
        
        # Parse as datetime
        dt = DateTimeResolver._parse_datetime_value(formula_value)
        if dt is None:
            return None, f"Formula '{ref}' is not a valid DateTime"
        
        logger.info(f"   ✅ Resolved formula: {ref} = {dt}")
        return dt, None
    
    @staticmethod
    def _parse_datetime_value(value: Any) -> Optional[datetime]:
        """
        Parse various datetime formats into datetime object
        Ensures timezone-aware datetime in UTC
        """
        if isinstance(value, datetime):
            dt = value
        elif isinstance(value, str):
            try:
                # Try ISO format first
                dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            except:
                try:
                    # Try dateutil parser for flexible parsing
                    dt = dateutil_parser.parse(value)
                except:
                    return None
        else:
            # Not a datetime-compatible type
            return None
        
        # Ensure timezone-aware (convert to UTC if naive)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        
        return dt
