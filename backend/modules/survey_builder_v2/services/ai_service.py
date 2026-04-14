"""
AI Service for Survey Builder - Using Same Config as Form Builder
"""
import json
import os
import secrets
from typing import Dict, Any, List
from uuid import uuid4
import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


class SurveyAIService:
    
    @staticmethod
    async def process_command(command: str, survey_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Process natural language commands - Using Gemini"""
        
        try:
            system_message = """You are an expert Survey Builder AI. You understand natural language and modify surveys in real-time.

Question Types Available:
- short_text, long_text, email, phone, date
- multiple_choice, checkbox, dropdown, yes_no
- rating (1-5 stars), nps (0-10), likert (5-point scale)
- matrix, file_upload, page_break

Your Capabilities:
1. ADD questions: "Add email question", "Add NPS question"
2. EDIT questions: "Change question 1 to required", "Edit last question label"
3. DELETE questions: "Remove question 2", "Delete last question"
4. REARRANGE: "Move question 1 to position 3"
5. CREATE SURVEYS: "Make a customer feedback survey", "Create employee satisfaction survey"
6. THEME: "Change button color to blue", "Set background to white"
7. LAYOUT: "Switch to one question per page"

ALWAYS return valid JSON in this exact format:
{
  "action": "add_question" | "edit_question" | "delete_question" | "create_survey" | "rearrange" | "theme_update" | "layout_change",
  "data": {
    // For add_question:
    "questions": [{"id": "q_uuid", "type": "rating", "label": "How satisfied are you?", "required": true, "order": 0, "page": 1, "options": []}]
    
    // For create_survey:
    "title": "Customer Satisfaction Survey",
    "description": "Help us improve",
    "questions": [...]
    
    // For theme_update:
    "theme": {"button_color": "#3b82f6", "background_color": "#ffffff"}
    
    // For layout_change:
    "layout": "one_per_page" | "scroll" | "card"
    
    // For delete_question:
    "question_index": 0
    
    // For edit_question:
    "question_index": 0,
    "updates": {"required": true, "label": "New label"}
  },
  "message": "Added NPS question to your survey"
}

RULES:
1. Generate unique IDs: q_{random}
2. When creating surveys, include 5-10 questions
3. Use appropriate question types
4. Set order and page correctly
5. Return ONLY JSON, no markdown
6. If unclear, choose most logical interpretation"""

            if survey_data:
                system_message += f"\n\nCurrent Survey: {len(survey_data.get('questions', []))} questions"
            
            # Use Gemini - Same model as Form Builder
            model = genai.GenerativeModel('models/gemini-flash-latest')
            
            full_prompt = f"{system_message}\n\nUser Command: {command}\n\nReturn JSON response:"
            
            response = model.generate_content(full_prompt)
            result_text = response.text.strip()
            
            # Clean response
            if result_text.startswith('```json'):
                result_text = result_text.replace('```json', '').replace('```', '').strip()
            elif result_text.startswith('```'):
                result_text = result_text.replace('```', '').strip()
            
            # Parse JSON
            result = json.loads(result_text)
            
            # Ensure IDs
            if 'data' in result and 'questions' in result['data']:
                for q in result['data']['questions']:
                    if 'id' not in q or not q['id']:
                        q['id'] = f"q_{uuid4().hex[:12]}"
            
            return result
            
        except json.JSONDecodeError as e:
            return {
                "action": "chat",
                "message": f"I understood: '{command}', but had trouble formatting. Please try rephrasing.",
                "error": str(e)
            }
        except Exception as e:
            return {
                "error": str(e),
                "message": f"Error: {str(e)}"
            }
    
    @staticmethod
    async def generate_survey(prompt: str) -> Dict[str, Any]:
        """Generate complete survey from prompt"""
        
        try:
            system_message = """You are an expert survey designer. Generate professional surveys.

Question types: short_text, long_text, email, phone, date, multiple_choice, checkbox, dropdown, rating, nps, likert, yes_no, matrix, file_upload

Return ONLY valid JSON (no markdown):
{
  "action": "create_survey",
  "data": {
    "title": "Survey Title",
    "description": "Brief description",
    "questions": [
      {
        "id": "q_unique_id",
        "type": "rating",
        "label": "Question text?",
        "description": "Helper text",
        "required": true,
        "order": 0,
        "page": 1,
        "options": [{"id": "opt1", "label": "Option 1", "value": "option_1"}],
        "min_value": 1,
        "max_value": 5
      }
    ]
  },
  "message": "Created 5-question survey"
}

Rules:
1. Generate 5-10 questions
2. Mix question types
3. Unique IDs for all
4. Proper order (0,1,2...)
5. Add options for choice questions
6. Return ONLY JSON"""

            model = genai.GenerativeModel('models/gemini-flash-latest')
            full_prompt = f"{system_message}\n\nGenerate survey: {prompt}\n\nReturn JSON:"
            
            response = model.generate_content(full_prompt)
            result_text = response.text.strip().replace('```json', '').replace('```', '').strip()
            
            result = json.loads(result_text)
            
            # Ensure IDs
            if 'data' in result and 'questions' in result['data']:
                for q in result['data']['questions']:
                    if 'id' not in q:
                        q['id'] = f"q_{uuid4().hex[:12]}"
            
            return result
            
        except Exception as e:
            return {"error": str(e)}
    
    @staticmethod
    async def analyze_responses(responses: List[Dict[str, Any]], survey_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """AI analysis"""
        
        try:
            model = genai.GenerativeModel('models/gemini-flash-latest')
            prompt = f"Analyze {len(responses)} survey responses. Return JSON: {{\"findings\": [...], \"sentiment\": {{...}}, \"themes\": [...], \"recommendations\": [...]}}"
            
            response = model.generate_content(prompt)
            result_text = response.text.strip().replace('```json', '').replace('```', '').strip()
            return json.loads(result_text)
        except:
            return {"findings": [], "sentiment": {}, "themes": [], "recommendations": []}
    
    @staticmethod
    async def suggest_logic_rules(survey_data: Dict[str, Any]) -> Dict[str, Any]:
        """Suggest logic rules"""
        try:
            model = genai.GenerativeModel('models/gemini-flash-latest')
            prompt = "Suggest conditional logic rules. Return JSON: {\"suggestions\": [...]}"
            response = model.generate_content(prompt)
            result_text = response.text.strip().replace('```json', '').replace('```', '').strip()
            return json.loads(result_text)
        except:
            return {"suggestions": []}
    
    @staticmethod
    async def generate_pdf_report(survey_data: Dict[str, Any], responses: List[Dict[str, Any]], analytics: Dict[str, Any]) -> Dict[str, Any]:
        """Generate PDF report"""
        try:
            model = genai.GenerativeModel('models/gemini-flash-latest')
            prompt = f"Generate executive summary for survey with {len(responses)} responses. Return JSON: {{\"executive_summary\": \"...\", \"highlights\": [...]}}"
            response = model.generate_content(prompt)
            result_text = response.text.strip().replace('```json', '').replace('```', '').strip()
            return json.loads(result_text)
        except:
            return {"executive_summary": "Report unavailable"}
