"""
Salesforce Service - Proxy for Salesforce REST API (publicfields endpoint)
"""
import httpx
import os
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Salesforce config from environment
SF_INSTANCE_URL = os.environ.get("SALESFORCE_INSTANCE_URL", "")
SF_ACCESS_TOKEN = os.environ.get("SALESFORCE_ACCESS_TOKEN", "")

# Support a wider range of standard and custom objects
# This can be expanded as needed or made completely dynamic if the API supports it.
SUPPORTED_OBJECTS = {"Lead", "Account", "Contact", "Opportunity", "Case", "Campaign", "Task", "Event"}


class SalesforceService:
    """Service to interact with Salesforce REST API"""

    def __init__(self, db=None):
        self.db = db
        self.instance_url = SF_INSTANCE_URL.rstrip("/")
        self.access_token = SF_ACCESS_TOKEN

    def is_configured(self) -> bool:
        return bool(self.instance_url and self.access_token)

    async def test_connection(self) -> Dict[str, Any]:
        """Test Salesforce connection by calling a lightweight endpoint."""
        if not self.instance_url:
            return {"connected": False, "error": "Salesforce URL not configured. Set SALESFORCE_INSTANCE_URL."}
        
        try:
            # Try standard limits endpoint first (requires auth)
            if self.access_token:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(
                        f"{self.instance_url.rstrip('/')}/services/data/v58.0/limits",
                        headers=self._headers()
                    )
                    if response.status_code < 300:
                        return {"connected": True, "type": "authenticated"}
            
            # Fallback/Alternative: Try a lightweight check on the public fields endpoint
            # This works for public sites without needing a token
            async with httpx.AsyncClient(timeout=10.0) as client:
                public_check_url = f"{self.instance_url.rstrip('/')}/Docsign/services/apexrest/publicfields"
                if "Docsign" not in public_check_url and "salesforce-sites.com" in public_check_url:
                    public_check_url = f"{self.instance_url.rstrip('/')}/Docsign/services/apexrest/publicfields"
                
                # Just check if we get a 200 or 400 (sobject missing) instead of 404/500
                response = await client.get(public_check_url, params={"sobject": "Account"})
                if response.status_code < 500: # 400 is fine, means endpoint exists
                    return {"connected": True, "type": "public_site" if response.status_code < 300 else "public_site_unauthorized"}
                
                return {"connected": False, "error": f"Salesforce unreachable (HTTP {response.status_code})"}
        except Exception as e:
            logger.error(f"Salesforce connection test failed: {e}")
            return {"connected": False, "error": str(e)}

    async def get_object_fields(self, sobject: str) -> Dict[str, Any]:
        """
        Fetch fields for a Salesforce object via:
        GET /services/apexrest/publicfields?sobject={ObjectName}

        Returns: { fields: [...], sobject: str }
        """
        # Case-insensitive object name check (optional, but good for robustness)
        obj_match = next((o for o in SUPPORTED_OBJECTS if o.lower() == sobject.lower()), None)
        if not obj_match and not sobject.endswith("__c"):
            # If not in our list and doesn't look like a custom object, warn but allow
            logger.info(f"Object {sobject} not in common SUPPORTED_OBJECTS list, attempting anyway.")

        target_object = obj_match or sobject

        # if not self.is_configured() and not self.instance_url:
        #     # Fallback ONLY if no URL is provided at all
        #     return {"fields": self._demo_fields(target_object), "sobject": target_object, "demo": True, 
        #             "warning": "Salesforce URL not configured. Using demo fields."}

        try:
            # Construct URL - append /services/apexrest/publicfields if not present
            # base_url = self.instance_url.rstrip("/")
            base_url = "https://batoncare--uat.sandbox.my.salesforce-sites.com"
            api_endpoint = "/Docsign/services/apexrest/publicfields"
            if "/Docsign" in base_url and not base_url.endswith("/Docsign"):
                # Handle cases where Docsign prefix might be part of the instance URL
                pass
            
            full_url = f"{base_url}{api_endpoint}"
            
            # Use public fields endpoint if configured, or default to standard REST
            # The user specifically wants to use the Docsign endpoint
            if "Docsign" not in full_url and "salesforce-sites.com" in full_url:
                # Ensure Docsign prefix for public sites if missing
                if not full_url.endswith("/Docsign/services/apexrest/publicfields"):
                    full_url = f"{base_url}/Docsign/services/apexrest/publicfields"

            logger.info(f"Fetching Salesforce fields from: {full_url} for {target_object}")

            async with httpx.AsyncClient(timeout=20.0) as client:
                # Prepare headers - only send Authorization if token exists
                headers = {"Content-Type": "application/json"}
                if self.access_token:
                    headers["Authorization"] = f"Bearer {self.access_token}"

                response = await client.get(
                    full_url,
                    params={"sobject": target_object},
                    headers=headers
                )
                
                if response.status_code < 300:
                    data = response.json()
                    # API returns array of field names like ["Name", "Email", "Company", ...]
                    if isinstance(data, list):
                        fields = [{"api_name": f, "label": f.replace("__c", "").replace("__pc", "").replace("_", " ").title(), "type": "text"} for f in data]
                    elif isinstance(data, dict) and "fields" in data:
                        fields = data["fields"]
                    else:
                        fields = []
                    
                    if not fields:
                        return {"fields": [], "sobject": target_object, "error": f"API returned no fields for {target_object}"}
                        
                    return {"fields": fields, "sobject": target_object}
                else:
                    error_msg = f"Salesforce API error: {response.status_code} {response.text[:200]}"
                    logger.error(error_msg)
                    return {
                        "fields": [], 
                        "sobject": target_object, 
                        "error": error_msg,
                        "fallback_available": True
                    }
        except Exception as e:
            error_msg = f"Error fetching Salesforce fields: {str(e)}"
            logger.error(error_msg)
            return {
                "fields": [], 
                "sobject": target_object, 
                "error": error_msg,
                "fallback_available": True
            }

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    def _demo_fields(self, sobject: str) -> List[Dict[str, str]]:
        """Return common fields per object for demo/fallback purposes."""
        common = {
            "Lead": [
                {"api_name": "FirstName", "label": "First Name", "type": "text"},
                {"api_name": "LastName", "label": "Last Name", "type": "text"},
                {"api_name": "Email", "label": "Email", "type": "email"},
                {"api_name": "Phone", "label": "Phone", "type": "phone"},
                {"api_name": "Company", "label": "Company", "type": "text"},
                {"api_name": "Title", "label": "Title", "type": "text"},
                {"api_name": "Status", "label": "Status", "type": "picklist"},
                {"api_name": "LeadSource", "label": "Lead Source", "type": "picklist"},
                {"api_name": "Industry", "label": "Industry", "type": "picklist"},
                {"api_name": "Street", "label": "Street", "type": "text"},
                {"api_name": "City", "label": "City", "type": "text"},
                {"api_name": "State", "label": "State", "type": "text"},
                {"api_name": "Country", "label": "Country", "type": "text"},
            ],
            "Account": [
                {"api_name": "Name", "label": "Account Name", "type": "text"},
                {"api_name": "Phone", "label": "Phone", "type": "phone"},
                {"api_name": "Website", "label": "Website", "type": "url"},
                {"api_name": "Industry", "label": "Industry", "type": "picklist"},
                {"api_name": "Type", "label": "Type", "type": "picklist"},
                {"api_name": "BillingStreet", "label": "Billing Street", "type": "text"},
                {"api_name": "BillingCity", "label": "Billing City", "type": "text"},
                {"api_name": "BillingState", "label": "Billing State", "type": "text"},
                {"api_name": "BillingCountry", "label": "Billing Country", "type": "text"},
                {"api_name": "AnnualRevenue", "label": "Annual Revenue", "type": "currency"},
                {"api_name": "NumberOfEmployees", "label": "Number of Employees", "type": "number"},
            ],
            "Contact": [
                {"api_name": "FirstName", "label": "First Name", "type": "text"},
                {"api_name": "LastName", "label": "Last Name", "type": "text"},
                {"api_name": "Email", "label": "Email", "type": "email"},
                {"api_name": "Phone", "label": "Phone", "type": "phone"},
                {"api_name": "Title", "label": "Title", "type": "text"},
                {"api_name": "Department", "label": "Department", "type": "text"},
                {"api_name": "MailingStreet", "label": "Mailing Street", "type": "text"},
                {"api_name": "MailingCity", "label": "Mailing City", "type": "text"},
                {"api_name": "Account.Name", "label": "Account Name", "type": "reference"},
            ],
            "Opportunity": [
                {"api_name": "Name", "label": "Opportunity Name", "type": "text"},
                {"api_name": "Amount", "label": "Amount", "type": "currency"},
                {"api_name": "CloseDate", "label": "Close Date", "type": "date"},
                {"api_name": "StageName", "label": "Stage", "type": "picklist"},
                {"api_name": "Probability", "label": "Probability", "type": "number"},
                {"api_name": "Type", "label": "Type", "type": "picklist"},
                {"api_name": "LeadSource", "label": "Lead Source", "type": "picklist"},
                {"api_name": "Account.Name", "label": "Account Name", "type": "reference"},
                {"api_name": "Description", "label": "Description", "type": "textarea"},
            ],
        }
        return common.get(sobject, [])
