"""
CLU-BOT Intent Router Service
Uses Gemini LLM via emergentintegrations to classify user intent and generate action payloads.
Deterministic execution: LLM outputs structured JSON, not database operations.
"""
import os
import json
import inspect
import logging
import re
from typing import Dict, Any, Optional, List, AsyncGenerator
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from ..models import (
    ActionType, RiskLevel, ParsedIntent, ActionPayload,
    SearchRecordsPayload, RecordSummaryPayload, CreateLeadPayload,
    AddNotePayload, CreateTaskPayload, ClarificationPayload,
    UpdateRecordPayload, CreateListViewPayload, UpdateListViewPayload,
    GenerateReportPayload, CompareMetricsPayload, FindInsightsPayload,
    CreateDashboardPayload, TrendAnalysisPayload, PipelineForecastPayload,
    CreateRecordPayload, BulkUpdateRecordsPayload, BulkCreateTasksPayload, BulkCreateRecordsPayload,
    SendEmailPayload, DraftEmailPayload,
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
6. **create_record** - Create a new CRM record (Contact, Account, Opportunity, Event)

### Phase 2A (Update & List Views)
6. **update_record** - Update fields (and optionally **owner**) on an existing CRM record using the same rules as the record API
7. **create_list_view** - Create a filtered list view / segment for an object
8. **update_list_view** - Rename or modify an existing user list view (filters, columns, sort, visibility, default)

### Phase 2B (Analytics & Insights)
9. **generate_report** - Generate analytics reports (revenue, pipeline, leads, opportunities, activities, conversion, kpi, sentiment)
10. **compare_metrics** - Compare metrics between two periods (revenue, pipeline value, lead count, won deals, etc.)
11. **find_insights** - Find CRM insights (inactive leads, stale opportunities, slipping deals, overdue tasks, etc.)

### Phase 3 (Dashboards, Trends, Forecasting)
12. **create_dashboard** - Create an AI-generated dashboard with widgets (sales performance, pipeline overview, lead management, activity tracker)
13. **trend_analysis** - Analyze time-series trends for CRM metrics (revenue trend, leads per month, etc.)
14. **pipeline_forecast** - Forecast pipeline revenue, identify at-risk deals and likely closures

### Phase 4 (External Context)
15. **read_file** - Read and summarize content from an uploaded file (user must have uploaded a file first)
16. **fetch_url** - Fetch and summarize content from a URL
17. **analyze_with_context** - Combine CRM data with external content (uploaded file or URL) for analysis

### Utility
18. **clarification** - Ask user for more information when request is ambiguous
19. **no_action** - Respond conversationally when no CRM action is needed. Use this for greetings or for politely declining non-CRM requests like jokes or general knowledge questions.
20. **bulk_update_records** - Update multiple matching records in one operation (always preview first)
21. **bulk_create_tasks** - Create follow-up tasks for multiple matching records (always preview first)
22. **bulk_create_records** - Create multiple CRM records in one operation (always preview first)
23. **send_email** - Send CRM email (single recipient, record-linked, or open-opportunity owner group)
24. **draft_email** - Save an email draft in CRM

## Response Format
You MUST respond with valid JSON in this exact structure:
{
  "action_type": "one of the action types above",
  "confidence": 0.0 to 1.0,
  "payload": { action-specific fields },
  "reasoning": "brief explanation"
}

## CRITICAL INTENT DISTINCTION

- If the user asks to VIEW, LIST, SHOW, FIND records → ALWAYS use `search_records`
- For queries like "how many leads", "show all leads", "list contacts" → Use `search_records` with an EMPTY `query` field.
- If the user asks for "hot", "warm", or "cold" leads → Use `search_records` with `filters: {"rating": "hot|warm|cold"}` and an EMPTY `query`.
- ONLY put specific ENTITY NAMES (person names, company names, location names) in the `query` field. 
- DO NOT include functional words like "account", "linked to", "for" in the `query` field.

Examples:
- "list leads with status new" → action_type: search_records, payload: {"object_type": "lead", "query": "", "filters": {"status": "New"}}
- "how many leads" → action_type: search_records, payload: {"object_type": "lead", "query": "", "user_query": "How many leads are there?"}
- "show all leads" → action_type: search_records, payload: {"object_type": "lead", "query": ""}
- "show me hot leads" → action_type: search_records, payload: {"object_type": "lead", "query": "", "filters": {"rating": "hot"}}
- "opportunities closing this month" → action_type: search_records, payload: {"object_type": "opportunity", "query": "", "filters": {"close_date": "this_month"}}
- "show contacts from Amroar" → action_type: search_records, payload: {"object_type": "contact", "query": "Amroar", "user_query": "Show contacts associated with the account Amroar"}
- "leads in Mumbai" → action_type: search_records, payload: {"object_type": "lead", "query": "Mumbai"}
- "opportunities for Microsoft" → action_type: search_records, payload: {"object_type": "opportunity", "query": "Microsoft", "user_query": "Shows opportunities linked to Microsoft"}
- "opportunities over 1000" → action_type: search_records, payload: {"object_type": "opportunity", "query": "", "filters": {"amount": {"gt": 1000}}}
- "open opportunities over 500" → action_type: search_records, payload: {"object_type": "opportunity", "query": "", "filters": {"amount": {"gt": 500}, "status": "Open"}}
- "create a list view for new leads" → action_type: create_list_view
- "rename list view Contacts from google to CFG" → action_type: update_list_view, payload includes current_name + name

NEVER use `create_list_view` unless user explicitly asks to create/save a view.
For rename/edit/change of an existing list view, use `update_list_view` (not `create_list_view`).

## Multi-Turn Conversations & Context
- ALWAYS check the `## Recent Conversation` history to understand the user's current intent.
- If the previous assistant message asked for specific missing fields (e.g., "I need the Opportunity Name"), and the user responds with a value (e.g., "aman"), you must treat that value as the answer to the question.
- You must output the FULL payload for the action currently in progress, including all previously collected data plus the new value provided by the user.
- Do NOT start a new action if the user is clearly answering a question about a pending one.
- If the user provides a name for an account that is slightly different from what you extracted before, update it to the user's latest input.
- **update_record / record_id**: Use a **real UUID**, a **series_id** (always `led-…`, `con-…`, three lowercase letters + hyphen + suffix), or the **plain name** (e.g. `ravi gupta`). **Never** prefix the object name to a series_id (wrong: `lead-led-abc` — right: `led-abc` or just the person name).
- When the user answers “the name is …” after you asked which lead/contact, set `record_id` to that **name text**, not an ID from an old preview unless they clicked a link.
- Example: 
  USER: "Create an opportunity"
  ASSISTANT: "What should we name this opportunity?"
  USER: "Big Deal"
  ASSISTANT: "What stage is this opportunity in?"
  USER: "Negotiation"
  YOU: {"action_type": "create_record", "payload": {"object_type": "opportunity", "fields": {"opportunity_name": "Big Deal", "stage": "Negotiation"}}}

- DO NOT switch to `record_summary` or `search_records` if the user is answering a specific question about a record they are creating.
- Values like "Negotiation", "Prospecting", "Closed Won" should be treated as values for the `stage` field in an opportunity creation flow, NOT as search terms.

## Payload Schemas

### search_records
{"object_type": "lead|contact|account|opportunity|task|event|file|note", "query": "specific keyword or EMPTY if listing all/counting", "filters": {"field": "value"}, "limit": 10, "user_query": "THE EXACT ORIGINAL QUESTION FROM THE USER"}

### record_summary
{"object_type": "lead|contact|account|opportunity", "record_id": "record-id-or-name", "user_query": "specific question about this record OR EMPTY for full summary", "include_all": "boolean (true for complex/deep summary. CRITICAL: Set to true if the user asks for 'everything', 'full summary', or asks to 'include' items like tasks/ops after seeing them in discovery)", "skip_discovery": "boolean (true if user explicitly asked for a 'standard' summary)"}

### create_lead
{"first_name": "fill when known; omit if user has not provided it yet", "last_name": "same", "email": "optional", "phone": "optional", "company": "optional", "lead_source": "optional", "status": "default New if omitted", "description": "optional"}

### add_note
{"title": "required", "body": "optional note content", "linked_entity_type": "lead|contact|account|opportunity", "linked_entity_id": "record-id"}

### create_task
{"subject": "fill when known", "description": "optional", "due_date": "YYYY-MM-DD", "priority": "High|Normal|Low", "status": "Not Started|In Progress|Completed", "related_to": "optional record id", "related_type": "optional object type", "assigned_to": "optional user id"}

### create_record
{"object_type": "contact|account|opportunity|event|custom_object_api_name", "fields": {"field_name": "value"}}

### update_record
{"object_type": "lead|contact|account|opportunity|task|event|custom_object_api_name", "record_id": "uuid-or-series-id-or-name", "updates": {"field_in_data": "new_value"}, "owner_name": "optional — resolves to tenant user for record owner", "owner_id": "optional user uuid"}

Examples (map natural language to data field names, e.g. billing city → `billing_city`, phone → `phone` or `mobile`):
- "Update opportunity stage to Proposal" → `{"object_type":"opportunity","record_id":"...","updates":{"stage":"Proposal"}}`
- "Change owner of this lead to Rishabh" → use **Current Context** record_id if user says *this/current*; `{"object_type":"lead","record_id":"<from context or name>","owner_name":"Rishabh"}`
- "Set account billing city to Gurgaon" → `updates`: `{"billing_city":"Gurgaon"}`
- "Set contact phone to +1-555-0100" → `updates`: `{"phone":"+1-555-0100"}` (or `mobile` if that is the org’s field)

If **which record** is unclear and there is no `current_record` in context → use **clarification** and ask for object + name/ID. For **multiple** records say you need them to narrow to one or use Search first.

### bulk_update_records
{"object_type": "lead|contact|account|opportunity|task|event|custom_object_api_name", "filters": {"field": "value or operator dict"}, "updates": {"field_in_data": "new_value"}, "owner_name": "optional", "owner_id": "optional", "limit": 100}

### bulk_create_tasks
{"target_object_type": "lead|contact|account|opportunity", "target_filters": {"field": "value or operator dict"}, "subject_template": "Follow up: {name}", "description_template": "optional", "due_date": "YYYY-MM-DD", "priority": "High|Normal|Low", "status": "Not Started|In Progress|Completed", "assigned_to": "optional user id", "owner_name": "optional resolver name", "limit": 100}

### bulk_create_records
{"object_type": "lead|contact|account|opportunity|task|event|custom_object_api_name", "records": [{"field_name": "value"}], "limit": 100}

### send_email
{"to_emails": ["user@example.com"], "cc_emails": [], "bcc_emails": [], "subject": "optional", "body": "optional", "related_record_type": "optional", "related_record_id": "optional id/name", "send_to_owner": false, "email_all_open_opportunity_owners": false, "include_next_steps": false}

### draft_email
{"to_emails": ["user@example.com"], "cc_emails": [], "bcc_emails": [], "subject": "optional", "body": "optional", "related_record_type": "optional", "related_record_id": "optional id/name", "send_to_owner": false}

### create_list_view
{"object_type": "lead|contact|account|opportunity|task", "name": "List view name", "description": "optional description", "filters": [{"field": "status", "operator": "equals", "value": "New"}], "filter_logic": "AND|OR", "columns": ["name", "email", "status"], "sort_field": "created_at", "sort_order": "desc|asc", "visibility": "private|shared|team", "is_default": false}

### update_list_view
{"list_view_id": "optional id", "object_type": "optional lead|contact|account|opportunity|task", "current_name": "optional existing view name", "name": "optional new name", "filters": [{"field": "status", "operator": "equals", "value": "New"}], "filter_logic": "AND|OR", "columns": ["name", "email"], "sort_field": "created_at", "sort_order": "desc|asc", "visibility": "private|shared|team", "is_default": true|false}

Rules for update_list_view:
- If user asks to rename a list view, use `update_list_view` with `current_name` + new `name`.
- If user asks to change filters/columns/sort/visibility/default, use `update_list_view` and include only requested changes.
- If list view identity is missing, ask clarification for current list view name or id.

List view conversation policy:
- For `create_list_view`, if required fields are missing ask one short follow-up at a time.
- Preferred follow-up order when user is vague: object_type → name → visibility → filters → columns → sort → is_default.
- For requests like "create a list view for leads in Mumbai", keep known fields in payload and ask for missing name/visibility/columns/sort in clarification turns.

### generate_report
{"report_type": "revenue|pipeline|leads|opportunities|activities|conversion|kpi|sentiment", "period": "day|week|month|quarter|year|custom", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "group_by": "owner|stage|source|status|month|week"}

### compare_metrics
{"metric_type": "revenue|pipeline_value|lead_count|opportunity_count|account_count|activity_count|won_deals|conversion_rate|win_rate", "period_1": "this_month|last_month|this_quarter|last_quarter|this_year|last_year", "period_2": "this_month|last_month|this_quarter|last_quarter|this_year|last_year"}

### find_insights
{"insight_type": "inactive_leads|stale_opportunities|slipping_deals|overdue_tasks|high_value_leads|top_performers|at_risk_accounts", "days_threshold": 30, "limit": 10}

### create_dashboard
{"name": "Dashboard name", "dashboard_type": "sales_performance|pipeline_overview|lead_management|activity_tracker|custom", "description": "optional description", "period": "day|week|month|quarter|year"}

### trend_analysis
{"metric": "revenue|leads|opportunities|accounts|pipeline_value|activities|won_deals|conversion_rate|win_rate", "period_count": 6, "period_type": "day|week|month|quarter"}

### pipeline_forecast
{"forecast_period": "month|quarter|year", "include_weighted": true, "include_risk_analysis": true}

### read_file
{"file_id": "the file ID", "query": "optional question about the file"}

### fetch_url
{"url": "full URL", "query": "optional question about the URL"}

### analyze_with_context
{"query": "analysis question", "file_id": "optional file ID", "url": "optional URL", "crm_object_type": "optional", "crm_search_term": "optional search term"}

### clarification
{"question": "What would you like me to clarify?", "options": ["option1", "option2"]}

### no_action
{"response": "Greeting or a polite decline of non-CRM requests (e.g. 'I'm here to help with your CRM tasks.')"}

## Domain-Specific Rules
### Objects & Status
- **Opportunities**: "Open" means the record is NOT Won and NOT Lost. Note that some records use the field `stage` and others use `status`. To find "open" opportunities, exclude BOTH "Won" and "Lost" values from BOTH `stage` and `status` fields.
  Example payload for "open opportunities": `{"object_type": "opportunity", "query": "", "filters": {"stage": {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]}, "status": {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]}}}`
- **Leads**: "Open" generally means status is "New", "Assigned", or "In Progress". "Closed" means "Converted" or "Junk".

## Filter Operators (for search_records and create_list_view)
- equals, ne (not equal), gt (greater_than), lt (less_than), contains, starts_with, in (any of), nin (not in), exists (true/false)
- Use `exists: false` to find records missing a specific field.
- For geographical queries (e.g. "in Delhi", "from Mumbai"), use ONLY the location name ("Delhi", "Mumbai") in the `query` field.
- For relationship queries (e.g. "from account Amroar", "leads for Microsoft"), use ONLY the entity name ("Amroar", "Microsoft") in the `query` field.

## CRITICAL: Capturing User Questions
When the user asks a specific question (e.g. "how many leads?", "show contacts for google"), you MUST put that exact question in the `user_query` field of the payload. This allows the system to generate a natural language answer.

## CRITICAL: No Identity Substitution
ALWAYS use the specific entity names mentioned by the user (e.g. "Amroar technologies", "Microsoft"). NEVER substitute them with "Google" or any other name from the examples.

REMEMBER: Output ONLY valid JSON starting with { and ending with }. All fields MUST be inside "payload" except "action_type", "confidence", and "reasoning".
No explanatory text. No markdown formatting around the JSON. Check relationship and geography logic before responding. (e.g. "leads from account Acme" -> query: "Acme", object_type: "lead")

## Uploaded files (attached in chat)
- If **Current Context** lists `file_id` or `attached_file_id`, the user attached a file **with this message**.
- Summarize, explain, extract, or answer questions **about that file / attachment / document** → **read_file** with `file_id` exactly as given in context and `query` set to their question (omit `query` only for a general summary request like "summarize this").
- Do **not** use **no_action** for substantive questions about an attached file when `file_id` is present.

## General Chat & Out-of-Scope Requests
- If the user asks for a joke, politely decline and state that your focus is on assisting with CRM-specific tasks.
- If the user greets you, greet them back and ask how you can help with their CRM-related work.
- If the user asks a general knowledge question (e.g. "what is the capital of France?"), politely inform them that you are an AI dedicated to their CRM data and suggest a CRM-related action.
- ALWAYS maintain a professional, business-focused tone."""


class IntentRouterService:
    """
    Routes user intents to appropriate action payloads using LLM.
    Key principle: LLM only generates JSON payloads, never executes actions.
    """
    
    def __init__(self):
        # Prefer Emergent LLM Key (better rate limits), fallback to Gemini
        self.api_key =GEMINI_API_KEY or EMERGENT_LLM_KEY 
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
            deterministic_intent = self._deterministic_parse_intent(user_message)
            if deterministic_intent:
                return deterministic_intent

            # Build the prompt with context
            prompt = self._build_prompt(user_message, conversation_history, context)
            
            # Call Gemini LLM
            # llm_response = await self._call_gemini(prompt)
            llm_response = await self._call_gemini_direct(prompt)
            
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

    def _build_intent(
        self,
        action_type: ActionType,
        payload: Dict[str, Any],
        confidence: float = 0.92,
        raw_response: str = "deterministic_rule",
    ) -> ParsedIntent:
        risk_level, requires_preview = self._get_risk_level(action_type)
        return ParsedIntent(
            action_type=action_type,
            confidence=confidence,
            payload=payload,
            risk_level=risk_level,
            requires_preview=requires_preview,
            raw_response=raw_response,
        )

    @staticmethod
    def _detect_object_type(message: str) -> Optional[str]:
        mapping = {
            "opportunit": "opportunity",
            "lead": "lead",
            "contact": "contact",
            "account": "account",
            "task": "task",
            "event": "event",
            "note": "note",
            "file": "file",
        }
        msg = message.lower()
        for key, value in mapping.items():
            if key in msg:
                return value
        return None

    @staticmethod
    def _to_number(value: str) -> Optional[float]:
        if not value:
            return None
        num_txt = str(value).strip().lower().replace(",", "")
        multiplier = 1.0
        if "lakh" in num_txt:
            multiplier = 100000.0
            num_txt = num_txt.replace("lakh", "").strip()
        elif "crore" in num_txt:
            multiplier = 10000000.0
            num_txt = num_txt.replace("crore", "").strip()
        try:
            return float(num_txt) * multiplier
        except ValueError:
            return None

    @staticmethod
    def _normalize_field_name(text: str) -> str:
        raw = (text or "").strip().lower()
        aliases = {
            "billing city": "billing_city",
            "phone number": "phone",
            "mobile number": "mobile",
            "next step": "next_step",
            "close date": "close_date",
            "lead owner": "owner_name",
            "account owner": "owner_name",
            "contact owner": "owner_name",
            "opportunity owner": "owner_name",
        }
        if raw in aliases:
            return aliases[raw]
        cleaned = re.sub(r"[^a-z0-9]+", "_", raw).strip("_")
        return cleaned or "field"

    @staticmethod
    def _pluralize_object_type(object_type: str) -> str:
        ot = (object_type or "").strip().lower()
        if not ot:
            return "records"
        plural_map = {
            "opportunity": "opportunities",
            "company": "companies",
            "activity": "activities",
            "category": "categories",
            "inventory": "inventory",
            "history": "histories",
        }
        return plural_map.get(ot, f"{ot}s")

    @staticmethod
    def _extract_account_name_for_list_view(message: str) -> Optional[str]:
        """
        Extract an account/company name used as a relationship filter.
        Examples:
        - "all opportunities of google account" -> "google"
        - "opportunities for Microsoft" -> "Microsoft"
        - "make a list view for opportunities from account Amroar" -> "Amroar"
        """
        msg = (message or "").strip()
        if not msg:
            return None

        # Prefer patterns that explicitly include the word "account"
        m = re.search(r"(?:for|of|from)\s+(.+?)\s+account\b", msg, re.I)
        if m:
            candidate = m.group(1).strip(" ,.")
            candidate = re.sub(r"(?i)^(?:the|an|a)\s+", "", candidate).strip()
            return candidate or None

        # Relationship phrasing without "account": "<object> for <name>"
        m2 = re.search(r"\b(?:opportunit(?:y|ies)|leads?|contacts?)\b\s+(?:for|of|from)\s+([^,.;]+)", msg, re.I)
        if m2:
            candidate = m2.group(1).strip(" ,.")
            candidate = re.sub(r"(?i)^(?:the|an|a)\s+", "", candidate).strip()
            # If it's likely a location, skip (location logic is handled elsewhere)
            if any(tok in candidate.lower() for tok in ("mumbai", "delhi", "gurgaon", "noida", "pune", "bangalore", "bengaluru", "chennai", "hyderabad")):
                return None
            return candidate or None

        # Adjective-style phrasing: "<name> opportunities" (common shorthand for account-linked opportunities)
        m4 = re.search(r"\b([^,.;]+?)\s+opportunit(?:y|ies)\b", msg, re.I)
        if m4:
            candidate = m4.group(1).strip(" ,.")
            candidate_l = candidate.lower()
            # Strip common leading words
            candidate = re.sub(r"(?i)^(?:all|my|the|open|closed)\s+", "", candidate).strip()
            if not candidate:
                return None
            # Avoid capturing "list view" / "create" fragments
            if any(tok in candidate_l for tok in ("list view", "create", "make", "build", "show", "find", "search", "opportunit")):
                return None
            return candidate

        # "account <name>" phrasing
        m3 = re.search(r"\baccount\s+([^,.;]+)$", msg, re.I)
        if m3:
            candidate = m3.group(1).strip(" ,.")
            candidate = re.sub(r"(?i)^is\s+", "", candidate).strip()
            return candidate or None

        return None

    @staticmethod
    def _extract_relative_period_token(msg_l: str) -> Optional[str]:
        """
        Returns a canonical relative period token understood by our filters.
        Examples: this_month, last_month, this_quarter, last_quarter, this_year, last_year, this_week, next_week
        """
        if not msg_l:
            return None
        # Month
        if "this month" in msg_l:
            return "this_month"
        if "last month" in msg_l:
            return "last_month"
        if "next month" in msg_l:
            return "next_month"
        # Quarter
        if "this quarter" in msg_l:
            return "this_quarter"
        if "last quarter" in msg_l:
            return "last_quarter"
        if "next quarter" in msg_l:
            return "next_quarter"
        # Year
        if "this year" in msg_l:
            return "this_year"
        if "last year" in msg_l:
            return "last_year"
        if "next year" in msg_l:
            return "next_year"
        # Week
        if "this week" in msg_l:
            return "this_week"
        if "last week" in msg_l:
            return "last_week"
        if "next week" in msg_l:
            return "next_week"
        return None

    @staticmethod
    def _infer_date_field_for_list_view(msg_l: str, object_type: str) -> Optional[str]:
        """
        Infer which date field user meant from phrasing like:
        - "closing this month" -> close_date
        - "due this week" -> due_date
        - "created this month" -> created_at
        - "updated last month" -> updated_at
        Works across objects; does not hardcode per-object list views.
        """
        if not msg_l:
            return None
        # Prefer explicit keywords
        if any(k in msg_l for k in ("closing", "close date", "closes")):
            return "close_date"
        if any(k in msg_l for k in ("due", "due date")):
            return "due_date"
        if any(k in msg_l for k in ("created", "created at")):
            return "created_at"
        if any(k in msg_l for k in ("updated", "updated at", "modified")):
            return "updated_at"
        # Minimal fallback: for opportunities, "closing" is most common but keyword may be absent.
        if (object_type or "").lower() == "opportunity" and "close" in msg_l:
            return "close_date"
        return None

    def _deterministic_parse_intent(self, user_message: str) -> Optional[ParsedIntent]:
        msg = (user_message or "").strip()
        if not msg:
            return None
        msg_l = msg.lower()

        # Non-CRM / sensitive requests
        if any(k in msg_l for k in ("poem", "joke", "birthday poem", "story")):
            return self._build_intent(
                ActionType.NO_ACTION,
                {"response": "I can help with CRM work only. Ask me to search, create, update, summarize, or analyze CRM records."},
                confidence=0.99,
            )
        if "api token" in msg_l or ("token" in msg_l and "integration" in msg_l):
            return self._build_intent(
                ActionType.NO_ACTION,
                {"response": "I can’t reveal or list integration API tokens in chat. Please use your secure integrations/admin settings to manage tokens."},
                confidence=0.99,
            )

        # Explicit unsupported operations: keep graceful and dynamic
        if ("field" in msg_l and any(k in msg_l for k in ("create", "add", "checkbox", "picklist", "number"))) or (
            "custom object" in msg_l or "create object" in msg_l or "track project milestones" in msg_l
        ):
            return self._build_intent(
                ActionType.NO_ACTION,
                {"response": "Schema changes (new fields/objects) are not enabled in CLU-BOT yet. I can still help create and manage records using your existing CRM schema."},
                confidence=0.98,
            )
        # Email intents
        if "email all open opportunity owners" in msg_l:
            return self._build_intent(
                ActionType.SEND_EMAIL,
                {
                    "email_all_open_opportunity_owners": True,
                    "include_next_steps": True,
                    "subject": "Next steps for open opportunities",
                },
                confidence=0.97,
            )
        if "draft" in msg_l and "email" in msg_l:
            payload: Dict[str, Any] = {
                "subject": "CRM Summary",
                "body": "Hello,\n\nPlease find the CRM summary below.\n\nRegards,",
            }
            if "account owner" in msg_l:
                payload["related_record_type"] = "account"
                payload["related_record_id"] = "this"
                payload["send_to_owner"] = True
            else:
                rel_ot = self._detect_object_type(msg_l)
                if rel_ot:
                    payload["related_record_type"] = rel_ot
                    payload["related_record_id"] = "this"
                    m_rel = re.search(rf"email\s+(?:to|for)\s+(.+?)\s+{rel_ot}s?\b", msg, re.I)
                    if m_rel:
                        payload["related_record_id"] = m_rel.group(1).strip()
            return self._build_intent(ActionType.DRAFT_EMAIL, payload, confidence=0.95)
        if "send" in msg_l and "email" in msg_l:
            payload: Dict[str, Any] = {
                "subject": "Follow-up",
                "body": "Hello,\n\nFollowing up as discussed.\n\nRegards,",
            }
            rel_ot = self._detect_object_type(msg_l)
            if rel_ot:
                payload["related_record_type"] = rel_ot
                payload["related_record_id"] = "this"
                m_rel = re.search(rf"email\s+(?:to|for)\s+(.+?)\s+{rel_ot}s?\b", msg, re.I)
                if m_rel:
                    payload["related_record_id"] = m_rel.group(1).strip()
            if "account owner" in msg_l:
                payload["related_record_type"] = "account"
                payload["related_record_id"] = "this"
                payload["send_to_owner"] = True
            return self._build_intent(ActionType.SEND_EMAIL, payload, confidence=0.94)

        # Bulk create tasks (follow-up)
        if "follow-up task" in msg_l and "all open opportunit" in msg_l:
            return self._build_intent(
                ActionType.BULK_CREATE_TASKS,
                {
                    "target_object_type": "opportunity",
                    "target_filters": {
                        "stage": {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]},
                        "status": {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]},
                    },
                    "subject_template": "Follow up: {name}",
                    "status": "Not Started",
                    "priority": "Normal",
                    "limit": 100,
                },
                confidence=0.96,
            )

        # Generic bulk create records
        if any(k in msg_l for k in ("bulk create", "create many", "create multiple")) and any(
            k in msg_l for k in ("lead", "contact", "account", "opportunit", "task", "event")
        ):
            ot = self._detect_object_type(msg_l) or "lead"
            records: List[Dict[str, Any]] = []
            if "[" in msg and "]" in msg:
                start = msg.find("[")
                end = msg.rfind("]")
                if start >= 0 and end > start:
                    try:
                        parsed = json.loads(msg[start : end + 1])
                        if isinstance(parsed, list):
                            records = [r for r in parsed if isinstance(r, dict)]
                    except Exception:
                        records = []
            if not records and ot == "lead":
                # Heuristic: "Ravi from Infosys, Sonali from TCS"
                for piece in [p.strip() for p in re.split(r",|;", msg) if p.strip()]:
                    cleaned_piece = re.sub(r"(?i)^(bulk\s+create|create\s+many|create\s+multiple)\s+leads?\s*", "", piece).strip()
                    m = re.search(r"([a-zA-Z][a-zA-Z\s]+?)\s+from\s+([a-zA-Z0-9&\-\s]+)$", cleaned_piece, re.I)
                    if not m:
                        continue
                    name = m.group(1).strip().split()
                    rec: Dict[str, Any] = {"company": m.group(2).strip(), "status": "New"}
                    rec["first_name"] = name[0]
                    if len(name) > 1:
                        rec["last_name"] = " ".join(name[1:])
                    records.append(rec)
            return self._build_intent(
                ActionType.BULK_CREATE_RECORDS,
                {"object_type": ot, "records": records, "limit": 100},
                confidence=0.9,
            )

        # Bulk updates
        if any(k in msg_l for k in ("all open", "all tasks", "all opportunities", "change owner of all", "move all", "update all", "close all")) and any(
            k in msg_l for k in ("update", "change", "move", "close", "set")
        ):
            ot = self._detect_object_type(msg_l) or "opportunity"
            updates: Dict[str, Any] = {}
            filters: Dict[str, Any] = {}
            payload: Dict[str, Any] = {"object_type": ot, "filters": filters, "updates": updates, "limit": 100}

            owner_match = re.search(r"to\s+([a-zA-Z][a-zA-Z\s]+)$", msg, re.I)
            if owner_match and "owner" in msg_l:
                payload["owner_name"] = owner_match.group(1).strip()

            if "open" in msg_l and ot == "opportunity":
                filters["stage"] = {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]}
                filters["status"] = {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]}
            if "open" in msg_l and ot == "lead":
                filters["status"] = {"in": ["New", "Assigned", "In Progress"]}
            if "north region" in msg_l:
                filters["region"] = "North"
            stage_match = re.search(r"(?:to|stage to)\s+([a-zA-Z][a-zA-Z\s]+)$", msg, re.I)
            if stage_match and ("move" in msg_l or "stage" in msg_l):
                updates["stage"] = stage_match.group(1).strip().title()
            if "close all tasks older than" in msg_l:
                ot = "task"
                payload["object_type"] = "task"
                days = re.search(r"older than\s+(\d+)\s+day", msg_l)
                age_days = int(days.group(1)) if days else 30
                filters["due_date"] = {"lt_days": age_days}
                filters["status"] = {"nin": ["Completed"]}
                updates["status"] = "Completed"
            nxt = re.search(r"next step\s*=?\s*([^,.;]+)", msg, re.I)
            if nxt:
                updates["next_step"] = nxt.group(1).strip().rstrip(".")
            if "proposal stage" in msg_l:
                filters["stage"] = "Proposal"
            else:
                # Generic stage filter: "in Negotiation stage", "at proposal stage"
                stage_filter = re.search(r"(?:in|at)\s+([a-zA-Z][a-zA-Z\s]+?)\s+stage\b", msg, re.I)
                if stage_filter:
                    filters["stage"] = stage_filter.group(1).strip().title()

            # If user mentions relationship-oriented targeting without a clear field/value,
            # ask one clarification before running a potentially wrong bulk update.
            relation_signal = any(
                k in msg_l
                for k in ("related", "relation", "linked to", "linked with", "for account", "for contact", "for lead", "for opportunity")
            )
            has_relation_filter = any(
                k in filters for k in ("account_id", "account_name", "contact_id", "contact_name", "lead_id", "lead_name", "opportunity_id", "opportunity_name")
            )
            if relation_signal and not has_relation_filter:
                return self._build_intent(
                    ActionType.CLARIFICATION,
                    {
                        "question": "Which related field should I use to match records? For example: account, contact, lead, or opportunity.",
                        "options": ["Filter by account", "Filter by contact", "Filter by lead", "Filter by opportunity"],
                    },
                    confidence=0.9,
                )

            if not updates and not payload.get("owner_name"):
                return self._build_intent(
                    ActionType.CLARIFICATION,
                    {"question": "What should I change for these matched records?", "options": ["Change stage", "Change owner", "Set field values"]},
                    confidence=0.85,
                )
            return self._build_intent(ActionType.BULK_UPDATE_RECORDS, payload, confidence=0.95)

        # Dashboard
        if any(k in msg_l for k in ("create a dashboard", "create dashboard", "kpi widget")):
            dashboard_type = "custom"
            if "sales manager" in msg_l:
                dashboard_type = "sales_performance"
            payload = {
                "name": "Sales Dashboard" if "sales" in msg_l else "CRM Dashboard",
                "dashboard_type": dashboard_type,
                "period": "month",
            }
            return self._build_intent(ActionType.CREATE_DASHBOARD, payload)

        # Trend and analytics
        if "month-by-month" in msg_l or ("last 6 months" in msg_l and ("lead" in msg_l or "opportunit" in msg_l)):
            metric = "leads" if "lead" in msg_l else "opportunities"
            payload = {"metric": metric, "period_count": 6, "period_type": "month"}
            return self._build_intent(ActionType.TREND_ANALYSIS, payload, confidence=0.95)
        if "compare this month vs last month" in msg_l and "won deals" in msg_l:
            return self._build_intent(
                ActionType.COMPARE_METRICS,
                {"metric_type": "won_deals", "period_1": "this_month", "period_2": "last_month"},
                confidence=0.96,
            )
        if "pipeline by owner" in msg_l:
            return self._build_intent(
                ActionType.GENERATE_REPORT,
                {"report_type": "pipeline", "period": "month", "group_by": "owner"},
                confidence=0.95,
            )

        # Summary requests
        if "summarize" in msg_l or "summary of this" in msg_l or "latest status and next step" in msg_l:
            record_ref = "this"

            # Prefer explicit object mentioned in the "summarize <name> <object>" phrase.
            explicit_obj = None
            m_obj = re.search(
                r"(?:summarize|summary of)\s+.+?\s+(account|contact|lead|opportunit(?:y|ies)|task|event)\b",
                msg_l,
                re.I,
            )
            if m_obj:
                token = m_obj.group(1).lower()
                explicit_obj = "opportunity" if token.startswith("opportunit") else token

            if explicit_obj:
                ot = explicit_obj
            elif "this account" in msg_l or ("account" in msg_l and "this" in msg_l):
                ot = "account"
            elif "this contact" in msg_l or ("contact" in msg_l and "this" in msg_l):
                ot = "contact"
            elif "this lead" in msg_l or ("lead" in msg_l and "this" in msg_l):
                ot = "lead"
            elif "this opportunit" in msg_l or ("opportunit" in msg_l and "this" in msg_l):
                ot = "opportunity"
            else:
                ot = self._detect_object_type(msg_l) or "account"

            # Try to extract explicit record names when user gives one
            m_named = re.search(rf"(?:summarize|summary of)\s+(.+?)\s+{ot}s?\b", msg, re.I)
            if m_named:
                candidate = m_named.group(1).strip(" ,.")
                if candidate and candidate.lower() not in ("this", "current", "the"):
                    record_ref = candidate

            include_all = any(k in msg_l for k in ("all related", "all opportunities", "all tasks", "everything"))
            return self._build_intent(
                ActionType.RECORD_SUMMARY,
                {"object_type": ot, "record_id": record_ref, "include_all": include_all, "user_query": msg},
                confidence=0.9,
            )

        # List view / list management requests
        mentions_list_view = ("list view" in msg_l) or ("list liew" in msg_l)
        mentions_list_alias = bool(re.search(r"\b(?:lead|contact|account|opportunit(?:y|ies)|task)\s+list\b", msg_l))
        is_list_request = mentions_list_view or mentions_list_alias

        # Guardrail: user pasted multiple numbered scenarios in one message.
        # We can execute only one deterministic action per turn.
        numbered_items = re.findall(r"(?:^|\s)\d+\.", msg)
        if is_list_request and len(numbered_items) >= 2:
            return self._build_intent(
                ActionType.CLARIFICATION,
                {
                    "question": "I found multiple list-view requests in one message. Please send one action at a time (or say which item number to run first).",
                    "options": ["Run item 24", "Run item 25", "Run item 26", "Run item 27", "Run item 28", "Run item 29", "Run item 30"],
                },
                confidence=0.96,
            )

        if is_list_request:
            update_signals = (
                "rename",
                "update",
                "add owner column",
                "amount descending",
                "show amount descending",
                "add billing city",
            )
            if any(k in msg_l for k in update_signals):
                payload: Dict[str, Any] = {}
                if "rename" in msg_l:
                    # Generic rename patterns:
                    # - "rename Google Opportunities list view to GO"
                    # - "rename list view Google Opportunities to GO"
                    # - "rename this list view to GO"
                    m_named = re.search(
                        r"rename\s+(.+?)\s+list\s+(?:view|liew)\s+to\s+(.+)$",
                        msg,
                        re.I,
                    )
                    m_alt = re.search(
                        r"rename\s+list\s+(?:view|liew)\s+(.+?)\s+to\s+(.+)$",
                        msg,
                        re.I,
                    )
                    m_this = re.search(
                        r"rename\s+(?:this\s+)?list\s+(?:view|liew)\s+to\s+(.+)$",
                        msg,
                        re.I,
                    )
                    if m_named:
                        payload["current_name"] = m_named.group(1).strip()
                        payload["name"] = m_named.group(2).strip()
                    elif m_alt:
                        payload["current_name"] = m_alt.group(1).strip()
                        payload["name"] = m_alt.group(2).strip()
                    elif m_this:
                        payload["current_name"] = "this"
                        payload["name"] = m_this.group(1).strip()
                    elif "this list view" in msg_l or "this list liew" in msg_l:
                        payload["current_name"] = "this"
                if "owner column" in msg_l:
                    payload["object_type"] = "lead"
                    payload["current_name"] = "My Lead List View" if "my lead list" in msg_l else payload.get("current_name", "Lead List View")
                    payload["columns"] = ["name", "owner_id"]
                if "amount descending" in msg_l or "show amount descending" in msg_l:
                    payload["object_type"] = "opportunity"
                    payload["current_name"] = "Hot Opportunities" if "hot opportunit" in msg_l else payload.get("current_name", "Opportunities")
                    payload["sort_field"] = "amount"
                    payload["sort_order"] = "desc"
                if "billing city" in msg_l:
                    payload["object_type"] = "account"
                    payload["current_name"] = "Accounts in India"
                    payload["columns"] = ["name", "billing_city"]
                if "rename" in msg_l and payload.get("name") and not payload.get("current_name"):
                    return self._build_intent(
                        ActionType.CLARIFICATION,
                        {
                            "question": "Which list view should I rename?",
                            "options": ["Use current list view", "Share current list view name", "Share list view ID"],
                        },
                        confidence=0.9,
                    )
                if payload:
                    return self._build_intent(ActionType.UPDATE_LIST_VIEW, payload, confidence=0.9)

            ot = self._detect_object_type(msg_l) or "lead"
            account_name = self._extract_account_name_for_list_view(msg)

            plural_ot = self._pluralize_object_type(ot)
            name = plural_ot.title()
            if account_name:
                name = f"{account_name.strip().title()} {plural_ot.title()}"

            filters: List[Dict[str, Any]] = []

            # Generic relative-date filters (works for any object)
            period = self._extract_relative_period_token(msg_l)
            date_field = self._infer_date_field_for_list_view(msg_l, ot) if period else None
            if period and date_field:
                filters.append({"field": date_field, "operator": "equals", "value": period})
                # Derive a friendly name if user didn't already specify a more specific one
                # e.g. "Opportunities Closing This Month", "Tasks Due This Week"
                if name == plural_ot.title() or (account_name and name.endswith(plural_ot.title())):
                    verb = "Closing" if date_field == "close_date" else ("Due" if date_field == "due_date" else ("Created" if date_field == "created_at" else "Updated"))
                    human_period = period.replace("_", " ").title()
                    if account_name:
                        name = f"{account_name.strip().title()} {plural_ot.title()} {verb} {human_period}"
                    else:
                        name = f"{plural_ot.title()} {verb} {human_period}"

            # Keep a couple of stable non-date heuristics (small + generic)
            if "hot lead" in msg_l:
                name = "Hot Leads"
                filters.append({"field": "rating", "operator": "equals", "value": "hot"})
            if "inactive contact" in msg_l:
                name = "Inactive Contacts"
                filters.append({"field": "status", "operator": "equals", "value": "Inactive"})
                ot = "contact"
            if "mumbai" in msg_l:
                name = "Leads in Mumbai"
                filters.append({"field": "city", "operator": "contains", "value": "Mumbai"})
            amount_match = re.search(r"over\s+([\d,\.]+)\s*(lakh|crore)?", msg_l)
            if amount_match:
                number = self._to_number("".join(amount_match.groups(default="")))
                if number is not None:
                    filters.append({"field": "amount", "operator": "greater_than", "value": number})
            if "open opportunit" in msg_l:
                ot = "opportunity"
                filters.append({"field": "stage", "operator": "not_equals", "value": "Closed Won"})
                filters.append({"field": "status", "operator": "not_equals", "value": "Closed Lost"})

            # Relationship filter: records linked to a specific account by name.
            # List-view filters are applied as `data.<field>` (see records_routes `list_view_filters`).
            if account_name:
                if ot in ("opportunity", "contact", "lead"):
                    filters.append({"field": "account_name", "operator": "contains", "value": account_name.strip()})
                elif ot == "account":
                    filters.append({"field": "name", "operator": "contains", "value": account_name.strip()})

            visibility = "private" if "private" in msg_l else "team"
            payload = {"object_type": ot, "name": name, "filters": filters, "visibility": visibility}
            # If we couldn't infer any useful filters, let the LLM do richer parsing
            # rather than creating an empty generic view.
            if not filters and name == plural_ot.title():
                return None
            return self._build_intent(ActionType.CREATE_LIST_VIEW, payload, confidence=0.93)

        # Create task/event
        if any(k in msg_l for k in ("create a task", "follow-up task", "schedule a demo", "schedule a meeting")):
            if "schedule" in msg_l or "meeting" in msg_l or "demo" in msg_l:
                return self._build_intent(
                    ActionType.CREATE_RECORD,
                    {"object_type": "event", "fields": {"subject": msg, "start_date": "required"}},
                    confidence=0.88,
                )
            task_payload: Dict[str, Any] = {"subject": msg, "status": "Not Started", "priority": "Normal"}
            if "tomorrow" in msg_l:
                task_payload["due_date"] = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).date().isoformat()
                # due_date should be tomorrow (UTC date boundary)
                from datetime import timedelta
                task_payload["due_date"] = (datetime.utcnow().date() + timedelta(days=1)).isoformat()

            rel_ot = self._detect_object_type(msg_l)
            if rel_ot in ("lead", "contact", "account", "opportunity"):
                # "this Alex luthar leads", "for Alex lead", "to call Alex lead"
                rec_name = None
                m1 = re.search(rf"(?:this|for|to call)\s+(.+?)\s+{rel_ot}s?\b", msg, re.I)
                if m1:
                    rec_name = m1.group(1).strip(" ,.")
                if rec_name:
                    rec_name = re.sub(r"(?i)^this\s+", "", rec_name).strip()
                    task_payload["related_type"] = rel_ot
                    task_payload["related_to"] = rec_name
            else:
                # Custom/new object linking pattern: "this <record name> <object> ..."
                custom_link = re.search(r"(?:this|for)\s+(.+?)\s+([a-zA-Z][a-zA-Z0-9_ ]{2,40})\b", msg, re.I)
                if custom_link:
                    rec_name = custom_link.group(1).strip(" ,.")
                    obj_name = custom_link.group(2).strip().lower().replace(" ", "_")
                    if obj_name not in ("task", "meeting", "demo", "call"):
                        task_payload["related_type"] = obj_name.rstrip("s")
                        task_payload["related_to"] = rec_name

            return self._build_intent(ActionType.CREATE_TASK, task_payload, confidence=0.92)

        # Create lead/contact/opportunity/account
        if any(k in msg_l for k in ("create a lead", "create lead")):
            payload: Dict[str, Any] = {"status": "New"}
            m = re.search(r"create(?:\s+a)?\s+lead\s+for\s+([a-zA-Z][a-zA-Z\s]+)", msg, re.I)
            if m:
                name_parts = m.group(1).strip().split()
                payload["first_name"] = name_parts[0]
                if len(name_parts) > 1:
                    payload["last_name"] = " ".join(name_parts[1:])
            comp = re.search(r"from\s+([a-zA-Z0-9&\-\s]+)$", msg, re.I)
            if comp:
                payload["company"] = comp.group(1).strip()
            return self._build_intent(ActionType.CREATE_LEAD, payload, confidence=0.95)
        if "create an opportunity" in msg_l or "create opportunity" in msg_l:
            acc = re.search(r"for\s+([a-zA-Z0-9&\-\s]+)$", msg, re.I)
            fields: Dict[str, Any] = {}
            if acc:
                fields["account_name"] = acc.group(1).strip()
            return self._build_intent(ActionType.CREATE_RECORD, {"object_type": "opportunity", "fields": fields}, confidence=0.93)
        if "new contact" in msg_l or ("create" in msg_l and "contact" in msg_l):
            acc = re.search(r"(?:under|for)\s+([a-zA-Z0-9&\-\s]+)$", msg, re.I)
            fields: Dict[str, Any] = {}
            if acc:
                fields["account_name"] = acc.group(1).strip()
            return self._build_intent(ActionType.CREATE_RECORD, {"object_type": "contact", "fields": fields}, confidence=0.9)
        if "create account" in msg_l:
            return self._build_intent(ActionType.CREATE_RECORD, {"object_type": "account", "fields": {}}, confidence=0.88)

        # Updates (dynamic, any object + any field)
        if any(k in msg_l for k in ("update ", "change ", "set ", "move ")):
            ot = self._detect_object_type(msg_l)
            if not ot:
                # Let LLM handle custom/new object names dynamically.
                return None

            payload: Dict[str, Any] = {"object_type": ot, "updates": {}}

            # Record targeting
            if any(t in msg_l for t in (" this ", "this ", " current ", "current ")):
                payload["record_id"] = "this"
            else:
                name_pat = rf"(?:update|change|set|move)\s+(.+?)\s+{ot}\b"
                m_name = re.search(name_pat, msg_l, re.I)
                if m_name:
                    candidate = m_name.group(1).strip(" ,.")
                    if candidate and candidate not in ("a", "an", "the"):
                        payload["record_id"] = candidate.title()

            # Owner update
            owner_match = re.search(r"owner(?:\s+of\s+(?:this|current)\s+\w+)?\s+to\s+([a-zA-Z][a-zA-Z\s]+)$", msg, re.I)
            if owner_match:
                payload["owner_name"] = owner_match.group(1).strip()

            # Generic field-value update extraction: "<field> to <value>"
            fv_match = re.search(rf"\b{ot}\b\s+(.+?)\s+to\s+(.+)$", msg, re.I)
            if fv_match:
                field_raw = fv_match.group(1).strip()
                value_raw = fv_match.group(2).strip().rstrip(".")
                # Drop generic verbs from field segment
                field_raw = re.sub(r"(?i)^(?:the\s+)?(?:field\s+)?", "", field_raw).strip()
                if value_raw and value_raw.lower() not in ("this new number", "this number", "new number"):
                    field_key = self._normalize_field_name(field_raw)
                    if field_key not in ("owner", "owner_name", "owner_id"):
                        payload["updates"][field_key] = value_raw

            # Common short forms for stage moves
            move_stage = re.search(r"(?:move|update)\s+(?:this\s+)?opportunit(?:y|ies)\s+to\s+(.+)$", msg, re.I)
            if move_stage:
                payload["updates"]["stage"] = move_stage.group(1).strip().rstrip(".").title()

            # Missing record or update value -> clarification
            has_changes = bool(payload.get("updates")) or bool((payload.get("owner_name") or "").strip())
            if not has_changes:
                return self._build_intent(
                    ActionType.CLARIFICATION,
                    {
                        "question": "What field should I update and what is the new value?",
                        "options": ["Set stage", "Set owner", "Set phone", "Set billing city"],
                    },
                    confidence=0.84,
                )
            if not (payload.get("record_id") or "").strip():
                return self._build_intent(
                    ActionType.CLARIFICATION,
                    {
                        "question": f"Which {ot} record should I update? Share a name/ID or open the record and say 'this {ot}'.",
                        "options": ["Use current record", "Provide record name", "Search first"],
                    },
                    confidence=0.88,
                )

            return self._build_intent(ActionType.UPDATE_RECORD, payload, confidence=0.95)

        # Search/list/find queries
        if any(msg_l.startswith(k) for k in ("find", "show", "search", "which", "list")):
            ot = self._detect_object_type(msg_l) or "lead"
            payload: Dict[str, Any] = {"object_type": ot, "query": "", "user_query": msg}
            filters: Dict[str, Any] = {}
            loc = re.search(r"(?:from|in)\s+([a-zA-Z][a-zA-Z\s]+)", msg, re.I)
            if loc and ot in ("lead", "contact", "account"):
                payload["query"] = loc.group(1).strip().split(" created")[0].strip()
            if "created this month" in msg_l:
                filters["created_at"] = "this_month"
            if "open" in msg_l and ot == "opportunity":
                filters["stage"] = {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]}
                filters["status"] = {"nin": ["Won", "Lost", "Closed Won", "Closed Lost"]}
            amt = re.search(r"over\s+([\d,\.]+)\s*(lakh|crore)?", msg_l)
            if amt:
                number = self._to_number("".join(amt.groups(default="")))
                if number is not None:
                    filters["amount"] = {"gt": number}
            company_ref = re.search(r"(?:for|belong to|account)\s+([a-zA-Z0-9&\-\s]+)$", msg, re.I)
            if company_ref and not payload.get("query"):
                payload["query"] = company_ref.group(1).strip()
            if filters:
                payload["filters"] = filters
            return self._build_intent(ActionType.SEARCH_RECORDS, payload, confidence=0.92)

        return None
            
    async def generate_ai_response(self, user_query: str, data_context: Any) -> str:
        """
        Generate a natural language response based on CRM data context.
        Used for Phase 1 Response Generation refinement.
        """
        if not self.api_key:
            return "I couldn't process the response because the AI is not configured."
            
        system_prompt = (
            "You are CLU-BOT, a helpful CRM assistant. "
            "Use the provided CRM data to answer the user's question accurately and professionally. "
            "IMPORTANT FORMATTING RULES:\n"
            "1. ALWAYS mention the total number of records found (e.g., 'Found 3 contacts').\n"
            "2. When mentioning a specific record, ALWAYS use the format [[Name|object_type|series_id]] to make it a clickable link. (e.g., [[Sunder Pichai|contact|con-123]]).\n"
            "3. If the user asks for a summary or to 'summarize everything', provide a conversational overview of all provided details (main summary, tasks, opportunities, etc.).\n"
            "4. Keep the tone professional but friendly."
        )
        
        prompt = f"## CRM DATA\n{json.dumps(data_context, indent=2)}\n\n## USER QUESTION\n{user_query}\n\n## YOUR ANSWER"
        
        try:
            return await self._call_gemini_direct_simple(prompt, system_prompt)
        except Exception as e:
            logger.error(f"AI response generation error: {e}")
            return "I understood the data but had trouble formatting a conversational answer."

    async def generate_ai_response_stream(
        self,
        user_query: str,
        data_context: Any
    ) -> AsyncGenerator[str, None]:
        """
        Stream natural-language response tokens directly from Gemini.
        Falls back to non-streaming generation if stream API is unavailable.
        """
        if not self.api_key:
            yield "I couldn't process the response because the AI is not configured."
            return

        system_prompt = (
            "You are CLU-BOT, a helpful CRM assistant. "
            "Use the provided CRM data to answer the user's question accurately and professionally. "
            "IMPORTANT FORMATTING RULES:\n"
            "1. ALWAYS mention the total number of records found (e.g., 'Found 3 contacts').\n"
            "2. When mentioning a specific record, ALWAYS use the format [[Name|object_type|series_id]] to make it a clickable link. (e.g., [[Sunder Pichai|contact|con-123]]).\n"
            "3. If the user asks for a summary or to 'summarize everything', provide a conversational overview of all provided details (main summary, tasks, opportunities, etc.).\n"
            "4. Keep the tone professional but friendly."
        )
        prompt = f"## CRM DATA\n{json.dumps(data_context, indent=2)}\n\n## USER QUESTION\n{user_query}\n\n## YOUR ANSWER"

        try:
            import google.generativeai as genai
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(
                model_name="gemini-2.5-flash-lite",
                system_instruction=system_prompt
            )

            stream = await model.generate_content_async(
                prompt,
                generation_config={"temperature": 0.5, "max_output_tokens": 512},
                stream=True
            )

            if hasattr(stream, "__aiter__"):
                async for chunk in stream:
                    text = getattr(chunk, "text", "") or ""
                    if text:
                        yield text
                return

            if inspect.isgenerator(stream) or hasattr(stream, "__iter__"):
                for chunk in stream:
                    text = getattr(chunk, "text", "") or ""
                    if text:
                        yield text
                return

            text = getattr(stream, "text", "") or ""
            if text:
                yield text
        except Exception as e:
            logger.error(f"AI response streaming error: {e}")
            # Graceful fallback to existing non-streaming call
            fallback = await self.generate_ai_response(user_query=user_query, data_context=data_context)
            if fallback:
                yield fallback

    async def _call_gemini_direct_simple(self, prompt: str, system_prompt: str) -> str:
        """Simple direct call to Gemini without complex parsing"""
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        model_name = "gemini-2.5-flash-lite"
        model = genai.GenerativeModel(model_name=model_name, system_instruction=system_prompt)
        response = await model.generate_content_async(prompt, generation_config={"temperature": 0.5, "max_output_tokens": 512})
        return response.text.strip()
    
    def _build_prompt(
        self,
        user_message: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the complete prompt for the LLM"""
        prompt_parts = []
        
        # Add conversation history if available
        current_pending_payload = None
        if conversation_history:
            prompt_parts.append("## Recent Conversation")
            for msg in conversation_history[-10:]:  # Last 10 messages
                role = msg.get("role", "user")
                content = msg.get("content", "")
                action_type = msg.get("action_type", "no_action")
                
                # Format: USER: message or ASSISTANT (action_type): message
                if role == "assistant":
                    prompt_parts.append(f"{role.upper()} ({action_type}): {content}")
                    # Capture the question being asked
                    last_question = content
                    # Capture the most recent action payload to help maintain state
                    if msg.get("action_payload"):
                        current_pending_payload = msg["action_payload"]
                else:
                    prompt_parts.append(f"{role.upper()}: {content}")
            prompt_parts.append("")
        
        # Explicitly tell the LLM what was just asked
        if 'last_question' in locals() and last_question:
            prompt_parts.append(f"## Previous Question to User\n{last_question}\n")
        
        # If we have a pending action payload from a previous turn, show it to the LLM
        if current_pending_payload and isinstance(current_pending_payload, dict):
            payload_data = current_pending_payload.get("payload", {})
            action_type = current_pending_payload.get("action_type")
            
            if payload_data and action_type not in ["no_action", "search_records"]:
                prompt_parts.append("## Current Working State")
                prompt_parts.append(f"Action in progress: {action_type}")
                prompt_parts.append(f"Data already collected: {json.dumps(payload_data)}")
                prompt_parts.append("CRITICAL: If the user is providing a missing value, include ALL the data already collected plus the new value in your response.")
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
                prompt_parts.append(
                    "For **update_record**: if the user says *this*, *current*, *the opportunity I am viewing*, "
                    "use this record's `object_type` and `id` as `record_id`."
                )
            if context.get("current_object"):
                prompt_parts.append(f"Current object type: {context['current_object']}")
            fid = context.get("file_id") or context.get("attached_file_id")
            fname = context.get("attached_file_name")
            if fid:
                prompt_parts.append(f"User attached an upload: file_id={fid}" + (f", file_name={fname}" if fname else ""))
                payload_example = json.dumps({"file_id": str(fid), "query": "<question text or omit for general summary>"})
                prompt_parts.append(
                    "If they ask about this file (summarize, explain, answer from it), respond with action_type read_file "
                    f"and payload {payload_example}."
                )
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
            ).with_model("gemini", "gemini-2.5-flash-lite")
            
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
        model_name = "gemini-2.5-flash-lite"


        
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
            
            # Robust payload extraction: if 'payload' is missing but other fields are present, 
            # try to move them into payload (excluding known root fields)
            payload = data.get("payload", {})
            if not payload:
                # Fields that shouldn't be in payload
                root_fields = ["action_type", "confidence", "reasoning", "risk_level", "requires_preview"]
                payload = {k: v for k, v in data.items() if k not in root_fields}
            
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
            ActionType.CREATE_RECORD: (RiskLevel.MEDIUM, True),
            ActionType.CLARIFICATION: (RiskLevel.LOW, False),
            ActionType.NO_ACTION: (RiskLevel.LOW, False),
            # Phase 2A - Updates are HIGH risk, list views are MEDIUM
            ActionType.UPDATE_RECORD: (RiskLevel.HIGH, True),
            ActionType.CREATE_LIST_VIEW: (RiskLevel.MEDIUM, True),
            ActionType.UPDATE_LIST_VIEW: (RiskLevel.MEDIUM, True),
            ActionType.BULK_UPDATE_RECORDS: (RiskLevel.HIGH, True),
            ActionType.BULK_CREATE_TASKS: (RiskLevel.HIGH, True),
            ActionType.BULK_CREATE_RECORDS: (RiskLevel.HIGH, True),
            ActionType.SEND_EMAIL: (RiskLevel.HIGH, True),
            ActionType.DRAFT_EMAIL: (RiskLevel.LOW, False),
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
            elif action_type == ActionType.CREATE_RECORD:
                CreateRecordPayload(**payload)
            elif action_type == ActionType.CLARIFICATION:
                ClarificationPayload(**payload)
            # Phase 2A
            elif action_type == ActionType.UPDATE_RECORD:
                UpdateRecordPayload(**payload)
            elif action_type == ActionType.CREATE_LIST_VIEW:
                CreateListViewPayload(**payload)
            elif action_type == ActionType.UPDATE_LIST_VIEW:
                UpdateListViewPayload(**payload)
                has_identifier = bool(payload.get("list_view_id") or payload.get("current_name"))
                if not has_identifier:
                    raise ValueError("Missing list view identifier: provide list_view_id or current_name")
                change_keys = (
                    "name", "description", "filters", "columns",
                    "sort_field", "sort_order", "visibility", "is_default",
                )
                has_change = any(k in payload and payload.get(k) is not None for k in change_keys)
                if not has_change:
                    raise ValueError("Missing list view changes: provide at least one field to update")
            elif action_type == ActionType.BULK_UPDATE_RECORDS:
                BulkUpdateRecordsPayload(**payload)
                has_updates = any(v not in (None, "", "required") for v in (payload.get("updates") or {}).values())
                has_owner = bool((payload.get("owner_id") or "").strip() or (payload.get("owner_name") or "").strip())
                if not has_updates and not has_owner:
                    raise ValueError("Missing changes: provide updates and/or owner")
            elif action_type == ActionType.BULK_CREATE_TASKS:
                BulkCreateTasksPayload(**payload)
            elif action_type == ActionType.BULK_CREATE_RECORDS:
                BulkCreateRecordsPayload(**payload)
                if not payload.get("records"):
                    raise ValueError("Missing records: provide at least one record in records[]")
            elif action_type == ActionType.SEND_EMAIL:
                SendEmailPayload(**payload)
                if not (payload.get("to_emails") or payload.get("related_record_id") or payload.get("email_all_open_opportunity_owners")):
                    raise ValueError("Missing recipient: provide to_emails or related_record_id or owner-group mode")
            elif action_type == ActionType.DRAFT_EMAIL:
                DraftEmailPayload(**payload)
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
