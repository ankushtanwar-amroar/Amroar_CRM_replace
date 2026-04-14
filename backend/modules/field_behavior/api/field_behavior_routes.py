"""
Field Behavior Rules API Routes
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from shared.auth import get_current_user_dict
from shared.database import db

from ..models.rule_models import (
    FieldBehaviorEvaluationRequest, FieldBehaviorEvaluationResult,
    ParentLookupResolutionRequest, ParentLookupResolutionResult,
    FieldBehaviorConfig
)
from ..services.rule_engine import rule_engine
from ..services.parent_resolver import ParentLookupResolver, get_available_parent_fields

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/field-behavior", tags=["Field Behavior Rules"])


@router.post("/evaluate", response_model=List[FieldBehaviorEvaluationResult])
async def evaluate_field_rules(
    request: FieldBehaviorEvaluationRequest,
    user: dict = Depends(get_current_user_dict)
):
    """
    Evaluate field behavior rules for a record.
    Returns visibility, required, and readonly status for each field.
    """
    try:
        
        tenant_id = user["tenant_id"]
        
        # Extract parent references from rules
        parent_refs = set()
        for field_rule in request.fieldRules:
            refs = extract_parent_references(field_rule)
            parent_refs.update(refs)
        
        # Resolve parent data if needed
        parent_data = {}
        if parent_refs and request.recordData.get('id'):
            resolver = ParentLookupResolver(db, tenant_id)
            parent_data = await resolver.resolve_parent_references(
                request.objectName,
                request.recordData['id'],
                list(parent_refs)
            )
        
        # Evaluate rules
        results = rule_engine.evaluate_all_field_rules(
            request.fieldRules,
            request.recordData,
            parent_data,
            request.pageType
        )
        
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error evaluating field rules: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resolve-parents", response_model=ParentLookupResolutionResult)
async def resolve_parent_lookups(
    request: ParentLookupResolutionRequest,
    user: dict = Depends(get_current_user_dict)
):
    """
    Resolve parent lookup field values.
    Used by frontend to pre-fetch parent data for rule evaluation.
    """
    try:
        
        tenant_id = user["tenant_id"]
        
        resolver = ParentLookupResolver(db, tenant_id)
        resolved = await resolver.resolve_parent_references(
            request.objectName,
            request.recordId,
            request.parentReferences
        )
        
        return ParentLookupResolutionResult(resolvedValues=resolved)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resolving parent lookups: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fields/{object_name}")
async def get_available_fields(
    object_name: str,
    depth: int = 2,
    user: dict = Depends(get_current_user_dict)
):
    """
    Get available fields for rule configuration.
    Includes fields from current object and parent lookup objects.
    """
    try:
        
        tenant_id = user["tenant_id"]
        
        fields = await get_available_parent_fields(
            db, tenant_id, object_name, max_depth=min(depth, 5)
        )
        
        return {"fields": fields}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting available fields: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-formula")
async def validate_formula(
    formula: str,
    object_name: str,
    user: dict = Depends(get_current_user_dict)
):
    """
    Validate a formula expression for syntax errors.
    """
    try:
        
        
        from modules.field_management.services.formula_service import FormulaEngine
        
        engine = FormulaEngine(blank_as_zero=False)
        is_valid, errors, dependencies = engine.parse_expression(formula)
        
        return {
            "isValid": is_valid,
            "errors": errors,
            "dependencies": [
                {"fieldName": d.field_name, "objectName": d.object_name, "isCrossObject": d.is_cross_object}
                for d in dependencies
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating formula: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def extract_parent_references(field_rule: FieldBehaviorConfig) -> List[str]:
    """Extract parent field references from a field rule configuration"""
    refs = []
    
    # Check visibility rule
    if field_rule.visibilityRule:
        if field_rule.visibilityRule.basic and '.' in (field_rule.visibilityRule.basic.left or ''):
            refs.append(field_rule.visibilityRule.basic.left)
        if field_rule.visibilityRule.formula:
            refs.extend(extract_refs_from_formula(field_rule.visibilityRule.formula))
    
    # Check required rule
    if field_rule.requiredRule:
        if field_rule.requiredRule.basic and '.' in (field_rule.requiredRule.basic.left or ''):
            refs.append(field_rule.requiredRule.basic.left)
        if field_rule.requiredRule.formula:
            refs.extend(extract_refs_from_formula(field_rule.requiredRule.formula))
    
    # Check readonly rule
    if field_rule.readonlyRule:
        if field_rule.readonlyRule.basic and '.' in (field_rule.readonlyRule.basic.left or ''):
            refs.append(field_rule.readonlyRule.basic.left)
        if field_rule.readonlyRule.formula:
            refs.extend(extract_refs_from_formula(field_rule.readonlyRule.formula))
    
    return refs


def extract_refs_from_formula(formula: str) -> List[str]:
    """Extract parent field references from a formula string"""
    import re
    
    # Match patterns like "Account.Industry" or "Account.Owner.Name"
    pattern = r'\b([A-Z][a-zA-Z0-9_]*(?:\.[A-Z][a-zA-Z0-9_]*)+)\b'
    matches = re.findall(pattern, formula)
    
    return matches
