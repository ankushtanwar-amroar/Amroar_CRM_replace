import os
import logging
from typing import Optional, List
from dotenv import load_dotenv
import asyncio
import google.generativeai as genai

load_dotenv()

logger = logging.getLogger(__name__)

class EmailAIService:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.model_name = "gemini-2.5-flash"

    async def _generate_content(self, prompt: str, system_message: str) -> str:
        """Generate content using Gemini with retry logic."""
        if not self.api_key:
            raise ValueError("Missing GEMINI_API_KEY")

        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system_message,
        )

        retry_delays = [2, 5, 10]
        for attempt in range(3):
            try:
                response = await asyncio.wait_for(
                    model.generate_content_async(
                        prompt,
                        generation_config={
                            "temperature": 0.4,
                            "max_output_tokens": 2048,
                        },
                    ),
                    timeout=45.0,
                )
                text = response.text if hasattr(response, "text") else str(response)
                return (text or "").strip()
            except asyncio.TimeoutError:
                if attempt < 2:
                    await asyncio.sleep(retry_delays[attempt])
                    continue
                raise
            except Exception as e:
                error_text = str(e).lower()
                if ("429" in error_text or "quota" in error_text or "rate" in error_text) and attempt < 2:
                    await asyncio.sleep(retry_delays[attempt])
                    continue
                raise
    
    async def generate_email(
        self,
        purpose: str,
        tone: str = "professional",
        cta: Optional[str] = None,
        related_object: Optional[str] = None,
        additional_context: Optional[str] = None
    ) -> dict:
        """Generate email subject and body using AI"""
        if not self.api_key:
            return {"error": "AI service not configured"}
        
        try:
            system_message = """You are a professional sales email writer. Generate compelling sales emails that are:
- Clear and concise
- Personalized (use merge fields like {{FirstName}}, {{Company}}, etc.)
- Action-oriented with clear CTAs
- Professional yet engaging

Respond in JSON format:
{
  "subject": "email subject line",
  "body": "email body in HTML format with proper formatting"
}"""
            
            prompt = f"""Generate a sales email with the following requirements:

Purpose: {purpose}
Tone: {tone}
{f'Call to Action: {cta}' if cta else ''}
{f'Related to: {related_object}' if related_object else ''}
{f'Additional context: {additional_context}' if additional_context else ''}

Use merge fields like {{{{FirstName}}}}, {{{{LastName}}}}, {{{{Company}}}}, {{{{Email}}}} where appropriate.
Format the body as clean HTML with proper paragraph tags."""
            
            response = await self._generate_content(prompt, system_message)
            
            # Parse JSON response
            import json
            import re
            
            # Extract JSON from response
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                result = json.loads(json_match.group())
                return {
                    "subject": result.get("subject", ""),
                    "body": result.get("body", "")
                }
            
            return {"error": "Failed to parse AI response"}
            
        except Exception as e:
            logger.error(f"AI generation error: {str(e)}")
            return {"error": str(e)}
    
    async def rewrite_content(
        self,
        content: str,
        style: str = "professional"
    ) -> dict:
        """Rewrite content in a different style"""
        if not self.api_key:
            return {"error": "AI service not configured"}
        
        try:
            style_instructions = {
                "professional": "Make it more formal and business-appropriate",
                "friendly": "Make it warmer and more personable",
                "direct": "Make it more concise and to-the-point",
                "shorter": "Condense it while keeping the main points"
            }
            
            prompt = f"""Rewrite the following email content. {style_instructions.get(style, style_instructions['professional'])}.

Original content:
{content}

Provide only the rewritten content, maintaining any merge fields like {{{{FirstName}}}} exactly as they are."""
            
            response = await self._generate_content(
                prompt,
                "You are a professional email editor. Rewrite content while maintaining the original intent and any merge field placeholders."
            )
            return {"content": response.strip()}
            
        except Exception as e:
            logger.error(f"AI rewrite error: {str(e)}")
            return {"error": str(e)}
    
    async def suggest_subjects(
        self,
        email_content: str,
        count: int = 5
    ) -> dict:
        """Generate subject line suggestions"""
        if not self.api_key:
            return {"error": "AI service not configured"}
        
        try:
            prompt = f"""Based on this email content, suggest {count} compelling subject lines.
Each should be:
- Under 60 characters
- Action-oriented
- Avoid spam trigger words

Email content:
{email_content[:1000]}

Respond with a JSON array of subject lines:
["subject 1", "subject 2", ...]"""
            
            response = await self._generate_content(
                prompt,
                "You are an email marketing expert. Generate compelling subject lines."
            )
            
            import json
            import re
            
            # Extract JSON array
            json_match = re.search(r'\[[\s\S]*\]', response)
            if json_match:
                subjects = json.loads(json_match.group())
                return {"subjects": subjects[:count]}
            
            return {"error": "Failed to parse AI response"}
            
        except Exception as e:
            logger.error(f"AI subject suggestion error: {str(e)}")
            return {"error": str(e)}
    
    async def fix_grammar(
        self,
        content: str
    ) -> dict:
        """Fix grammar and spelling"""
        if not self.api_key:
            return {"error": "AI service not configured"}
        
        try:
            prompt = f"""Fix any grammar, spelling, and punctuation errors in this email content.
Maintain the original tone and style. Keep any merge fields like {{{{FirstName}}}} unchanged.

Content:
{content}

Provide only the corrected content."""
            
            response = await self._generate_content(
                prompt,
                "You are a professional editor. Fix grammar and spelling while maintaining the original voice."
            )
            return {"content": response.strip()}
            
        except Exception as e:
            logger.error(f"AI grammar fix error: {str(e)}")
            return {"error": str(e)}
    
    def check_spam_hints(self, subject: str, html_content: str, plain_text: str) -> List[dict]:
        """Check for spam risk indicators"""
        hints = []
        
        # Check subject
        if subject.isupper():
            hints.append({
                "type": "warning",
                "message": "Subject line is ALL CAPS - this may trigger spam filters"
            })
        
        spam_words = ['free', 'winner', 'congratulations', 'urgent', 'act now', 'limited time', 'click here']
        subject_lower = subject.lower()
        for word in spam_words:
            if word in subject_lower:
                hints.append({
                    "type": "warning",
                    "message": f"Subject contains potential spam trigger word: '{word}'"
                })
        
        # Check HTML content
        if html_content:
            import re
            links = re.findall(r'<a[^>]*href', html_content, re.IGNORECASE)
            if len(links) > 5:
                hints.append({
                    "type": "info",
                    "message": f"Email contains {len(links)} links - too many links may affect deliverability"
                })
        
        # Check plain text
        if html_content and not plain_text:
            hints.append({
                "type": "warning",
                "message": "No plain-text fallback - always include a plain-text version for better deliverability"
            })
        
        return hints


email_ai_service = EmailAIService()
