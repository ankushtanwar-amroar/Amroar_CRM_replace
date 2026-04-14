"""
Form Builder - AI Routes
Handles AI-powered form generation, analysis, and CRM property mapping.
"""
from fastapi import APIRouter, HTTPException, Depends
import json
import os
import sys

import google.generativeai as genai

# Import from parent module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from modules.form_builder.models import (
    db, User, get_current_user, FormField, AIFormRequest, AIVoiceRequest
)

# Configure Gemini AI
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY, transport='rest')

router = APIRouter()


# ============= AI-POWERED FORM GENERATION =============

@router.post("/ai/generate-form")
async def generate_form_with_ai(request: AIFormRequest, current_user: User = Depends(get_current_user)):
    """Conversational AI assistant for form building - like ChatGPT/Gemini"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        model = genai.GenerativeModel('models/gemini-flash-latest')
        
        form_context = request.form_context if hasattr(request, 'form_context') else {}
        current_fields = form_context.get('currentFields', request.existing_fields or [])
        all_steps = form_context.get('allSteps', [])
        conversation_history = form_context.get('conversationHistory', [])
        
        system_prompt = """You are Form Builder AI - a professional, friendly assistant that helps users build forms efficiently.

**Your Goal:** Execute commands accurately and immediately. Be professional, helpful, and error-free. Ask ONE smart clarifying question only when truly needed.

**Core Capabilities:**
- Add fields (text, email, phone, number, textarea, select, checkbox, radio, date, rating)
- Remove fields (by name, type, or all)
- Edit field properties (label, placeholder, required, type, name)
- Transform labels (uppercase, lowercase, titlecase)
- Reorder fields
- Create multi-step forms
- Answer quick questions only when asked

**Response Format (Always JSON):**
{
  "conversational_reply": "Brief confirmation of action taken",
  "action": "ADD_FIELDS|REMOVE|MODIFY|REORDER|ADD_POSITIONAL|ADD_MULTI_STEP|CHAT",
  "fields": [...],
  "field_ids_to_remove": [...],
  "fields_to_modify": [...],
  "field_order": [...],
  "steps": [...],
  "target_field_id": "...",
  "position": "before|after"
}

**Action Types:**
1. ADD_FIELDS - Add new fields to form
2. REMOVE - Delete fields by ID or pattern matching
3. MODIFY - Edit existing field properties
4. REORDER - Change field order
5. ADD_POSITIONAL - Add field before/after another
6. ADD_MULTI_STEP - Create multi-step form
7. CHAT - Answer questions (no form changes)

**MODIFY Action Format:**
{
  "action": "MODIFY",
  "fields_to_modify": [
    {"id": "field_id", "label": "new label", "placeholder": "...", "required": true|false, "labelCase": "uppercase|lowercase|titlecase"}
  ]
}

**CRITICAL Field Matching Rules:**
1. User says "rename X to Y" -> Find field with label X, use its EXACT ID in MODIFY action
2. User says "remove X" -> Find field with label X, use its EXACT ID in REMOVE action
3. Match by label (case-insensitive, can be partial)
4. Always use the actual field ID from the context above
5. For MODIFY: Include the field's current ID, don't create new ID
6. For REMOVE: Use the exact field IDs from the context

**Behavior Rules:**
- Execute rename/remove/edit commands IMMEDIATELY using correct field IDs
- For "create [type] form" requests -> Ask ONE smart question about field preferences
- Match fields by label but use ACTUAL IDs from context
- Keep replies professional and brief
- Be accurate and error-free
- For ambiguous requests, ask ONE clarifying question max
- Don't ask "are you sure?" - just execute

**Professional Tone:**
- Use proper punctuation and grammar
- Be friendly but professional
- Confirm actions clearly
- No emojis in replies

Field format:
{
  "id": "field_<timestamp>_<random>",
  "type": "text|email|phone|number|textarea|select|checkbox|radio|date|rating",
  "label": "Field Label",
  "name": "field_name",
  "placeholder": "...",
  "required": true|false,
  "options": ["..."]
}
"""
        
        context_info = ""
        
        if current_fields:
            context_info += "\n**Current Form Fields:**\n"
            for i, field in enumerate(current_fields):
                if hasattr(field, 'dict'):
                    field_dict = field.dict()
                elif isinstance(field, dict):
                    field_dict = field
                else:
                    field_dict = {
                        'id': getattr(field, 'id', 'unknown'),
                        'label': getattr(field, 'label', 'Unknown'),
                        'type': getattr(field, 'type', 'text'),
                        'required': getattr(field, 'required', False)
                    }
                
                req = "(required)" if field_dict.get('required', False) else "(optional)"
                field_id = field_dict.get('id', f'field_{i}')
                field_label = field_dict.get('label', 'Field')
                field_type = field_dict.get('type', 'text')
                context_info += f"{i+1}. Label: '{field_label}' | ID: {field_id} | Type: {field_type} | {req}\n"
        else:
            context_info += "\n**Current Form:** Empty (no fields yet)\n"
        
        if all_steps and len(all_steps) > 1:
            context_info += f"\n**Form Structure:** Multi-step form with {len(all_steps)} steps\n"
            for i, step in enumerate(all_steps):
                step_dict = step if isinstance(step, dict) else (step.dict() if hasattr(step, 'dict') else {})
                context_info += f"Step {i+1}: {step_dict.get('title', 'Step')} ({step_dict.get('fieldCount', 0)} fields)\n"
        
        if conversation_history:
            context_info += "\n**Recent Conversation:**\n"
            for msg in conversation_history:
                msg_dict = msg if isinstance(msg, dict) else (msg.dict() if hasattr(msg, 'dict') else {})
                role = "User" if msg_dict.get('role') == 'user' else "AI"
                content = msg_dict.get('content', '')
                content_preview = content[:100] + "..." if len(content) > 100 else content
                context_info += f"{role}: {content_preview}\n"
        
        user_prompt = f"""User says: "{request.prompt}"
{context_info}

CRITICAL RULES:
1. When user says "rename X to Y" or "change name of X to Y" -> Use MODIFY action (NOT add new field)
2. When user says "remove X" or "delete X" -> Use REMOVE action with correct field IDs
3. Match fields by their EXACT label from the context above
4. For "create [type] form" requests -> Ask ONE smart question about field preferences

Execute the appropriate action based on user intent."""
        
        response = model.generate_content(system_prompt + "\n\n" + user_prompt)
        response_text = response.text
        
        if '```json' in response_text:
            response_text = response_text.split('```json')[1].split('```')[0].strip()
        elif '```' in response_text:
            response_text = response_text.split('```')[1].split('```')[0].strip()
        
        ai_response = json.loads(response_text)
        conversational_reply = ai_response.get("conversational_reply", ai_response.get("message", "Done!"))
        
        result = {
            "action": ai_response.get("action", "CHAT"),
            "message": conversational_reply,
            "conversational_reply": conversational_reply,
            "fields": ai_response.get("fields", []),
            "field_ids_to_remove": ai_response.get("field_ids_to_remove", []),
            "fields_to_modify": ai_response.get("fields_to_modify", []),
            "field_order": ai_response.get("field_order", []),
            "steps": ai_response.get("steps", []),
            "target_field_id": ai_response.get("target_field_id"),
            "position": ai_response.get("position"),
            "follow_up_question": ai_response.get("follow_up_question"),
            "suggestions": ai_response.get("suggestions", [])
        }
        
        prompt_lower = request.prompt.lower()
        
        if ai_response.get("action") == "REMOVE":
            remove_ids = ai_response.get("field_ids_to_remove", [])
            if 'all' in prompt_lower or 'empty' in prompt_lower:
                result["field_ids_to_remove"] = [f['id'] if isinstance(f, dict) else f.id for f in current_fields]
                result["message"] = "Removed all fields from the form"
            else:
                result["field_ids_to_remove"] = remove_ids
                result["message"] = conversational_reply if conversational_reply else f"Removed {len(remove_ids)} field(s)"
        
        elif ai_response.get("action") == "MODIFY":
            modify_list = ai_response.get("fields_to_modify", [])
            result["fields_to_modify"] = modify_list
            result["message"] = conversational_reply if conversational_reply else f"Modified {len(modify_list)} field(s)"
        
        elif ai_response.get("action") == "REORDER":
            result["field_order"] = ai_response.get("field_order", [])
            result["message"] = conversational_reply if conversational_reply else "Fields reordered successfully"
        
        elif ai_response.get("action") == "ADD_POSITIONAL":
            fields_data = ai_response.get("fields", [])
            result["fields"] = [FormField(**field).model_dump() for field in fields_data]
            result["target_field_id"] = ai_response.get("target_field_id")
            result["position"] = ai_response.get("position", "after")
            result["message"] = conversational_reply if conversational_reply else "Fields added at specified position"
        
        elif ai_response.get("action") == "ADD_MULTI_STEP":
            steps_data = ai_response.get("steps", [])
            result["steps"] = steps_data
            result["message"] = conversational_reply if conversational_reply else f"Created {len(steps_data)}-step form"
        
        elif ai_response.get("action") == "ADD_FIELDS":
            fields_data = ai_response.get("fields", [])
            result["fields"] = [FormField(**field).model_dump() for field in fields_data]
            result["message"] = conversational_reply if conversational_reply else "Fields added successfully"
        
        else:
            result["message"] = conversational_reply if conversational_reply else "I'm here to help!"
        
        return result
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        print(f"AI generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


@router.post("/ai/text-to-speech")
async def text_to_speech(text: str, current_user: User = Depends(get_current_user)):
    """Convert text to speech using Gemini (returns audio URL or base64)"""
    return {
        "message": "TTS feature requires Google Cloud TTS API integration",
        "text": text,
        "suggestion": "Please integrate Google Cloud Text-to-Speech for voice output"
    }


@router.post("/ai/speech-to-text")
async def speech_to_text(request: AIVoiceRequest, current_user: User = Depends(get_current_user)):
    """Convert speech to text and process form building commands"""
    return {
        "message": "STT feature requires Google Cloud Speech-to-Text API integration",
        "suggestion": "Please integrate Google Cloud Speech-to-Text for voice input"
    }


@router.post("/ai/analyze-form")
async def analyze_form(form_id: str, current_user: User = Depends(get_current_user)):
    """Use AI to analyze form and suggest improvements"""
    form = await db.forms.find_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="AI service not configured")
    
    try:
        model = genai.GenerativeModel('models/gemini-flash-latest')
        
        fields_json = json.dumps([f for f in form.get("fields", [])], indent=2)
        
        prompt = f"""Analyze this form and suggest improvements:

Form Title: {form.get('title')}
Form Fields:
{fields_json}

Provide suggestions for:
1. Missing important fields
2. Field validation improvements
3. User experience enhancements
4. Field ordering optimization

Return your analysis as a JSON object with keys: suggestions (array), improvements (array), warnings (array)"""
        
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        try:
            if response_text.startswith("```json"):
                response_text = response_text[7:-3]
            analysis = json.loads(response_text)
        except (json.JSONDecodeError, ValueError):
            analysis = {
                "suggestions": [response_text],
                "improvements": [],
                "warnings": []
            }
        
        return analysis
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


# ============================================
# CRM PROPERTY MAPPING ENDPOINTS
# ============================================

@router.get("/crm/modules")
async def get_crm_modules(current_user: User = Depends(get_current_user)):
    """Get list of available CRM modules"""
    return {
        "modules": [
            {"value": "lead", "label": "Leads", "icon": "👤"},
            {"value": "contact", "label": "Contacts", "icon": "👥"},
            {"value": "account", "label": "Accounts", "icon": "🏢"}
        ]
    }


@router.get("/crm/modules/{module_name}/properties")
async def get_module_properties(
    module_name: str,
    current_user: User = Depends(get_current_user)
):
    """Get all properties for a CRM module"""
    obj = await db.tenant_objects.find_one({
        "tenant_id": current_user.tenant_id,
        "object_name": module_name
    })
    
    if not obj:
        raise HTTPException(status_code=404, detail=f"Module {module_name} not found")
    
    custom_metadata = await db.metadata_fields.find_one({
        "object_name": module_name,
        "tenant_id": current_user.tenant_id
    })
    
    properties = []
    
    for field_name, field_def in obj.get("fields", {}).items():
        properties.append({
            "id": field_name,
            "label": field_def.get("label", field_name),
            "type": field_def.get("type", "text"),
            "required": field_def.get("required", False),
            "is_custom": field_def.get("is_custom", False),
            "options": field_def.get("options", None)
        })
    
    if custom_metadata and custom_metadata.get("fields"):
        for custom_field in custom_metadata["fields"]:
            if not any(p["id"] == custom_field.get("api_name") for p in properties):
                properties.append({
                    "id": custom_field.get("api_name"),
                    "label": custom_field["label"],
                    "type": custom_field["type"].lower(),
                    "required": custom_field.get("is_required", False),
                    "is_custom": True,
                    "options": custom_field.get("options", None)
                })
    
    return {
        "module": module_name,
        "properties": properties
    }


@router.post("/ai/auto-map-properties")
async def auto_map_properties(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """Use AI to automatically map form fields to CRM properties"""
    try:
        form_fields = request.get("fields", [])
        crm_module = request.get("crm_module")
        crm_properties = request.get("properties", [])
        
        if not form_fields or not crm_module or not crm_properties:
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        field_data = []
        for f in form_fields:
            field_data.append({
                "id": f.get("id"),
                "label": f.get("label"),
                "type": f.get("type")
            })
        
        property_data = []
        for p in crm_properties:
            property_data.append({
                "id": p.get("id"),
                "label": p.get("label"),
                "type": p.get("type")
            })
        
        prompt = f"""
You are a CRM data mapping expert. Analyze the form fields and map them to the most appropriate CRM {crm_module} properties.

Form Fields:
{json.dumps(field_data, indent=2)}

Available CRM Properties:
{json.dumps(property_data, indent=2)}

Rules:
1. Match fields based on label similarity, type compatibility, and semantic meaning
2. Common mappings: "name/full name" -> "name", "email/email address" -> "email", "phone/mobile" -> "phone"
3. Only map if confidence is high (>70%)
4. Return confidence score (0-100) for each mapping

Return ONLY valid JSON array in this exact format (no markdown, no extra text):
[
  {{"field_id": "field_uuid", "property_id": "property_api_name", "confidence": 95, "reason": "Exact label match"}},
  {{"field_id": "field_uuid2", "property_id": "property_api_name2", "confidence": 85, "reason": "Semantic similarity"}}
]
"""
        
        model = genai.GenerativeModel('models/gemini-flash-latest')
        response = model.generate_content(prompt)
        response_text = response.text.strip()
        
        if response_text.startswith("```json"):
            response_text = response_text[7:-3].strip()
        elif response_text.startswith("```"):
            response_text = response_text[3:-3].strip()
        
        mappings = json.loads(response_text)
        
        return {
            "mappings": mappings,
            "success": True
        }
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Auto-mapping failed: {str(e)}")


@router.post("/ai/process-form-request")
async def process_ai_form_request(request: dict, user: User = Depends(get_current_user)):
    """Process user input in AI Form Creator conversation"""
    user_input = request.get("user_input", "")
    metadata = request.get("metadata", {})
    
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=501, detail="AI features require GEMINI_API_KEY")
    
    try:
        model = genai.GenerativeModel('models/gemini-flash-latest')
        
        conversation_history = metadata.get('conversationHistory', [])
        purpose = metadata.get('purpose', '')
        
        context = f"""You are an AI form builder assistant helping users create forms conversationally.
        
Current conversation context:
- Form purpose: {purpose}
- Previous interactions: {len(conversation_history)}

User's current message: {user_input}

Based on the user's input, respond in a helpful, conversational way. If the user wants to:
1. Add fields: Suggest appropriate field types
2. Modify layout: Suggest 1-column, 2-column, or 3-column layouts
3. Change theme: Suggest color schemes
4. Finish: Confirm and prepare to generate the form

Respond in JSON format:
{{
    "message": "Your conversational response here",
    "shouldGenerateForm": false,
    "fields": [],
    "options": [
        {{"label": "Option text", "value": "option_value"}}
    ]
}}

If user wants to finish or generate the form, set shouldGenerateForm to true and include field types in the fields array.
"""
        
        response = model.generate_content(context)
        ai_text = response.text.strip()
        
        if '```json' in ai_text:
            json_start = ai_text.find('```json') + 7
            json_end = ai_text.find('```', json_start)
            ai_text = ai_text[json_start:json_end].strip()
        elif '```' in ai_text:
            json_start = ai_text.find('```') + 3
            json_end = ai_text.find('```', json_start)
            ai_text = ai_text[json_start:json_end].strip()
        
        try:
            result = json.loads(ai_text)
        except:
            result = {
                "message": ai_text,
                "shouldGenerateForm": False,
                "options": [
                    {"label": "Add more fields", "value": "add_more"},
                    {"label": "Customize layout", "value": "layout"},
                    {"label": "Generate form now", "value": "generate"}
                ]
            }
        
        return result
        
    except Exception as e:
        print(f"AI Form Creator error: {str(e)}")
        return {
            "message": "I understand! What would you like to do next?",
            "shouldGenerateForm": False,
            "options": [
                {"label": "Add more fields", "value": "add_more"},
                {"label": "Generate form now", "value": "generate"}
            ]
        }
