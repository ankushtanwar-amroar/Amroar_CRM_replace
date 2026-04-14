"""
AI Flow Generator
Uses Gemini to generate flows from natural language descriptions
"""
import os
import json
import logging
import google.generativeai as genai
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# Configure Gemini
GEMINI_API_KEY = "AIzaSyDUTCSdZQP7I5Hopb4gD_1ur6mjZEeKKpQ"
genai.configure(api_key=GEMINI_API_KEY)


async def generate_flow_from_prompt(prompt: str) -> Dict[str, Any]:
    """
    Generate flow structure from natural language prompt using Gemini
    
    Args:
        prompt: Natural language description (e.g., "When lead is created, send email to test@gmail.com")
        
    Returns:
        dict: Flow structure with nodes and edges
    """
    try:
        system_prompt = """You are a Flow Builder AI assistant. Generate flow automation structures from natural language.

**Available Node Types:**

**Core & Triggers:**
- **trigger**: Start node (always required) - supports Lead, Contact, Deal, Account
  - events: afterInsert (created), afterUpdate (updated), afterDelete (deleted), afterRetrieve (searched)

**Communication:**
- **connector**: Email sending (SendGrid or System SMTP)
- **slack**: Send message to Slack channel
- **teams**: Send message to Microsoft Teams

**CRM & Data:**
- **mcp**: CRM actions (create/update records, create activities)
- **database**: Query or update database records

**Logic & Control Flow:**
- **condition**: If-else logic (simple binary branching)
- **decision**: Multi-way branching (switch/case logic)
- **assignment**: Set variables or field values
- **loop**: Iterate through collections
- **wait**: Pause flow for specified duration
- **merge**: Merge multiple branches into one

**Data Operations:**
- **transform**: Transform data from one format to another
- **collection_sort**: Sort collections by field
- **collection_filter**: Filter records from collection
- **function**: Execute custom JavaScript code

**External Integrations:**
- **http_request**: Make API calls to external services
- **webhook**: Receive data from external webhooks
- **google_sheets**: Read or write to Google Sheets

**AI:**
- **ai_prompt**: AI processing with GPT/Gemini

**Other:**
- **action**: Custom actions

**Output Format (JSON):**
{
  "name": "descriptive name",
  "description": "what this flow does",
  "nodes": [
    {
      "id": "unique_id",
      "type": "trigger|connector|mcp|condition|...",
      "label": "Display Name",
      "config": {
        // Node-specific configuration
      },
      "position": {"x": 250, "y": 50}
    }
  ],
  "edges": [
    {"source": "node_id", "target": "node_id"}
  ],
  "triggers": [
    {
      "id": "trigger_id",
      "type": "db",
      "config": {
        "entity": "Lead|Contact|Deal|Account",
        "event": "afterInsert|afterUpdate|afterDelete|afterRetrieve"
      }
    }
  ]
}

**Configuration Examples:**

Trigger Node:
{
  "id": "trigger_start",
  "type": "trigger",
  "label": "TRIGGER (START)",
  "config": {"entity": "Lead", "event": "afterInsert"}
}

Email Node (connector):
{
  "id": "email_1",
  "type": "connector",
  "label": "SEND EMAIL",
  "config": {
    "connector_type": "sendgrid",
    "email_service": "system",  // or "sendgrid"
    "to": "recipient@email.com",
    "subject": "Email subject",
    "body": "Email body with {{variables}}"
  }
}

CRM Action (mcp):
{
  "id": "mcp_1",
  "type": "mcp",
  "label": "CRM ACTION",
  "config": {
    "mcp_action": "crm.activity.create",
    "activity_data": {
      "subject": "Follow up with {{first_name}}",
      "type": "Email",
      "description": "Automated follow-up"
    }
  }
}

Condition Node:
{
  "id": "condition_1",
  "type": "condition",
  "label": "CONDITION",
  "config": {
    "condition": {
      "field": "status",
      "operator": "equals",
      "value": "New"
    }
  }
}

Wait/Delay Node:
{
  "id": "wait_1",
  "type": "wait",
  "label": "WAIT",
  "config": {
    "duration": 2,
    "unit": "hours"  // minutes, hours, days
  }
}

HTTP Request Node:
{
  "id": "http_1",
  "type": "http_request",
  "label": "API CALL",
  "config": {
    "method": "POST",
    "url": "https://api.example.com/endpoint",
    "headers": {"Content-Type": "application/json"},
    "body": {"data": "{{variable}}"}
  }
}

Slack Node:
{
  "id": "slack_1",
  "type": "slack",
  "label": "SLACK MESSAGE",
  "config": {
    "channel": "#general",
    "message": "New lead created: {{first_name}} {{last_name}}"
  }
}

Google Sheets Node:
{
  "id": "sheets_1",
  "type": "google_sheets",
  "label": "UPDATE SHEET",
  "config": {
    "operation": "append",
    "spreadsheetId": "sheet-id",
    "range": "A1:Z",
    "values": [["{{name}}", "{{email}}"]]
  }
}

**Node Positioning:**
- Trigger: y=50
- Each subsequent node: y += 150 (vertical spacing)
- x=250 (centered)

**User Prompt:** {prompt}

Generate a complete, executable flow. Return ONLY valid JSON, no markdown or explanation."""

        # Create Gemini model
        model = genai.GenerativeModel('gemini-pro')
        
        # Generate flow
        logger.info(f"Generating flow from prompt: {prompt}")
        response = model.generate_content(system_prompt.format(prompt=prompt))
        
        # Parse response
        response_text = response.text.strip()
        logger.info(f"Raw AI response: {response_text[:200]}...")  # Log first 200 chars
        
        # Remove markdown code blocks if present
        if response_text.startswith('```'):
            parts = response_text.split('```')
            if len(parts) >= 2:
                response_text = parts[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
                response_text = response_text.strip()
        
        # Remove any leading/trailing whitespace and newlines
        response_text = response_text.strip()
        
        # Try to find JSON in the response
        if not response_text.startswith('{'):
            # Look for the first { and last }
            start_idx = response_text.find('{')
            end_idx = response_text.rfind('}')
            if start_idx != -1 and end_idx != -1:
                response_text = response_text[start_idx:end_idx+1]
        
        flow_data = json.loads(response_text)
        
        # Transform flow_name to name if needed
        if 'flow_name' in flow_data and 'name' not in flow_data:
            flow_data['name'] = flow_data['flow_name']
        
        logger.info(f"Successfully generated flow: {flow_data.get('name') or flow_data.get('flow_name')}")
        
        return {
            "success": True,
            "flow": flow_data,
            "message": "Flow generated successfully"
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        logger.error(f"Response text: {response_text if 'response_text' in locals() else 'N/A'}")
        return {
            "success": False,
            "error": "Failed to parse AI response. The AI generated invalid JSON format.",
            "message": f"JSON parsing error: {str(e)}"
        }
    except Exception as e:
        logger.error(f"Error generating flow: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to generate flow: {str(e)}"
        }


def validate_flow_structure(flow: Dict[str, Any]) -> tuple[bool, str]:
    """
    Validate generated flow structure
    
    Returns:
        tuple: (is_valid, error_message)
    """
    if not flow.get("nodes"):
        return False, "Flow must have at least one node"
    
    if not flow.get("edges"):
        return False, "Flow must have edges connecting nodes"
    
    if not flow.get("triggers"):
        return False, "Flow must have at least one trigger"
    
    # Check for trigger node
    has_trigger = any(n.get("type") == "trigger" for n in flow["nodes"])
    if not has_trigger:
        return False, "Flow must have a trigger node"
    
    return True, ""
