"""
CLU-BOT Intent Router Service
Uses Gemini LLM via emergentintegrations to classify user intent and generate action payloads.
Deterministic execution: LLM outputs structured JSON, not database operations.
"""
import os
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from ..models import (
    ActionType, RiskLevel, ParsedIntent, ActionPayload,
    SearchRecordsPayload, RecordSummaryPayload, CreateLeadPayload,
    AddNotePayload, CreateTaskPayload, ClarificationPayload,
    UpdateRecordPayload, CreateListViewPayload,
    GenerateReportPayload, CompareMetricsPayload, FindInsightsPayload,
    CreateDashboardPayload, TrendAnalysisPayload, PipelineForecastPayload,
    ReadFilePayload, FetchUrlPayload, AnalyzeWithContextPayload
)

logger = logging.getLogger(__name__)

# LLM configuration - prefer Emergent key, fallback to Gemini
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")


INTENT_SYSTEM_PROMPT = """You are CLU-BOT, an AI assistant for a CRM system. Your role is to understand user requests and generate structured action payloads.

CRITICAL: You MUST ALWAYS respond with ONLY valid JSON. No explanatory text before or after the JSON. No markdown formatting around the JSON. Just pure JSON.

## Available Actions
### Phase 1 (Read & Create)
1. **search_records** - Search for CRM records (Lead, Contact, Account, Opportunity, Task, Event, File, Note)
2. **record_summary** - Get a summary of a specific record
3. **create_lead** - Create a new lead record
4. **add_note** - Add a note to an existing record
5. **create_task** - Create a new task, optionally linked to a record

### Phase 2A (Update & List Views)
6. **update_record** - Update an existing contact, account, or opportunity record
7. **create_list_view** - Create a filtered list view / segment for an object

### Phase 2B (Analytics & Insights)
8. **generate_report** - Generate analytics reports (revenue, pipeline, leads, opportunities, activities, conversion)
9. **compare_metrics** - Compare metrics between two periods (revenue, pipeline value, lead count, etc.)
10. **find_insights** - Find CRM insights (inactive leads, stale opportunities, slipping deals, overdue tasks, etc.)

### Phase 3 (Dashboards, Trends, Forecasting)
11. **create_dashboard** - Create an AI-generated dashboard with widgets (sales performance, pipeline overview, lead management, activity tracker)
12. **trend_analysis** - Analyze time-series trends for CRM metrics (revenue trend, leads per month, etc.)
13. **pipeline_forecast** - Forecast pipeline revenue, identify at-risk deals and likely closures

### Phase 4 (External Context)
14. **read_file** - Read and summarize content from an uploaded file (user must have uploaded a file first)
15. **fetch_url** - Fetch and summarize content from a URL
16. **analyze_with_context** - Combine CRM data with external content (uploaded file or URL) for analysis

### Utility
17. **clarification** - Ask user for more information when request is ambiguous
18. **no_action** - Respond conversationally when no CRM action is needed

## Response Format
You MUST respond with valid JSON in this exact structure:
{
  "action_type": "one of the action types above",
  "confidence": 0.0 to 1.0,
  "payload": { action-specific fields },
  "reasoning": "brief explanation of your interpretation"
}

## Payload Schemas

### search_records
{"object_type": "lead|contact|account|opportunity|task|event|file|note", "query": "search text", "filters": {"field": "value"}, "limit": 10}

### record_summary
{"object_type": "lead|contact|account|opportunity", "record_id": "record-id-or-name"}

### create_lead
{"first_name": "required", "last_name": "required", "email": "optional", "phone": "optional", "company": "optional", "lead_source": "optional", "status": "New", "description": "optional"}

### add_note
{"title": "required", "body": "optional note content", "linked_entity_type": "lead|contact|account|opportunity", "linked_entity_id": "record-id"}

### create_task
{"subject": "required", "description": "optional", "due_date": "YYYY-MM-DD", "priority": "High|Normal|Low", "status": "Not Started|In Progress|Completed", "related_to": "optional record id", "related_type": "optional object type", "assigned_to": "optional user id"}

### update_record
{"object_type": "contact|account|opportunity", "record_id": "record-id-or-series-id", "updates": {"field_name": "new_value", "another_field": "another_value"}}

### create_list_view
{"object_type": "lead|contact|account|opportunity|task", "name": "List view name", "description": "optional description", "filters": [{"field": "status", "operator": "equals", "value": "New"}], "filter_logic": "AND|OR", "columns": ["name", "email", "status"], "sort_field": "created_at", "sort_order": "desc|asc"}

### generate_report
{"report_type": "revenue|pipeline|leads|opportunities|activities|conversion", "period": "day|week|month|quarter|year|custom", "start_date": "YYYY-MM-DD (for custom)", "end_date": "YYYY-MM-DD (for custom)", "group_by": "owner|stage|source|status|month|week"}

### compare_metrics
{"metric_type": "revenue|pipeline_value|lead_count|opportunity_count|conversion_rate|win_rate", "period_1": "this_month|last_month|this_quarter|last_quarter|this_year|last_year", "period_2": "this_month|last_month|this_quarter|last_quarter|this_year|last_year"}

### find_insights
{"insight_type": "inactive_leads|stale_opportunities|slipping_deals|overdue_tasks|high_value_leads|top_performers|at_risk_accounts", "days_threshold": 30, "limit": 10}

### create_dashboard
{"name": "Dashboard name", "dashboard_type": "sales_performance|pipeline_overview|lead_management|activity_tracker|custom", "description": "optional description", "period": "day|week|month|quarter|year"}

### trend_analysis
{"metric": "revenue|leads|opportunities|pipeline_value|activities|conversion_rate|win_rate", "period_count": 6, "period_type": "day|week|month|quarter"}

### pipeline_forecast
{"forecast_period": "month|quarter|year", "include_weighted": true, "include_risk_analysis": true}

### read_file
{"file_id": "the file ID from uploaded files (use the most recent upload if user says 'this file' or 'the document')", "query": "optional specific question about the file"}

### fetch_url
{"url": "the full URL to fetch (must start with http:// or https://)", "query": "optional specific question about the URL content"}

### analyze_with_context
{"query": "the analysis question", "file_id": "optional file ID", "url": "optional URL", "crm_object_type": "optional: lead|contact|account|opportunity", "crm_search_term": "optional search term for CRM records"}

### clarification
{"question": "What would you like me to clarify?", "options": ["option1", "option2"]}

### no_action
{"response": "Your conversational response here"}

## Filter Operators (for create_list_view)
- equals: Exact match
- not_equals: Not equal to
- contains: Contains substring (text fields)
- starts_with: Starts with (text fields)
- greater_than: Greater than (numbers, dates)
- less_than: Less than (numbers, dates)
- is_empty: Field is empty/null
- is_not_empty: Field has a value

## Guidelines
- Extract ALL relevant information from the user message
- If a name is provided without clear first/last split, make a reasonable assumption
- If critical info is missing, use clarification action
- Be helpful and proactive in understanding user intent
- For ambiguous requests, ask for clarification rather than guessing
- Date formats should be YYYY-MM-DD
- Confidence should reflect how certain you are about the intent
- For update_record: Only contact, account, opportunity can be updated (not leads)
- For create_list_view: Translate user filter descriptions into filter conditions
- For generate_report: Pick the best report_type and period from the user's request
- For compare_metrics: Identify which two periods the user wants to compare and the metric
- For find_insights: Map user requests like "show me inactive leads" or "deals past close date" to the right insight_type
- For create_dashboard: Choose the best dashboard_type based on the user's request. "sales dashboard" maps to sales_performance, "pipeline dashboard" maps to pipeline_overview, etc.
- For trend_analysis: Identify the metric and how many periods the user wants. Default to 6 months if not specified.
- For pipeline_forecast: Use this for forecasting questions like "forecast revenue", "which deals might slip", "what's the expected close rate"
- For read_file: Use when user refers to an uploaded document. If user says "summarize this document" or "what's in the file", use the most recent file_id from the conversation context
- For fetch_url: Use when user provides a URL to analyze. The URL must start with http:// or https://
- For analyze_with_context: Use when user wants to combine external content (file or URL) with CRM data. For example "compare this pricing doc with our opportunities for Acme"

REMEMBER: Output ONLY valid JSON. No other text. Start your response with { and end with }."""


class IntentRouterService:
    """
    Routes user intents to appropriate action payloads using LLM.
    Key principle: LLM only generates JSON payloads, never executes actions.
    """
    
    def __init__(self):
        # Prefer Emergent LLM Key (better rate limits), fallback to Gemini
        self.api_key = EMERGENT_LLM_KEY or GEMINI_API_KEY
        self.use_emergent = bool(EMERGENT_LLM_KEY)
        
        if not self.api_key:
            logger.warning("No LLM API key found (EMERGENT_LLM_KEY or GEMINI_API_KEY), intent routing will fail")
        else:
            logger.info(f"IntentRouterService initialized with {'Emergent LLM' if self.use_emergent else 'Gemini'}")
    
    async def parse_intent(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> ParsedIntent:
        """
        Parse user message to extract intent and generate action payload.
        
        Args:
            user_message: The user's natural language input
            conversation_history: Previous messages for context
            context: Additional context (current record, user info, etc.)
            
        Returns:
            ParsedIntent with action_type, payload, and metadata
        """
        if not self.api_key:
            return ParsedIntent(
                action_type=ActionType.NO_ACTION,
                confidence=0.0,
                payload={"response": "I'm sorry, but I'm not properly configured. Please contact your administrator."},
                raw_response="Missing API key"
            )
        
        try:
            # Build the prompt with context
            prompt = self._build_prompt(user_message, conversation_history, context)
            
            # Call Gemini LLM
            llm_response = await self._call_gemini(prompt)
            
            # Parse LLM response into structured intent
            intent = self._parse_llm_response(llm_response)
            
            return intent
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Intent parsing error: {error_str}")
            
            # Provide user-friendly error message for rate limits
            if "RATE_LIMIT_EXHAUSTED" in error_str or "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower() or "RESOURCE_EXHAUSTED" in error_str:
                return ParsedIntent(
                    action_type=ActionType.NO_ACTION,
                    confidence=0.0,
                    payload={"response": "I'm experiencing high demand right now. Please wait about 60 seconds and try again."},
                    raw_response=error_str
                )
            
            return ParsedIntent(
                action_type=ActionType.NO_ACTION,
                confidence=0.0,
                payload={"response": "I encountered an error processing your request. Please try again."},
                raw_response=error_str
            )
    
    def _build_prompt(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the complete prompt for the LLM"""
        prompt_parts = []
        
        # Add conversation history if available
        if conversation_history:
            prompt_parts.append("## Recent Conversation")
            for msg in conversation_history[-5:]:  # Last 5 messages
                role = msg.get("role", "user")
                content = msg.get("content", "")
                prompt_parts.append(f"{role.upper()}: {content}")
            prompt_parts.append("")
        
        # Add context if available
        if context:
            prompt_parts.append("## Current Context")
            if context.get("current_record"):
                record = context["current_record"]
                prompt_parts.append(f"User is viewing: {record.get('object_type', 'unknown')} record")
                prompt_parts.append(f"Record ID: {record.get('id', 'unknown')}")
                if record.get("name"):
                    prompt_parts.append(f"Record Name: {record['name']}")
            if context.get("current_object"):
                prompt_parts.append(f"Current object type: {context['current_object']}")
            prompt_parts.append("")
        
        # Add the current user message
        prompt_parts.append("## User Request")
        prompt_parts.append(user_message)
        prompt_parts.append("")
        prompt_parts.append("## Your Response (JSON only)")
        
        return "\n".join(prompt_parts)
    
    async def _call_gemini(self, prompt: str) -> str:
        """Call LLM API to get intent classification - uses Emergent or Gemini"""
        import asyncio
        
        if self.use_emergent:
            return await self._call_emergent_llm(prompt)
        else:
            return await self._call_gemini_direct(prompt)
    
    async def _call_emergent_llm(self, prompt: str) -> str:
        """Call LLM via emergentintegrations library (better rate limits)"""
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        import uuid
        
        try:
            # Create chat with system prompt
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"clubot-{uuid.uuid4().hex[:8]}",
                system_message=INTENT_SYSTEM_PROMPT
            ).with_model("gemini", "gemini-2.5-flash")
            
            # Send the message
            user_message = UserMessage(text=prompt)
            response = await chat.send_message(user_message)
            
            logger.info("Successfully called Emergent LLM API")
            return response
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"Emergent LLM API error: {error_str}")
            
            # Check for rate limit errors
            if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower() or "balance" in error_str.lower():
                raise Exception("RATE_LIMIT_EXHAUSTED: LLM rate limit or balance issue. Please check your Emergent key balance.")
            
            raise Exception(f"LLM API error: {error_str}")
    
    async def _call_gemini_direct(self, prompt: str) -> str:
        """Call Gemini API directly with retry logic"""
        import google.generativeai as genai
        import asyncio
        
        genai.configure(api_key=self.api_key)
        
        # Use the most reliable model - gemini-2.5-flash
        model_name = "gemini-2.5-flash"
        
        # Retry up to 3 times with longer exponential backoff
        for attempt in range(3):
            try:
                model = genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=INTENT_SYSTEM_PROMPT
                )
                
                response = await model.generate_content_async(
                    prompt,
                    generation_config={
                        "temperature": 0.3,
                        "max_output_tokens": 1024,
                    }
                )
                
                logger.info("Successfully called Gemini API")
                return response.text
                
            except Exception as e:
                error_str = str(e)
                
                # Check if it's a rate limit error
                if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower() or "RESOURCE_EXHAUSTED" in error_str:
                    wait_time = (2 ** attempt) * 5  # 5, 10, 20 seconds
                    logger.warning(f"Gemini rate limit hit, attempt {attempt + 1}/3. Waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    # Non-rate-limit error
                    logger.error(f"Gemini API error: {error_str}")
                    raise Exception(f"Gemini API error: {error_str}")
        
        # If all retries failed
        logger.error("Gemini rate limit exhausted after all retries")
        raise Exception("RATE_LIMIT_EXHAUSTED: Gemini API rate limit exceeded. The free tier allows 20 requests/minute. Please wait 60 seconds and try again.")
    
    def _parse_llm_response(self, llm_response: str) -> ParsedIntent:
        """
        Parse LLM response into ParsedIntent with robust JSON extraction.
        Multiple fallback strategies to ensure valid JSON extraction.
        """
        try:
            # Strategy 1: Try to find JSON in code blocks
            json_str = self._extract_json_from_response(llm_response)
            
            if not json_str:
                # Strategy 2: Try to parse the entire response as JSON
                json_str = llm_response.strip()
            
            data = json.loads(json_str)
            
            # Validate required fields
            if not isinstance(data, dict):
                raise ValueError("Response is not a JSON object")
            
            # Map action type with validation
            action_type_str = data.get("action_type", "no_action")
            try:
                action_type = ActionType(action_type_str)
            except ValueError:
                logger.warning(f"Invalid action_type '{action_type_str}', defaulting to no_action")
                action_type = ActionType.NO_ACTION
            
            # Validate payload exists for action types that need it
            payload = data.get("payload", {})
            if action_type not in [ActionType.NO_ACTION, ActionType.CLARIFICATION]:
                if not payload:
                    logger.warning(f"Missing payload for action_type '{action_type_str}'")
            
            # Determine risk level and preview requirement
            risk_level, requires_preview = self._get_risk_level(action_type)
            
            return ParsedIntent(
                action_type=action_type,
                confidence=float(data.get("confidence", 0.8)),
                payload=payload,
                risk_level=risk_level,
                requires_preview=requires_preview,
                raw_response=llm_response
            )
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.debug(f"Raw response: {llm_response[:500]}")
            
            # Fallback: treat as conversational response
            return ParsedIntent(
                action_type=ActionType.NO_ACTION,
                confidence=0.5,
                payload={"response": llm_response if len(llm_response) < 500 else "I understood your request but had trouble formatting my response. Please try again."},
                raw_response=llm_response
            )
        except Exception as e:
            logger.error(f"Error parsing LLM response: {e}")
            return ParsedIntent(
                action_type=ActionType.NO_ACTION,
                confidence=0.0,
                payload={"response": "I encountered an issue understanding the response. Please try again."},
                raw_response=llm_response
            )
    
    def _extract_json_from_response(self, response: str) -> Optional[str]:
        """
        Extract JSON from LLM response using multiple strategies.
        Handles markdown code blocks and raw JSON.
        """
        import re
        
        # Strategy 1: JSON in markdown code block
        if "```json" in response:
            match = re.search(r'```json\s*([\s\S]*?)\s*```', response)
            if match:
                return match.group(1).strip()
        
        # Strategy 2: Any code block
        if "```" in response:
            match = re.search(r'```\s*([\s\S]*?)\s*```', response)
            if match:
                content = match.group(1).strip()
                # Check if it looks like JSON
                if content.startswith('{'):
                    return content
        
        # Strategy 3: Find JSON object pattern
        match = re.search(r'\{[\s\S]*"action_type"[\s\S]*\}', response)
        if match:
            # Try to find the complete JSON object
            potential_json = match.group(0)
            # Balance braces
            brace_count = 0
            end_idx = 0
            for i, char in enumerate(potential_json):
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
            if end_idx > 0:
                return potential_json[:end_idx]
        
        # Strategy 4: Response starts with {
        if response.strip().startswith('{'):
            return response.strip()
        
        return None
    
    def _get_risk_level(self, action_type: ActionType) -> tuple[RiskLevel, bool]:
        """Determine risk level and preview requirement for an action"""
        RISK_MAPPING = {
            # Phase 1
            ActionType.SEARCH_RECORDS: (RiskLevel.LOW, False),
            ActionType.RECORD_SUMMARY: (RiskLevel.LOW, False),
            ActionType.CREATE_LEAD: (RiskLevel.MEDIUM, True),
            ActionType.ADD_NOTE: (RiskLevel.MEDIUM, True),
            ActionType.CREATE_TASK: (RiskLevel.MEDIUM, True),
            ActionType.CLARIFICATION: (RiskLevel.LOW, False),
            ActionType.NO_ACTION: (RiskLevel.LOW, False),
            # Phase 2A - Updates are HIGH risk, list views are MEDIUM
            ActionType.UPDATE_RECORD: (RiskLevel.HIGH, True),
            ActionType.CREATE_LIST_VIEW: (RiskLevel.MEDIUM, True),
            # Phase 2B - Analytics are LOW risk (read-only)
            ActionType.GENERATE_REPORT: (RiskLevel.LOW, False),
            ActionType.COMPARE_METRICS: (RiskLevel.LOW, False),
            ActionType.FIND_INSIGHTS: (RiskLevel.LOW, False),
            # Phase 3 - Dashboard is MEDIUM (creates record), Trends/Forecast are LOW
            ActionType.CREATE_DASHBOARD: (RiskLevel.MEDIUM, True),
            ActionType.TREND_ANALYSIS: (RiskLevel.LOW, False),
            ActionType.PIPELINE_FORECAST: (RiskLevel.LOW, False),
            # Phase 4 - File read is LOW, URL fetch is MEDIUM (network), context analysis is LOW
            ActionType.READ_FILE: (RiskLevel.LOW, False),
            ActionType.FETCH_URL: (RiskLevel.MEDIUM, True),
            ActionType.ANALYZE_WITH_CONTEXT: (RiskLevel.LOW, False),
        }
        return RISK_MAPPING.get(action_type, (RiskLevel.LOW, False))
    
    def validate_payload(self, action_type: ActionType, payload: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        """
        Validate action payload against schema.
        Returns (is_valid, error_message)
        """
        try:
            if action_type == ActionType.SEARCH_RECORDS:
                SearchRecordsPayload(**payload)
            elif action_type == ActionType.RECORD_SUMMARY:
                RecordSummaryPayload(**payload)
            elif action_type == ActionType.CREATE_LEAD:
                CreateLeadPayload(**payload)
            elif action_type == ActionType.ADD_NOTE:
                AddNotePayload(**payload)
            elif action_type == ActionType.CREATE_TASK:
                CreateTaskPayload(**payload)
            elif action_type == ActionType.CLARIFICATION:
                ClarificationPayload(**payload)
            # Phase 2A
            elif action_type == ActionType.UPDATE_RECORD:
                UpdateRecordPayload(**payload)
            elif action_type == ActionType.CREATE_LIST_VIEW:
                CreateListViewPayload(**payload)
            # Phase 2B
            elif action_type == ActionType.GENERATE_REPORT:
                GenerateReportPayload(**payload)
            elif action_type == ActionType.COMPARE_METRICS:
                CompareMetricsPayload(**payload)
            elif action_type == ActionType.FIND_INSIGHTS:
                FindInsightsPayload(**payload)
            # Phase 3
            elif action_type == ActionType.CREATE_DASHBOARD:
                CreateDashboardPayload(**payload)
            elif action_type == ActionType.TREND_ANALYSIS:
                TrendAnalysisPayload(**payload)
            elif action_type == ActionType.PIPELINE_FORECAST:
                PipelineForecastPayload(**payload)
            # Phase 4
            elif action_type == ActionType.READ_FILE:
                ReadFilePayload(**payload)
            elif action_type == ActionType.FETCH_URL:
                FetchUrlPayload(**payload)
            elif action_type == ActionType.ANALYZE_WITH_CONTEXT:
                AnalyzeWithContextPayload(**payload)
            # NO_ACTION doesn't need strict validation
            return True, None
        except Exception as e:
            return False, str(e)


# Singleton instance
_intent_router_service: Optional[IntentRouterService] = None

def get_intent_router_service() -> IntentRouterService:
    """Get or create the IntentRouterService singleton"""
    global _intent_router_service
    if _intent_router_service is None:
        _intent_router_service = IntentRouterService()
    return _intent_router_service
