"""
Seed Data for Integration Categories and Providers
"""
import logging
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


SEED_CATEGORIES = [
    {
        "name": "Email",
        "slug": "email",
        "icon": "mail",
        "description": "Email delivery and marketing services",
        "sort_order": 1
    },
    {
        "name": "AI / LLM",
        "slug": "ai_llm",
        "icon": "brain",
        "description": "AI and Language Model integrations",
        "sort_order": 2
    },
    {
        "name": "Messaging",
        "slug": "messaging",
        "icon": "message-circle",
        "description": "SMS, WhatsApp, and messaging platforms",
        "sort_order": 3
    },
    {
        "name": "Calendar",
        "slug": "calendar",
        "icon": "calendar",
        "description": "Calendar and scheduling integrations",
        "sort_order": 4
    },
    {
        "name": "CRM Sync",
        "slug": "crm_sync",
        "icon": "refresh-cw",
        "description": "Sync data with external CRMs",
        "sort_order": 5
    },
    {
        "name": "Universal API",
        "slug": "universal_api",
        "icon": "globe",
        "description": "Connect to any REST API",
        "sort_order": 99
    }
]


SEED_PROVIDERS = [
    # Email Providers
    {
        "name": "SendGrid",
        "slug": "sendgrid",
        "category_slug": "email",
        "logo_icon": "send",
        "description": "Transactional and marketing email service",
        "docs_url": "https://docs.sendgrid.com/",
        "auth_schema": [
            {
                "key": "api_key",
                "label": "API Key",
                "type": "password",
                "required": True,
                "placeholder": "SG.xxxxxxxxxx",
                "help_text": "Your SendGrid API key"
            },
            {
                "key": "from_email",
                "label": "Default From Email",
                "type": "text",
                "required": True,
                "placeholder": "noreply@yourdomain.com"
            },
            {
                "key": "from_name",
                "label": "Default From Name",
                "type": "text",
                "required": False,
                "placeholder": "Your Company"
            }
        ],
        "test_endpoint": {
            "url": "https://api.sendgrid.com/v3/user/profile",
            "method": "GET",
            "headers": {
                "Authorization": "Bearer {{api_key}}"
            },
            "success_status": [200]
        }
    },
    {
        "name": "Mailgun",
        "slug": "mailgun",
        "category_slug": "email",
        "logo_icon": "mail",
        "description": "Email API for developers",
        "docs_url": "https://documentation.mailgun.com/",
        "auth_schema": [
            {
                "key": "api_key",
                "label": "API Key",
                "type": "password",
                "required": True,
                "placeholder": "key-xxxxxxxxxx"
            },
            {
                "key": "domain",
                "label": "Domain",
                "type": "text",
                "required": True,
                "placeholder": "mg.yourdomain.com"
            },
            {
                "key": "region",
                "label": "Region",
                "type": "select",
                "required": True,
                "options": [
                    {"value": "us", "label": "US"},
                    {"value": "eu", "label": "EU"}
                ],
                "default_value": "us"
            }
        ],
        "test_endpoint": {
            "url": "https://api.mailgun.net/v3/{{domain}}",
            "method": "GET",
            "headers": {
                "Authorization": "Basic {{api_key}}"
            },
            "success_status": [200]
        }
    },
    {
        "name": "AWS SES",
        "slug": "aws_ses",
        "category_slug": "email",
        "logo_icon": "cloud",
        "description": "Amazon Simple Email Service",
        "docs_url": "https://docs.aws.amazon.com/ses/",
        "auth_schema": [
            {
                "key": "access_key_id",
                "label": "Access Key ID",
                "type": "text",
                "required": True,
                "placeholder": "AKIAIOSFODNN7EXAMPLE"
            },
            {
                "key": "secret_access_key",
                "label": "Secret Access Key",
                "type": "password",
                "required": True
            },
            {
                "key": "region",
                "label": "AWS Region",
                "type": "select",
                "required": True,
                "options": [
                    {"value": "us-east-1", "label": "US East (N. Virginia)"},
                    {"value": "us-west-2", "label": "US West (Oregon)"},
                    {"value": "eu-west-1", "label": "EU (Ireland)"},
                    {"value": "ap-south-1", "label": "Asia Pacific (Mumbai)"}
                ]
            },
            {
                "key": "from_email",
                "label": "Default From Email",
                "type": "text",
                "required": True
            }
        ],
        "test_endpoint": None
    },
    {
        "name": "SMTP",
        "slug": "smtp",
        "category_slug": "email",
        "logo_icon": "server",
        "description": "Generic SMTP server connection",
        "auth_schema": [
            {
                "key": "host",
                "label": "SMTP Host",
                "type": "text",
                "required": True,
                "placeholder": "smtp.gmail.com"
            },
            {
                "key": "port",
                "label": "SMTP Port",
                "type": "number",
                "required": True,
                "default_value": 587
            },
            {
                "key": "username",
                "label": "Username",
                "type": "text",
                "required": True
            },
            {
                "key": "password",
                "label": "Password",
                "type": "password",
                "required": True
            },
            {
                "key": "use_tls",
                "label": "Use TLS",
                "type": "toggle",
                "required": False,
                "default_value": True
            },
            {
                "key": "from_email",
                "label": "Default From Email",
                "type": "text",
                "required": True
            }
        ],
        "test_endpoint": None
    },
    
    # AI Providers
    {
        "name": "OpenAI",
        "slug": "openai",
        "category_slug": "ai_llm",
        "logo_icon": "sparkles",
        "description": "GPT models for text generation",
        "docs_url": "https://platform.openai.com/docs/",
        "auth_schema": [
            {
                "key": "api_key",
                "label": "OpenAI API Key",
                "type": "password",
                "required": True,
                "placeholder": "sk-xxxxxxxxxx"
            },
            {
                "key": "organization_id",
                "label": "Organization ID (Optional)",
                "type": "text",
                "required": False,
                "placeholder": "org-xxxxxxxxxx"
            },
            {
                "key": "default_model",
                "label": "Default Model",
                "type": "select",
                "required": False,
                "options": [
                    {"value": "gpt-4o", "label": "GPT-4o"},
                    {"value": "gpt-4o-mini", "label": "GPT-4o Mini"},
                    {"value": "gpt-4-turbo", "label": "GPT-4 Turbo"},
                    {"value": "gpt-3.5-turbo", "label": "GPT-3.5 Turbo"}
                ],
                "default_value": "gpt-4o-mini"
            }
        ],
        "test_endpoint": {
            "url": "https://api.openai.com/v1/models",
            "method": "GET",
            "headers": {
                "Authorization": "Bearer {{api_key}}"
            },
            "success_status": [200]
        }
    },
    {
        "name": "Google Gemini",
        "slug": "gemini",
        "category_slug": "ai_llm",
        "logo_icon": "wand-2",
        "description": "Google's Gemini AI models",
        "docs_url": "https://ai.google.dev/docs/",
        "auth_schema": [
            {
                "key": "api_key",
                "label": "Gemini API Key",
                "type": "password",
                "required": True
            },
            {
                "key": "default_model",
                "label": "Default Model",
                "type": "select",
                "required": False,
                "options": [
                    {"value": "gemini-pro", "label": "Gemini Pro"},
                    {"value": "gemini-pro-vision", "label": "Gemini Pro Vision"}
                ],
                "default_value": "gemini-pro"
            }
        ],
        "test_endpoint": {
            "url": "https://generativelanguage.googleapis.com/v1/models?key={{api_key}}",
            "method": "GET",
            "headers": {},
            "success_status": [200]
        }
    },
    {
        "name": "Anthropic Claude",
        "slug": "claude",
        "category_slug": "ai_llm",
        "logo_icon": "bot",
        "description": "Anthropic's Claude AI assistant",
        "docs_url": "https://docs.anthropic.com/",
        "auth_schema": [
            {
                "key": "api_key",
                "label": "Anthropic API Key",
                "type": "password",
                "required": True,
                "placeholder": "sk-ant-xxxxxxxxxx"
            },
            {
                "key": "default_model",
                "label": "Default Model",
                "type": "select",
                "required": False,
                "options": [
                    {"value": "claude-3-opus-20240229", "label": "Claude 3 Opus"},
                    {"value": "claude-3-sonnet-20240229", "label": "Claude 3 Sonnet"},
                    {"value": "claude-3-haiku-20240307", "label": "Claude 3 Haiku"}
                ],
                "default_value": "claude-3-sonnet-20240229"
            }
        ],
        "test_endpoint": {
            "url": "https://api.anthropic.com/v1/messages",
            "method": "POST",
            "headers": {
                "x-api-key": "{{api_key}}",
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            "body": {
                "model": "claude-3-haiku-20240307",
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "Hi"}]
            },
            "success_status": [200]
        }
    },
    
    # Messaging Providers
    {
        "name": "Twilio",
        "slug": "twilio",
        "category_slug": "messaging",
        "logo_icon": "phone",
        "description": "SMS, WhatsApp, and voice communications",
        "docs_url": "https://www.twilio.com/docs/",
        "auth_schema": [
            {
                "key": "account_sid",
                "label": "Account SID",
                "type": "text",
                "required": True,
                "placeholder": "ACxxxxxxxxxx"
            },
            {
                "key": "auth_token",
                "label": "Auth Token",
                "type": "password",
                "required": True
            },
            {
                "key": "from_number",
                "label": "Default From Number",
                "type": "text",
                "required": True,
                "placeholder": "+1234567890",
                "help_text": "Include country code"
            }
        ],
        "test_endpoint": {
            "url": "https://api.twilio.com/2010-04-01/Accounts/{{account_sid}}.json",
            "method": "GET",
            "headers": {
                "Authorization": "Basic {{account_sid}}:{{auth_token}}"
            },
            "success_status": [200]
        }
    },
    
    # CRM Sync Providers
    {
        "name": "Salesforce",
        "slug": "salesforce",
        "category_slug": "crm_sync",
        "logo_icon": "cloud",
        "description": "Connect to Salesforce CRM via OAuth 2.0",
        "docs_url": "https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/",
        "auth_schema": [
            {
                "key": "environment",
                "label": "Salesforce Environment",
                "type": "select",
                "required": True,
                "options": [
                    {"label": "Production (login.salesforce.com)", "value": "production"},
                    {"label": "Sandbox (test.salesforce.com)", "value": "sandbox"}
                ],
                "default_value": "production",
                "help_text": "Select your Salesforce org type"
            },
            {
                "key": "consumer_key",
                "label": "Consumer Key (Client ID)",
                "type": "password",
                "required": True,
                "placeholder": "3MVG9...",
                "help_text": "Connected App Consumer Key from Salesforce Setup"
            },
            {
                "key": "consumer_secret",
                "label": "Consumer Secret (Client Secret)",
                "type": "password",
                "required": True,
                "help_text": "Connected App Consumer Secret from Salesforce Setup"
            }
        ],
        "oauth_config": {
            "type": "salesforce",
            "button_text": "Connect with Salesforce",
            "callback_path": "/api/connections/salesforce/callback"
        },
        "test_endpoint": {
            "url": "{{instance_url}}/services/data/v59.0/",
            "method": "GET",
            "headers": {
                "Authorization": "Bearer {{access_token}}"
            },
            "success_status": [200]
        }
    },

    # Universal API
    {
        "name": "Universal API",
        "slug": "universal_api",
        "category_slug": "universal_api",
        "logo_icon": "globe",
        "description": "Connect to any REST API",
        "auth_schema": [
            {
                "key": "base_url",
                "label": "Base URL",
                "type": "url",
                "required": True,
                "placeholder": "https://api.example.com"
            },
            {
                "key": "auth_type",
                "label": "Authentication Type",
                "type": "select",
                "required": True,
                "options": [
                    {"value": "none", "label": "No Authentication"},
                    {"value": "api_key", "label": "API Key"},
                    {"value": "bearer_token", "label": "Bearer Token"},
                    {"value": "basic_auth", "label": "Basic Auth"}
                ],
                "default_value": "none"
            },
            {
                "key": "api_key",
                "label": "API Key / Token",
                "type": "password",
                "required": False,
                "help_text": "Required for API Key and Bearer Token auth"
            },
            {
                "key": "api_key_header",
                "label": "API Key Header Name",
                "type": "text",
                "required": False,
                "placeholder": "X-API-Key",
                "help_text": "Header name for API key auth"
            },
            {
                "key": "username",
                "label": "Username",
                "type": "text",
                "required": False,
                "help_text": "For Basic Auth"
            },
            {
                "key": "password",
                "label": "Password",
                "type": "password",
                "required": False,
                "help_text": "For Basic Auth"
            },
            {
                "key": "default_headers",
                "label": "Default Headers (JSON)",
                "type": "textarea",
                "required": False,
                "placeholder": '{"Content-Type": "application/json"}'
            },
            {
                "key": "timeout",
                "label": "Request Timeout (seconds)",
                "type": "number",
                "required": False,
                "default_value": 30
            }
        ],
        "test_endpoint": None
    }
]


async def seed_integration_data(db: AsyncIOMotorDatabase):
    """Seed integration categories and providers"""
    
    # Seed Categories
    categories_collection = db.integration_categories
    category_map = {}
    
    for cat_data in SEED_CATEGORIES:
        existing = await categories_collection.find_one({"slug": cat_data["slug"]})
        if not existing:
            import uuid
            category = {
                "id": str(uuid.uuid4()),
                **cat_data,
                "is_active": True,
                "created_at": datetime.now(timezone.utc)
            }
            await categories_collection.insert_one(category)
            category_map[cat_data["slug"]] = category["id"]
            logger.info(f"Created category: {cat_data['name']}")
        else:
            category_map[cat_data["slug"]] = existing["id"]
            logger.info(f"Category exists: {cat_data['name']}")
    
    # Seed Providers
    providers_collection = db.integration_providers
    
    for prov_data in SEED_PROVIDERS:
        existing = await providers_collection.find_one({"slug": prov_data["slug"]})
        if not existing:
            import uuid
            category_slug = prov_data.pop("category_slug")
            category_id = category_map.get(category_slug)
            
            if not category_id:
                logger.warning(f"Category not found for provider: {prov_data['name']}")
                continue
            
            provider = {
                "id": str(uuid.uuid4()),
                **prov_data,
                "category_id": category_id,
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            await providers_collection.insert_one(provider)
            logger.info(f"Created provider: {prov_data['name']}")
        else:
            logger.info(f"Provider exists: {prov_data['name']}")
    
    logger.info("Integration seed data complete")
