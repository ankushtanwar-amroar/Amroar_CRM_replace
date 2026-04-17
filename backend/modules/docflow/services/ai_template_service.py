"""
AI Template Service - Generates templates using Google Gemini
Uses GEMINI_API_KEY with Gemini model for reliable AI access
"""
import os
import json
import re
import asyncio
import google.generativeai as genai
from typing import Optional, Dict, Any, List
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Use Gemini API key for reliable AI access
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    logger.info(f"AITemplateService: Using GEMINI_API_KEY: {GEMINI_API_KEY[:8]}...{GEMINI_API_KEY[-4:]}")
else:
    logger.warning("GEMINI_API_KEY not found in environment variables")

# Model configuration
AI_PROVIDER = "gemini"
AI_MODEL = "gemini-2.5-flash"


class AITemplateService:
    def __init__(self):
        self.api_key = GEMINI_API_KEY
        if self.api_key:
            logger.info(f"AITemplateService initialized with Gemini ({AI_PROVIDER}/{AI_MODEL})")
        else:
            logger.warning("AITemplateService initialized without API key")
    
    async def _call_llm_with_retry(self, system_prompt: str, user_message: str, max_retries: int = 3) -> str:
        """Call LLM using Google Gemini with retry logic."""
        
        retry_delays = [2, 5, 10]
        genai.configure(api_key=self.api_key)
        
        for attempt in range(max_retries):
            try:
                logger.info(f"[AITemplate] LLM attempt {attempt + 1}/{max_retries} using {AI_PROVIDER}/{AI_MODEL}")

                model = genai.GenerativeModel(
                    model_name=AI_MODEL,
                    system_instruction=system_prompt
                )

                response = await asyncio.wait_for(
                    model.generate_content_async(
                        user_message,
                        generation_config={
                            "temperature": 0.3,
                            "max_output_tokens": 8192,
                        }
                    ),
                    timeout=45.0
                )
                
                text = response.text if hasattr(response, "text") else str(response)
                logger.info(f"[AITemplate] Success on attempt {attempt + 1}, response length: {len(text)}")
                return text
                
            except asyncio.TimeoutError:
                logger.warning(f"[AITemplate] Timeout on attempt {attempt + 1}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delays[attempt])
                else:
                    raise Exception("Template generation timed out")
                    
            except Exception as e:
                error_msg = str(e)
                logger.error(f"[AITemplate] Error on attempt {attempt + 1}: {error_msg}")
                
                if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                    if attempt < max_retries - 1:
                        delay = retry_delays[attempt]
                        logger.info(f"[AITemplate] Rate limited, retrying in {delay}s...")
                        await asyncio.sleep(delay)
                    else:
                        raise Exception("AI service rate limited. Please try again in a moment.")
                else:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_delays[attempt])
                    else:
                        raise
        
        raise Exception("Template generation failed after all retries")
    
    def _clean_json_response(self, text: str) -> str:
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
            return match.group(0).replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
        
        text = re.sub(r'(".*?")', fix_newlines, text, flags=re.DOTALL)
            
        # Basic cleanup for trailing commas
        text = re.sub(r',\s*\}', '}', text)
        text = re.sub(r',\s*\]', ']', text)
        
        # Remove single-line comments (// ...) that AI sometimes adds inside JSON
        text = re.sub(r'//[^\n]*', '', text)
        
        return text.strip()

    async def generate_template(self, prompt: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generate template HTML from natural language prompt
        OPTIMIZED: Uses Gemini with timeout, retry logic, and better error handling
        """
        if not self.api_key:
            return {"success": False, "error": "AI Service not configured (Missing GEMINI_API_KEY)"}

        industry = context.get('industry', 'General') if context else 'General'
        doc_type = context.get('selected_doc_type', 'General Document') if context else 'General Document'
        base_prompt = context.get('base_prompt', '') if context else ''

        system_prompt = f"""
        You are generating a professional business-ready legal/commercial document draft for DocFlow.

        Document type: {doc_type}
        Industry context: {industry}
        Base Type Instruction: {base_prompt}
        User instruction: {prompt}

        Generate a clean, structured, formal draft suitable for business review.
        Use plain professional legal language.
        Include clear section headings using <h1>, <h2> tags, numbered clauses, and editable placeholders in brackets.

        Important requirements:
        - FORMATTING: Use semantic HTML (<p>, <ul>, <li>, <br/>) for ALL spacing and structure.
        - CRITICAL: DO NOT use the literal characters "\\n" or "\n" anywhere in the document text. Use HTML tags for newlines.
        - Do not invent company names, addresses, dates, pricing, laws, or governing jurisdictions unless the user provides them.
        - Use placeholders like [Client Name], [Effective Date], [Service Provider Name], [Jurisdiction], [Fees], [Data Retention Period].
        - Include only sections relevant to the selected document type.
        - Avoid unnecessary legal complexity, but ensure the draft looks complete and business-grade.
        - Where relevant, include confidentiality, data protection, security, term, termination, liability, dispute resolution, and signature blocks.
        - Output the result as a polished final draft in HTML format, not as notes or commentary.
        - Keep the document concise but complete - target under 2000 words for faster generation.

        Return ONLY a valid JSON response.

        JSON Structure:
        {{
        "html": "<html>...</html>",
        "suggested_name": "Industry - Document Type",
        "description": "Brief professional description"
        }}
        """

        try:
            logger.info(f"[AITemplate] Generating template for: {doc_type}")
            
            raw_text = await self._call_llm_with_retry(
                system_prompt=system_prompt,
                user_message=f"User Request: {prompt}"
            )
            
            logger.info(f"[AITemplate] Response received, length: {len(raw_text)} chars")
            
            try:
                cleaned_text = self._clean_json_response(raw_text)
                data = json.loads(cleaned_text)
                
                return {
                    "success": True,
                    "html": data.get("html", ""),
                    "merge_fields": data.get("merge_fields", []),
                    "suggested_name": data.get("suggested_name", "Untitled Template"),
                    "description": data.get("description", "")
                }
            except Exception as e:
                logger.error(f"[AITemplate] JSON parsing failed: {str(e)} | Raw: {raw_text[:200]}...")
                return {"success": False, "error": f"Failed to parse AI response: {str(e)}"}

        except Exception as e:
            error_msg = str(e)
            logger.error(f"[AITemplate] Generation error: {error_msg}")
            if "quota" in error_msg.lower() or "rate" in error_msg.lower():
                return {
                    "success": False, 
                    "error_type": "quota_exceeded",
                    "error": "AI service busy. Please try again in a few seconds.",
                    "retry_after": 5
                }
            return {"success": False, "error": f"AI Generation error: {error_msg}"}

    async def process_visual_command(self, instruction: str, current_fields: list, page_count: int) -> Dict[str, Any]:
        """Process visual builder AI commands (Add, Move, Rename)"""
        if not self.api_key:
            return {"success": False, "error": "AI Service not configured (Missing GEMINI_API_KEY)"}

        system_prompt = f"""
You are an expert UI/UX layout assistant for Cluvik DocFlow Visual Builder.
The builder uses a grid system of 10px. Page size is 800x1100 per page.

Current fields: {json.dumps(current_fields)}
Page count: {page_count}

Task: Update the field list based on user instructions.

Rules:
1. Return a COMPLETE list of fields in the updated state.
2. For "add" commands, create a new field with a unique ID and reasonable placement.
3. For "move"/"align" commands, modify x, y, or page.
4. For "delete"/"remove" commands, filter them out.
5. For "rename" commands, update the label/name.
6. Keep x between 0 and 750 (max width 800).
7. Keep y between 0 and 1050 (max height 1100).
8. Use page {page_count} as the "end of document" if requested.

Return ONLY a valid JSON list of objects. No markdown formatting, just the array.
CRITICAL: Use proper JSON escaping. All newlines inside text values MUST be escaped as \\n. Do not include raw newlines within JSON string values.
"""

        try:
            raw_text = await self._call_llm_with_retry(
                system_prompt=system_prompt,
                user_message=f"User Instruction: {instruction}"
            )
            
            cleaned_text = self._clean_json_response(raw_text)
            
            updated_fields = json.loads(cleaned_text)
            
            if not isinstance(updated_fields, list):
                if isinstance(updated_fields, dict) and "fields" in updated_fields:
                    updated_fields = updated_fields["fields"]
                else:
                    raise ValueError("AI response must be a JSON array of fields")

            return {
                "success": True,
                "fields": updated_fields
            }

        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower():
                return {
                    "success": False,
                    "error_type": "quota_exceeded",
                    "error": "AI service busy. Please try again in a few seconds.",
                    "retry_after": 5
                }
            return {"success": False, "error": f"Visual Assistant error: {error_msg}"}
