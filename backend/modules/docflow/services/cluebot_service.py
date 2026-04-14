"""
ClueBot AI Service - Chat-based AI assistant for DocFlow template builder
Uses Emergent LLM Key with Gemini model for reliable AI access
"""
import os
import json
import re
import asyncio
from typing import Dict, Any, List, Optional
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Use Emergent LLM Key for reliable AI access
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
if EMERGENT_LLM_KEY:
    logger.info(f"ClueBot: Using Emergent LLM Key: {EMERGENT_LLM_KEY[:15]}...{EMERGENT_LLM_KEY[-4:]}")
else:
    logger.warning("EMERGENT_LLM_KEY not found in environment variables")

# Model configuration
AI_PROVIDER = "gemini"
AI_MODEL = "gemini-2.5-flash"


class ClueBotService:
    """ClueBot AI Assistant — chat, validation, email generation using Emergent LLM"""

    def __init__(self, db=None):
        self.db = db
        self.api_key = EMERGENT_LLM_KEY
        if self.api_key:
            logger.info(f"ClueBotService initialized with Emergent LLM ({AI_PROVIDER}/{AI_MODEL})")
        else:
            logger.warning("ClueBotService initialized without API key")
    
    async def _call_llm_with_retry(self, system_prompt: str, user_message: str, max_retries: int = 3) -> str:
        """
        Call LLM using Emergent Integrations with retry logic.
        """
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        retry_delays = [2, 5, 10]
        
        for attempt in range(max_retries):
            try:
                logger.info(f"[ClueBot LLM] Attempt {attempt + 1}/{max_retries} using {AI_PROVIDER}/{AI_MODEL}")
                
                # Create chat instance
                chat = LlmChat(
                    api_key=self.api_key,
                    session_id=f"cluebot_{attempt}",
                    system_message=system_prompt
                ).with_model(AI_PROVIDER, AI_MODEL)
                
                # Send message
                message = UserMessage(text=user_message)
                response = await chat.send_message(message)
                
                logger.info(f"[ClueBot LLM] Success on attempt {attempt + 1}, response length: {len(str(response))}")
                return str(response)
                
            except Exception as e:
                error_msg = str(e)
                logger.error(f"[ClueBot LLM] Error on attempt {attempt + 1}: {error_msg[:200]}")
                
                if attempt < max_retries - 1:
                    delay = retry_delays[attempt]
                    logger.info(f"[ClueBot LLM] Retrying in {delay}s...")
                    await asyncio.sleep(delay)
                else:
                    raise Exception(f"AI service error: {error_msg[:100]}")
        
        raise Exception("AI request failed after all retries")

    def _clean_json(self, text: str) -> str:
        """Helper to sanitize AI response for JSON parsing"""
        # Remove markdown code blocks
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*', '', text)
        
        # Extract content between first { and last } (for objects) or [ and ] (for lists)
        obj_match = re.search(r'\{[\s\S]*\}', text)
        list_match = re.search(r'\[[\s\S]*\]', text)
        
        if obj_match and list_match:
            text = obj_match.group(0) if obj_match.start() < list_match.start() else list_match.group(0)
        elif obj_match:
            text = obj_match.group(0)
        elif list_match:
            text = list_match.group(0)

        # CRITICAL FIX: Replace raw newlines inside JSON string values with \n
        def fix_newlines(match):
            return match.group(0).replace('\n', '\\n').replace('\r', '\\r')
        
        text = re.sub(r'(".*?")', fix_newlines, text, flags=re.DOTALL)
            
        # Basic cleanup for trailing commas
        text = re.sub(r',\s*\}', '}', text)
        text = re.sub(r',\s*\]', ']', text)
        
        return text.strip()

    # ───────────────────────────────────────────────
    # A. Template Builder Assistant (Chat) - ACTION EXECUTOR MODE
    # ───────────────────────────────────────────────
    async def chat(self, message: str, context: Dict[str, Any] = None, policy_context: Dict[str, str] = None) -> Dict[str, Any]:
        """
        Process chat messages and EXECUTE actions directly.
        Supports both field operations AND document content editing via structured blocks.
        policy_context: optional dict with intent, personality, knowledge_context from CluBot config.
        """
        if not self.api_key:
            return {"success": False, "error": "AI Service not configured (Missing EMERGENT_LLM_KEY)"}

        ctx = context or {}
        pc = policy_context or {}
        current_fields = ctx.get("fields", [])
        content_blocks = ctx.get("content_blocks", [])
        selected_text = ctx.get("selected_text", "")
        selected_block_id = ctx.get("selected_block_id", "")
        page_count = ctx.get("page_count", 1) or 1
        template_name = ctx.get("template_name", "Untitled")
        recipients = ctx.get("recipients", [])

        # Build fields description for AI context
        fields_desc = []
        for f in current_fields:
            fields_desc.append({
                "id": f.get("id"),
                "type": f.get("type"),
                "label": f.get("label", f.get("name", "")),
                "page": f.get("page", 1),
                "x": f.get("x", 0),
                "y": f.get("y", 0)
            })

        # Build content blocks summary for AI context
        blocks_desc = []
        for b in content_blocks[:50]:
            plain = b.get("content", "")
            if b.get("type") == "list":
                plain = " | ".join(b.get("items", [])[:5])
            blocks_desc.append({
                "id": b.get("id"),
                "type": b.get("type"),
                "level": b.get("level"),
                "text_preview": plain[:120]
            })

        # Selection context
        selection_context = ""
        if selected_text:
            selection_context = f'\nUser has selected text: "{selected_text}"'
            if selected_block_id:
                selection_context += f' (in block ID: {selected_block_id})'

        has_content_blocks = len(content_blocks) > 0

        # Build knowledge section for system prompt
        knowledge_section = ""
        if pc.get("knowledge_context"):
            knowledge_section = f"COMPANY KNOWLEDGE (use this to inform your responses):\n{pc['knowledge_context']}"

        personality_line = f"PERSONALITY: {pc['personality']}" if pc.get("personality") else ""
        intent_line = f"INTENT: {pc['intent']}" if pc.get("intent") else ""

        system_prompt = f"""You are ClueBot, an AI ACTION EXECUTOR for DocFlow template builder.
{personality_line}
{intent_line}

CRITICAL: You are NOT a chatbot. You are an ACTION EXECUTOR.
- NEVER ask questions or confirmations
- ALWAYS execute the action directly
- Return valid JSON only

{knowledge_section}

Current template: "{template_name}"
Current fields (total: {len(current_fields)}): {json.dumps(fields_desc[:20])}
Page count: {page_count}
Recipients: {json.dumps(recipients[:5])}
{f'Content blocks (total: {len(content_blocks)}): {json.dumps(blocks_desc)}' if has_content_blocks else 'No editable content blocks available.'}
{selection_context}

MANDATORY ACTIONS:

--- FIELD ACTIONS ---
1. ADD_FIELD: Add overlay field (signature, text input, date, checkbox, etc.)
2. RENAME_FIELD: Rename a field label
3. MOVE_FIELD: Move a field position
4. DELETE_FIELD: Remove a field

--- DOCUMENT CONTENT ACTIONS ---
5. EDIT_CONTENT: Edit actual document text (headings, paragraphs, clauses)
   USE THIS when user wants to change document TEXT, not form fields.
   Examples: "Replace Project Title with Name", "Update clause 2", "Change heading"
   
   For EDIT_CONTENT you MUST return "block_edits" — an array of edits:
   Each edit: {{"block_id": "...", "action": "update|delete|insert_after", "updates": {{...}}}}
   
   For "update" action, include the changed properties in "updates":
   - For heading/paragraph: {{"content": "new text"}}
   - For list: {{"items": ["item1", "item2"]}}
   - To change type: {{"type": "heading", "level": 2, "content": "new text"}}
   
   For "delete" action: just the block_id
   For "insert_after" action: {{"block_id": "...", "action": "insert_after", "new_block": {{"type": "paragraph", "content": "..."}}}}

6. ANSWER: General response (no changes)

RESPONSE FORMAT:
{{
  "action": "ADD_FIELD|RENAME_FIELD|MOVE_FIELD|DELETE_FIELD|EDIT_CONTENT|ANSWER",
  "response": "Done! [describe what was changed]",
  "field_updates": [...],     // For field actions only
  "new_field": {{}},          // For ADD_FIELD only
  "block_edits": [...]        // For EDIT_CONTENT only
}}

DECISION LOGIC:
- If user says "add signature/text/date field" → ADD_FIELD
- If user says "replace X with Y" or "change heading" or "update clause" or "edit text" → EDIT_CONTENT
- If user mentions field labels or field types → field action
- If user mentions document text, headings, paragraphs, clauses → EDIT_CONTENT
{'- If user selected text, prefer EDIT_CONTENT targeting the selected block' if selected_text else ''}

FIELD OBJECT: {{"id":"field_...","type":"signature|text|date|initials|label|merge|checkbox","label":"...","page":1,"x":100,"y":500,"width":200,"height":40,"required":true}}

RULES:
- Page: 800x1100px. x: 50-700, y: 50-1050
- NEVER respond with questions
- ALWAYS execute and confirm with description
"""

        try:
            logger.info(f"[ClueBot] Processing command: {message[:80]}... (blocks: {len(content_blocks)}, selected: '{selected_text[:30] if selected_text else ''}')")
            
            raw = await self._call_llm_with_retry(
                system_prompt=system_prompt,
                user_message=f"User Command: {message}"
            )
            
            logger.info(f"[ClueBot] AI response received, length: {len(raw)} chars")
            cleaned = self._clean_json(raw)
            
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError as e:
                logger.error(f"ClueBot JSON parse error: {e}, raw: {raw[:500]}")
                return self._create_fallback_response(message, current_fields, page_count, content_blocks, selected_text)
            
            action = data.get("action", "ANSWER")
            logger.info(f"[ClueBot] Action determined: {action}")
            
            # Handle field actions
            if action in ["ADD_FIELD", "RENAME_FIELD", "MOVE_FIELD", "DELETE_FIELD"]:
                if not data.get("field_updates"):
                    data["field_updates"] = self._apply_action(action, data, current_fields, page_count)
                logger.info(f"[ClueBot] Field updates: {len(data.get('field_updates', []))} fields")
            
            # Handle content editing
            if action == "EDIT_CONTENT":
                block_edits = data.get("block_edits", [])
                if not block_edits:
                    # Try to build block_edits from legacy content_edit format
                    block_edits = self._legacy_to_block_edits(data, content_blocks, selected_text, selected_block_id)
                    data["block_edits"] = block_edits
                logger.info(f"[ClueBot] Block edits: {len(block_edits)} edits")
            
            # Ensure response confirms action
            if action != "ANSWER" and not data.get("response", "").startswith("✅"):
                data["response"] = "✅ " + data.get("response", "Action completed!")
            
            return {"success": True, **data}
            
        except Exception as e:
            error_msg = str(e)
            logger.error(f"ClueBot chat error: {error_msg}")
            if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                return {"success": False, "error": "AI service busy. Please try again in a few seconds.", "retry_after": 5}
            return {"success": False, "error": f"ClueBot error: {error_msg}"}

    def _apply_action(self, action: str, data: Dict, current_fields: List, page_count: int) -> List:
        """Apply the action to fields if AI didn't return field_updates"""
        import time
        
        fields = list(current_fields)  # Copy
        
        if action == "ADD_FIELD":
            new_field = data.get("new_field", {})
            if new_field:
                if not new_field.get("id"):
                    new_field["id"] = f"field_{int(time.time() * 1000)}"
                fields.append(new_field)
            else:
                fields.append({
                    "id": f"field_{int(time.time() * 1000)}",
                    "type": "text",
                    "label": "New Field",
                    "name": "new_field",
                    "page": 1,
                    "x": 100,
                    "y": 500,
                    "width": 200,
                    "height": 40,
                    "required": False
                })
        
        return fields

    def _legacy_to_block_edits(self, data: Dict, content_blocks: List, selected_text: str, selected_block_id: str) -> List[Dict]:
        """Convert legacy content_edit format or free-text intent to block_edits."""
        from .content_block_service import find_block_by_text
        
        edits = []
        content_edit = data.get("content_edit", {})
        
        # If there's a selected block, target that
        if selected_block_id:
            target_block = next((b for b in content_blocks if b["id"] == selected_block_id), None)
            if target_block:
                new_content = content_edit.get("replace") or content_edit.get("new_text") or data.get("response", "")
                if new_content and not new_content.startswith("✅"):
                    edits.append({
                        "block_id": selected_block_id,
                        "action": "update",
                        "updates": {"content": new_content}
                    })
                return edits
        
        # Try find/replace on content_edit
        find_text = content_edit.get("find", "")
        replace_text = content_edit.get("replace", "")
        
        if find_text and content_blocks:
            target = find_block_by_text(content_blocks, find_text)
            if target:
                import re as _re
                current = target.get("content", "")
                new_content = _re.sub(_re.escape(find_text), replace_text, current, flags=_re.IGNORECASE)
                edits.append({
                    "block_id": target["id"],
                    "action": "update",
                    "updates": {"content": new_content}
                })
        
        # If still no edits but selected_text was provided, try to find it
        if not edits and selected_text and content_blocks:
            target = find_block_by_text(content_blocks, selected_text)
            if target:
                edits.append({
                    "block_id": target["id"],
                    "action": "update",
                    "updates": {"content": replace_text or target.get("content", "")}
                })
        
        return edits

    def _create_fallback_response(self, message: str, current_fields: List, page_count: int, content_blocks: List = None, selected_text: str = "") -> Dict:
        """Create a fallback response when AI parsing fails"""
        import time
        
        msg_lower = message.lower()
        
        # Detect add commands
        if any(word in msg_lower for word in ["add", "create", "insert", "put", "place"]):
            field_type = "text"
            if "signature" in msg_lower:
                field_type = "signature"
            elif "date" in msg_lower:
                field_type = "date"
            elif "initial" in msg_lower:
                field_type = "initials"
            elif "checkbox" in msg_lower or "check" in msg_lower:
                field_type = "checkbox"
            
            # Detect page number
            page = 1
            import re
            page_match = re.search(r'page\s*(\d+)', msg_lower)
            if page_match:
                page = min(int(page_match.group(1)), page_count)
            
            new_field = {
                "id": f"field_{int(time.time() * 1000)}",
                "type": field_type,
                "label": field_type.capitalize() + " Field",
                "name": f"{field_type}_field",
                "page": page,
                "x": 100,
                "y": 500,
                "width": 200,
                "height": 60 if field_type == "signature" else 40,
                "required": True
            }
            
            updated_fields = list(current_fields) + [new_field]
            
            return {
                "success": True,
                "action": "ADD_FIELD",
                "response": f"✅ Added {field_type} field on page {page}",
                "field_updates": updated_fields,
                "new_field": new_field
            }
        
        # Detect rename commands
        if any(word in msg_lower for word in ["rename", "change", "update", "modify"]):
            # Check if this is a content edit (not a field rename)
            if content_blocks and any(word in msg_lower for word in ["heading", "title", "clause", "paragraph", "text", "content", "section"]):
                return {
                    "success": True,
                    "action": "EDIT_CONTENT",
                    "response": "Content editing requires specific instructions. Try: 'Replace Project Title with Name' or 'Change heading to Confidential Agreement'",
                    "block_edits": []
                }
            return {
                "success": True,
                "action": "ANSWER",
                "response": "Please specify which field to rename and the new name. Example: 'Rename Signature to Client Signature'"
            }
        
        # Detect content editing commands
        if content_blocks and any(word in msg_lower for word in ["replace", "edit", "rewrite"]):
            return {
                "success": True,
                "action": "EDIT_CONTENT",
                "response": "Please specify what to change. Example: 'Replace Project Title with Name'",
                "block_edits": []
            }
        
        return {
            "success": True,
            "action": "ANSWER",
            "response": "I can help you edit document content, add/rename/move/delete fields. Try: 'Replace Project Title with Name' or 'Add a signature field on page 1'"
        }

    # ───────────────────────────────────────────────
    # B. Email Generation
    # ───────────────────────────────────────────────
    async def generate_email(
        self,
        template_name: str,
        recipient_name: str = "",
        document_url: str = "",
        custom_prompt: str = "",
        policy_context: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """Generate professional email subject and body for document delivery."""
        if not self.api_key:
            return {"success": False, "error": "AI Service not configured (Missing EMERGENT_LLM_KEY)"}

        pc = policy_context or {}

        personality_line = f"PERSONALITY: {pc['personality']}" if pc.get("personality") else ""

        system_prompt = f"""You are ClueBot, an AI email assistant for DocFlow.
{personality_line}
Generate a professional email for document delivery.

Document: "{template_name}"
Recipient: "{recipient_name or 'the recipient'}"
Document Link: "{document_url or '[Document Link]'}"

{f'Additional instructions: {custom_prompt}' if custom_prompt else ''}

Requirements:
- Professional, concise tone
- Include the document link
- Include recipient name
- Include document name
- Clear call to action

Return JSON:
{{
  "subject": "Email subject line",
  "body": "Full email body text (plain text, use \\n for line breaks)",
  "html_body": "<html email body>"
}}

CRITICAL: Return valid JSON only."""

        try:
            raw = await self._call_llm_with_retry(
                system_prompt=system_prompt,
                user_message="Generate the email now."
            )
            cleaned = self._clean_json(raw)
            data = json.loads(cleaned)
            return {"success": True, **data}
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower():
                return {"success": False, "error": "AI quota exceeded. Try again in 60 seconds.", "retry_after": 60}
            return {"success": False, "error": f"Email generation error: {error_msg}"}

    # ───────────────────────────────────────────────
    # C. AI Validation (Advisory — does NOT block save)
    # ───────────────────────────────────────────────
    async def validate_template_ai(self, template_data: Dict[str, Any], policy_context: Dict[str, str] = None) -> Dict[str, Any]:
        """
        Run AI-based validation on a template.
        Checks: content clarity, missing clauses, signing flow, business completeness.
        Returns suggestions + score. Does NOT block save.
        """
        if not self.api_key:
            return {"success": False, "error": "AI Service not configured (Missing EMERGENT_LLM_KEY)"}

        pc = policy_context or {}

        field_placements = template_data.get("field_placements", [])
        recipients = template_data.get("recipients", [])
        crm_connection = template_data.get("crm_connection", {})
        template_name = template_data.get("name", "Untitled")
        template_type = template_data.get("template_type", "custom")
        html_content = (template_data.get("html_content") or "")[:2000]

        personality_line = f"PERSONALITY: {pc['personality']}" if pc.get("personality") else ""
        knowledge_section = f"COMPANY KNOWLEDGE:\n{pc['knowledge_context']}" if pc.get("knowledge_context") else ""

        system_prompt = f"""You are ClueBot, an AI validation assistant for DocFlow templates.
{personality_line}
Analyze this template and provide improvement suggestions.
{knowledge_section}

Template: "{template_name}" (Type: {template_type})
Field placements: {len(field_placements)} fields
Signature fields: {len([f for f in field_placements if f.get('type') == 'signature'])}
Recipients: {len(recipients)} configured
CRM Connection: {crm_connection.get('provider', 'none')} — Object: {crm_connection.get('object_name', 'none')}
Content preview: {html_content[:500] if html_content else 'No HTML content'}

Check for:
1. Content clarity — is the document well-structured?
2. Missing clauses — for the template type, are standard sections present?
3. Signing flow issues — are signature fields assigned to recipients?
4. Recipient issues — enough recipients configured?
5. Business completeness — necessary info present for the template type?

Return JSON:
{{
  "score": 85,
  "suggestions": [
    {{
      "category": "Content|Signing|Recipients|Clauses|Completeness",
      "severity": "info|warning|critical",
      "message": "Clear, actionable suggestion"
    }}
  ],
  "summary": "One-line overall assessment"
}}

CRITICAL: Return valid JSON only."""

        try:
            raw = await self._call_llm_with_retry(
                system_prompt=system_prompt,
                user_message="Validate this template now."
            )
            cleaned = self._clean_json(raw)
            data = json.loads(cleaned)
            return {"success": True, **data}
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower():
                return {"success": False, "error": "AI quota exceeded. Try again in 60 seconds.", "retry_after": 60}
            return {"success": False, "error": f"AI Validation error: {error_msg}"}
