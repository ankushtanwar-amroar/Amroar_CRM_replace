"""
Lead Conversion Field Mappings
Defines how fields are mapped during lead conversion to Account, Contact, and Opportunity.
Extracted from server.py as part of Phase 3 refactoring.
"""

LEAD_CONVERSION_MAPPINGS = {
    "lead_to_account": {
        # Basic Info
        "company": "account_name",
        "phone": "phone",
        "email": "email",
        "website": "website",
        # Business Details
        "industry": "industry",
        "annual_revenue": "annual_revenue",
        # Address Fields
        "city": "billing_city",
        "state": "billing_state",
        "country": "billing_country",
        "postal_code": "billing_postal_code",
        # Other
        "lead_source": "source",
        "description": "description"
    },
    "lead_to_contact": {
        # Basic Info
        "first_name": "first_name",
        "last_name": "last_name",
        "email": "email",
        "phone": "phone",
        "mobile_phone": "mobile_phone",
        "job_title": "title",
        # Address Fields
        "city": "mailing_city",
        "state": "mailing_state",
        "country": "mailing_country",
        "postal_code": "mailing_postal_code",
        # Other
        "lead_source": "source",
        "description": "description"
    },
    "lead_to_opportunity": {
        # Basic Info
        "company": "name",
        "annual_revenue": "amount",
        # Status/Stage Mapping
        "status": "stage",  # Will need custom logic for this
        # Other
        "lead_source": "lead_source",
        "description": "description"
    }
}
