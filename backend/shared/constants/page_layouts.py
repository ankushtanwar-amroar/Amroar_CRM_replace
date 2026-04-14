# Page Layout Configurations for Lightning-style pages
PAGE_LAYOUTS = {
    "lead": {
        "sections": [
            {
                "name": "Lead Information",
                "columns": 2,
                "fields": ["first_name", "last_name", "email", "phone", "company", "job_title"]
            },
            {
                "name": "Lead Details", 
                "columns": 2,
                "fields": ["lead_source", "status", "notes"]
            }
        ]
    },
    "contact": {
        "sections": [
            {
                "name": "Contact Information",
                "columns": 2,
                "fields": ["first_name", "last_name", "email", "phone"]
            },
            {
                "name": "Organization Details",
                "columns": 2, 
                "fields": ["company", "job_title", "department", "contact_type"]
            },
            {
                "name": "Additional Information",
                "columns": 1,
                "fields": ["notes"]
            }
        ]
    },
    "account": {
        "sections": [
            {
                "name": "Account Information",
                "columns": 2,
                "fields": ["account_name", "industry", "website", "phone"]
            },
            {
                "name": "Business Details",
                "columns": 2,
                "fields": ["annual_revenue", "employees", "account_type"]
            },
            {
                "name": "Description",
                "columns": 1,
                "fields": ["description"]
            }
        ]
    },
    "task": {
        "sections": [
            {
                "name": "Task Details",
                "columns": 2,
                "fields": ["subject", "status", "priority", "due_date"]
            },
            {
                "name": "Assignment & Relations",
                "columns": 2,
                "fields": ["assigned_to", "related_to", "related_type"]
            },
            {
                "name": "Description",
                "columns": 1,
                "fields": ["description"]
            }
        ]
    },
    "event": {
        "sections": [
            {
                "name": "Event Details",
                "columns": 2,
                "fields": ["subject", "event_type", "location"]
            },
            {
                "name": "Date & Time",
                "columns": 2,
                "fields": ["start_date", "end_date", "attendees"]
            },
            {
                "name": "Relations & Description",
                "columns": 2,
                "fields": ["related_to", "related_type", "description"]
            }
        ]
    },
    "property": {
        "sections": [
            {
                "name": "Property Address",
                "columns": 2,
                "fields": ["address", "city", "state", "zip_code"]
            },
            {
                "name": "Property Details",
                "columns": 2,
                "fields": ["property_type", "bedrooms", "bathrooms", "square_feet"]
            },
            {
                "name": "Pricing & Status",
                "columns": 2,
                "fields": ["price", "status", "description"]
            }
        ]
    },
    "client": {
        "sections": [
            {
                "name": "Client Information",
                "columns": 2,
                "fields": ["first_name", "last_name", "email", "phone"]
            },
            {
                "name": "Client Preferences",
                "columns": 2,
                "fields": ["client_type", "budget_min", "budget_max", "preferred_areas"]
            },
            {
                "name": "Notes",
                "columns": 1,
                "fields": ["notes"]
            }
        ]
    },
    "patient": {
        "sections": [
            {
                "name": "Patient Information",
                "columns": 2,
                "fields": ["first_name", "last_name", "date_of_birth", "gender"]
            },
            {
                "name": "Contact Details",
                "columns": 2,
                "fields": ["email", "phone", "address", "emergency_contact"]
            },
            {
                "name": "Medical Information",
                "columns": 1,
                "fields": ["insurance_provider", "medical_history"]
            }
        ]
    },
    "appointment": {
        "sections": [
            {
                "name": "Appointment Details",
                "columns": 2,
                "fields": ["patient_id", "appointment_date", "appointment_type", "provider"]
            },
            {
                "name": "Status & Notes",
                "columns": 2,
                "fields": ["status", "notes"]
            }
        ]
    }
}

# Default navigation order for core objects
DEFAULT_NAV_ORDER = [
    "lead", "contact", "account", "opportunity", "task", "event"
]

# Core objects that cannot be hidden (admin-locked)
LOCKED_OBJECTS = ["lead", "contact", "account", "opportunity", "task", "event"]
