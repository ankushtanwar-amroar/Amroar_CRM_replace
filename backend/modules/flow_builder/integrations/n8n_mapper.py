"""
n8n Mapper
Converts between CRM Flow structure and n8n Workflow structure
"""
import logging
from typing import Dict, Any, List
import uuid

logger = logging.getLogger(__name__)


class N8nMapper:
    """Maps CRM flows to n8n workflows and vice versa"""
    
    @staticmethod
    def crm_to_n8n_workflow(flow: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        """
        Convert CRM flow structure to n8n workflow format
        
        Args:
            flow: CRM flow data
            tenant_id: Tenant identifier
            
        Returns:
            n8n workflow structure
        """
        workflow_name = flow.get("name", "Untitled Flow")
        workflow_nodes = []
        workflow_connections = {}
        
        # Add trigger node first
        triggers = flow.get("triggers", [])
        if triggers:
            trigger_node = N8nMapper._map_trigger_to_n8n(triggers[0], tenant_id)
            workflow_nodes.append(trigger_node)
        
        # Map CRM nodes to n8n nodes
        crm_nodes = flow.get("nodes", [])
        for idx, crm_node in enumerate(crm_nodes):
            n8n_node = N8nMapper._map_crm_node_to_n8n(crm_node, idx, tenant_id)
            if n8n_node:
                workflow_nodes.append(n8n_node)
        
        # Map edges to n8n connections
        crm_edges = flow.get("edges", [])
        workflow_connections = N8nMapper._map_edges_to_connections(crm_edges, crm_nodes)
        
        # Build n8n workflow structure
        n8n_workflow = {
            "name": workflow_name,
            "nodes": workflow_nodes,
            "connections": workflow_connections,
            "active": flow.get("status") == "active",
            "settings": {
                "executionOrder": "v1"
            },
            "tags": [
                {"id": "crm", "name": "CRM"},
                {"id": tenant_id, "name": f"Tenant: {tenant_id}"}
            ]
        }
        
        return n8n_workflow
    
    @staticmethod
    def _map_trigger_to_n8n(trigger: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        """Map CRM trigger to n8n trigger node"""
        trigger_type = trigger.get("type", "webhook")
        trigger_config = trigger.get("config", {})
        
        if trigger_type == "db":
            # Database trigger -> Webhook in n8n
            return {
                "parameters": {
                    "httpMethod": "POST",
                    "path": f"crm-trigger-{trigger.get('id', uuid.uuid4().hex[:8])}",
                    "responseMode": "onReceived",
                    "options": {}
                },
                "name": "CRM Trigger",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 1,
                "position": [250, 50],
                "webhookId": trigger.get('id', uuid.uuid4().hex[:8])
            }
        
        elif trigger_type == "webhook":
            return {
                "parameters": {
                    "httpMethod": trigger_config.get("method", "POST"),
                    "path": trigger_config.get("slug", "webhook"),
                    "responseMode": "onReceived",
                    "options": {}
                },
                "name": "Webhook Trigger",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 1,
                "position": [250, 50]
            }
        
        elif trigger_type == "schedule":
            return {
                "parameters": {
                    "rule": {
                        "interval": [
                            {
                                "field": "cronExpression",
                                "expression": trigger_config.get("cron", "0 * * * *")
                            }
                        ]
                    }
                },
                "name": "Schedule Trigger",
                "type": "n8n-nodes-base.cron",
                "typeVersion": 1,
                "position": [250, 50]
            }
        
        else:
            # Default to webhook
            return {
                "parameters": {
                    "httpMethod": "POST",
                    "path": "default-trigger",
                    "responseMode": "onReceived"
                },
                "name": "Trigger",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 1,
                "position": [250, 50]
            }
    
    @staticmethod
    def _map_crm_node_to_n8n(crm_node: Dict[str, Any], index: int, tenant_id: str) -> Dict[str, Any]:
        """Map individual CRM node to n8n node"""
        node_type = crm_node.get("type", "action")
        node_config = crm_node.get("config", {})
        node_label = crm_node.get("label", "Action")
        position = crm_node.get("position", {})
        
        # Calculate n8n position
        n8n_position = [
            int(position.get("x", 250)),
            int(position.get("y", 200 + (index * 150)))
        ]
        
        # Map based on node type
        if node_type == "connector":
            # Email connector
            email_service = node_config.get("email_service", "system")
            return {
                "parameters": {
                    "operation": "send",
                    "email": node_config.get("to", ""),
                    "subject": node_config.get("subject", ""),
                    "text": node_config.get("body", ""),
                    "fromEmail": node_config.get("from", "noreply@crm.com")
                },
                "name": node_label or "Send Email",
                "type": "n8n-nodes-base.emailSend",
                "typeVersion": 2,
                "position": n8n_position,
                "credentials": {}
            }
        
        elif node_type == "condition":
            # IF node
            condition_config = node_config.get("condition", {})
            return {
                "parameters": {
                    "conditions": {
                        "string": [
                            {
                                "value1": f"=${{json[\"{condition_config.get('field', 'status')}\"]}}",
                                "operation": N8nMapper._map_operator(condition_config.get("operator", "equals")),
                                "value2": condition_config.get("value", "")
                            }
                        ]
                    }
                },
                "name": node_label or "IF Condition",
                "type": "n8n-nodes-base.if",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "assignment":
            # Set node
            assignments = node_config.get("assignments", [])
            values = {}
            for assignment in assignments:
                values[assignment.get("variable")] = assignment.get("value")
            
            return {
                "parameters": {
                    "values": values,
                    "options": {}
                },
                "name": node_label or "Set Variables",
                "type": "n8n-nodes-base.set",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "loop":
            # Split In Batches node
            return {
                "parameters": {
                    "batchSize": node_config.get("batch_size", 1),
                    "options": {}
                },
                "name": node_label or "Loop",
                "type": "n8n-nodes-base.splitInBatches",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "decision":
            # Switch node
            rules = node_config.get("rules", [])
            switch_rules = []
            for rule in rules:
                switch_rules.append({
                    "conditions": {
                        "string": [
                            {
                                "value1": f"=${{json[\"{rule.get('field', 'status')}\"]}}",
                                "value2": rule.get("value", "")
                            }
                        ]
                    },
                    "renameOutput": True,
                    "outputKey": rule.get("label", "Case")
                })
            
            return {
                "parameters": {
                    "dataType": "string",
                    "value1": node_config.get("field", ""),
                    "rules": {"rules": switch_rules},
                    "fallbackOutput": "extra"
                },
                "name": node_label or "Switch",
                "type": "n8n-nodes-base.switch",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "mcp":
            # HTTP Request to CRM API
            mcp_action = node_config.get("mcp_action", "")
            return {
                "parameters": {
                    "method": "POST",
                    "url": f"=${{env.CRM_API_URL}}/api/{mcp_action}",
                    "sendHeaders": True,
                    "headerParameters": {
                        "parameters": [
                            {
                                "name": "Authorization",
                                "value": f"Bearer ${{env.CRM_API_TOKEN}}"
                            }
                        ]
                    },
                    "sendBody": True,
                    "bodyParameters": {
                        "parameters": node_config.get("activity_data", [])
                    },
                    "options": {}
                },
                "name": node_label or "CRM Action",
                "type": "n8n-nodes-base.httpRequest",
                "typeVersion": 3,
                "position": n8n_position
            }
        
        elif node_type == "ai_prompt":
            # OpenAI node
            return {
                "parameters": {
                    "operation": "message",
                    "modelId": "gpt-4",
                    "messages": {
                        "values": [
                            {
                                "role": "user",
                                "content": node_config.get("prompt", "")
                            }
                        ]
                    },
                    "options": {}
                },
                "name": node_label or "AI Agent",
                "type": "@n8n/n8n-nodes-langchain.openAi",
                "typeVersion": 1,
                "position": n8n_position,
                "credentials": {
                    "openAiApi": {
                        "id": "1",
                        "name": "OpenAI API"
                    }
                }
            }
        
        elif node_type == "transform":
            # Function node for data transformation
            return {
                "parameters": {
                    "functionCode": node_config.get("code", "return items;")
                },
                "name": node_label or "Transform",
                "type": "n8n-nodes-base.function",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "collection_filter":
            # Filter node
            return {
                "parameters": {
                    "conditions": {
                        "string": [
                            {
                                "value1": node_config.get("field", ""),
                                "operation": node_config.get("operator", "equals"),
                                "value2": node_config.get("value", "")
                            }
                        ]
                    }
                },
                "name": node_label or "Filter",
                "type": "n8n-nodes-base.filter",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "wait":
            # Wait node
            duration = node_config.get("duration", 5)
            unit = node_config.get("unit", "minutes")
            # Convert to milliseconds
            unit_multipliers = {
                "seconds": 1000,
                "minutes": 60000,
                "hours": 3600000,
                "days": 86400000
            }
            wait_time = duration * unit_multipliers.get(unit, 60000)
            
            return {
                "parameters": {
                    "amount": wait_time,
                    "unit": "ms"
                },
                "name": node_label or "Wait",
                "type": "n8n-nodes-base.wait",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "merge":
            # Merge node
            return {
                "parameters": {
                    "mode": node_config.get("mode", "combine"),
                    "mergeByFields": {
                        "values": []
                    },
                    "options": {}
                },
                "name": node_label or "Merge",
                "type": "n8n-nodes-base.merge",
                "typeVersion": 2,
                "position": n8n_position
            }
        
        elif node_type == "http_request":
            # HTTP Request node
            return {
                "parameters": {
                    "method": node_config.get("method", "GET"),
                    "url": node_config.get("url", ""),
                    "sendHeaders": True if node_config.get("headers") else False,
                    "headerParameters": {
                        "parameters": [
                            {"name": k, "value": v}
                            for k, v in node_config.get("headers", {}).items()
                        ]
                    },
                    "sendBody": True if node_config.get("body") else False,
                    "bodyParameters": {
                        "parameters": [
                            {"name": k, "value": v}
                            for k, v in node_config.get("body", {}).items()
                        ]
                    },
                    "options": {}
                },
                "name": node_label or "HTTP Request",
                "type": "n8n-nodes-base.httpRequest",
                "typeVersion": 4,
                "position": n8n_position
            }
        
        elif node_type == "webhook":
            # Webhook node (usually a trigger, but can be used as action)
            return {
                "parameters": {
                    "httpMethod": "POST",
                    "path": node_config.get("path", "webhook"),
                    "responseMode": "onReceived",
                    "options": {}
                },
                "name": node_label or "Webhook",
                "type": "n8n-nodes-base.webhook",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        elif node_type == "slack":
            # Slack node
            return {
                "parameters": {
                    "resource": "message",
                    "operation": "post",
                    "channel": node_config.get("channel", "#general"),
                    "text": node_config.get("message", ""),
                    "otherOptions": {}
                },
                "name": node_label or "Slack",
                "type": "n8n-nodes-base.slack",
                "typeVersion": 2,
                "position": n8n_position,
                "credentials": {
                    "slackApi": {
                        "id": "1",
                        "name": "Slack account"
                    }
                }
            }
        
        elif node_type == "teams":
            # Microsoft Teams node
            return {
                "parameters": {
                    "resource": "message",
                    "operation": "send",
                    "teamId": node_config.get("team_id", ""),
                    "channelId": node_config.get("channel", ""),
                    "messageType": "text",
                    "message": node_config.get("message", "")
                },
                "name": node_label or "Teams",
                "type": "n8n-nodes-base.microsoftTeams",
                "typeVersion": 1,
                "position": n8n_position,
                "credentials": {
                    "microsoftTeamsOAuth2Api": {
                        "id": "1",
                        "name": "Microsoft Teams account"
                    }
                }
            }
        
        elif node_type == "google_sheets":
            # Google Sheets node
            operation = node_config.get("operation", "read")
            params = {
                "documentId": {
                    "mode": "id",
                    "value": node_config.get("spreadsheetId", "")
                },
                "sheetName": {
                    "mode": "name",
                    "value": node_config.get("sheet", "Sheet1")
                },
                "options": {}
            }
            
            if operation == "read":
                params["operation"] = "read"
                params["range"] = node_config.get("range", "A1:Z")
            elif operation == "append":
                params["operation"] = "append"
                params["values"] = node_config.get("values", [])
            elif operation == "update":
                params["operation"] = "update"
                params["range"] = node_config.get("range", "A1")
                params["values"] = node_config.get("values", [])
            
            return {
                "parameters": params,
                "name": node_label or "Google Sheets",
                "type": "n8n-nodes-base.googleSheets",
                "typeVersion": 4,
                "position": n8n_position,
                "credentials": {
                    "googleSheetsOAuth2Api": {
                        "id": "1",
                        "name": "Google Sheets account"
                    }
                }
            }
        
        elif node_type == "database":
            # Database node (MySQL/PostgreSQL)
            return {
                "parameters": {
                    "operation": node_config.get("operation", "executeQuery"),
                    "query": node_config.get("query", "SELECT * FROM table"),
                    "options": {}
                },
                "name": node_label or "Database",
                "type": "n8n-nodes-base.postgres",
                "typeVersion": 2,
                "position": n8n_position,
                "credentials": {
                    "postgres": {
                        "id": "1",
                        "name": "PostgreSQL account"
                    }
                }
            }
        
        elif node_type == "function":
            # Function node for custom code
            return {
                "parameters": {
                    "functionCode": node_config.get("code", "return items;")
                },
                "name": node_label or "Function",
                "type": "n8n-nodes-base.function",
                "typeVersion": 1,
                "position": n8n_position
            }
        
        else:
            # Default to NoOp node
            return {
                "parameters": {},
                "name": node_label or "Action",
                "type": "n8n-nodes-base.noOp",
                "typeVersion": 1,
                "position": n8n_position
            }
    
    @staticmethod
    def _map_operator(operator: str) -> str:
        """Map CRM operator to n8n operator"""
        operator_map = {
            "equals": "equal",
            "not_equals": "notEqual",
            "contains": "contains",
            "not_contains": "notContains",
            "greater_than": "larger",
            "less_than": "smaller",
            "starts_with": "startsWith",
            "ends_with": "endsWith"
        }
        return operator_map.get(operator, "equal")
    
    @staticmethod
    def _map_edges_to_connections(edges: List[Dict[str, Any]], nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Map CRM edges to n8n connections"""
        connections = {}
        
        # Build node ID to index map
        node_id_to_name = {}
        for node in nodes:
            node_id_to_name[node.get("id")] = node.get("label", "Action")
        
        for edge in edges:
            source_id = edge.get("source")
            target_id = edge.get("target")
            
            source_name = node_id_to_name.get(source_id, "Trigger")
            
            if source_name not in connections:
                connections[source_name] = {
                    "main": [[]]
                }
            
            connections[source_name]["main"][0].append({
                "node": node_id_to_name.get(target_id, "Action"),
                "type": "main",
                "index": 0
            })
        
        return connections
    
    @staticmethod
    def n8n_to_crm_flow(n8n_workflow: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert n8n workflow to CRM flow structure (for sync back)
        
        Args:
            n8n_workflow: n8n workflow data
            
        Returns:
            CRM flow structure
        """
        # This is for future two-way sync
        # Extract nodes, convert types, rebuild edges
        
        crm_flow = {
            "name": n8n_workflow.get("name", "Imported Flow"),
            "description": "Imported from n8n",
            "status": "active" if n8n_workflow.get("active") else "draft",
            "nodes": [],
            "edges": [],
            "triggers": []
        }
        
        # TODO: Implement reverse mapping
        
        return crm_flow
