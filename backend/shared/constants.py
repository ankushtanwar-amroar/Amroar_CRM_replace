"""
Shared Constants Module
Contains industry templates and other configuration constants.
"""

# Role Constants
ROLE_SYSTEM_ADMIN = "system_administrator"
ROLE_STANDARD_USER = "standard_user"

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
                "name": "Client Details",
                "columns": 2,
                "fields": ["client_type", "budget_min", "budget_max"]
            },
            {
                "name": "Additional Info",
                "columns": 1,
                "fields": ["preferred_areas", "notes"]
            }
        ]
    }
}

# Industry Templates
INDUSTRY_TEMPLATES = {
    "sales": {
        "name": "Sales CRM",
        "description": "Complete sales management system",
        "objects": {
            "task": {
                "name": "Task",
                "plural": "Tasks", 
                "fields": {
                    "subject": {"type": "text", "required": True, "label": "Subject"},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "status": {"type": "select", "required": True, "label": "Status", 
                              "options": ["Not Started", "In Progress", "Completed", "Waiting", "Cancelled"]},
                    "priority": {"type": "select", "required": True, "label": "Priority",
                                "options": ["Low", "Normal", "High", "Urgent"]},
                    "due_date": {"type": "date", "required": False, "label": "Due Date"},
                    "assigned_to": {"type": "text", "required": False, "label": "Assigned To"},
                    "related_to": {"type": "text", "required": False, "label": "Related To"},
                    "related_type": {"type": "select", "required": False, "label": "Related Type",
                                    "options": ["Lead", "Contact", "Account", "Opportunity"]}
                }
            },
            "event": {
                "name": "Event",
                "plural": "Events",
                "fields": {
                    "subject": {"type": "text", "required": True, "label": "Subject"},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "start_date": {"type": "datetime", "required": True, "label": "Start Date & Time"},
                    "end_date": {"type": "datetime", "required": True, "label": "End Date & Time"},
                    "location": {"type": "text", "required": False, "label": "Location"},
                    "event_type": {"type": "select", "required": True, "label": "Event Type",
                                  "options": ["Meeting", "Call", "Demo", "Presentation", "Training"]},
                    "attendees": {"type": "text", "required": False, "label": "Attendees"},
                    "related_to": {"type": "text", "required": False, "label": "Related To"},
                    "related_type": {"type": "select", "required": False, "label": "Related Type",
                                    "options": ["Lead", "Contact", "Account", "Opportunity"]}
                }
            },
            "lead": {
                "name": "Lead",
                "plural": "Leads",
                "name_field": "first_name",
                "fields": {
                    "first_name": {"type": "text", "required": True, "label": "First Name"},
                    "last_name": {"type": "text", "required": True, "label": "Last Name"},
                    "email": {"type": "email", "required": True, "label": "Email"},
                    "phone": {"type": "phone", "required": False, "label": "Phone"},
                    "company": {"type": "text", "required": False, "label": "Company"},
                    "job_title": {"type": "text", "required": False, "label": "Job Title"},
                    "industry": {"type": "select", "required": False, "label": "Industry",
                                "options": ["Technology", "Healthcare", "Finance", "Manufacturing", "Retail", "Other"]},
                    "annual_revenue": {"type": "number", "required": False, "label": "Annual Revenue"},
                    "website": {"type": "url", "required": False, "label": "Website"},
                    "lead_source": {"type": "select", "required": False, "label": "Lead Source", 
                                   "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement", "Partner", "Trade Show", "Email Campaign", "Direct Mail", "Other"]},
                    "status": {"type": "select", "required": True, "label": "Status", 
                              "options": ["New", "Contacted", "Qualified", "Converted", "Lost"]},
                    "city": {"type": "text", "required": False, "label": "City"},
                    "state": {"type": "text", "required": False, "label": "State"},
                    "country": {"type": "text", "required": False, "label": "Country"},
                    "postal_code": {"type": "text", "required": False, "label": "Postal Code"},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "notes": {"type": "textarea", "required": False, "label": "Notes"}
                }
            },
            "contact": {
                "name": "Contact", 
                "plural": "Contacts",
                "name_field": "first_name",
                "fields": {
                    "first_name": {"type": "text", "required": True, "label": "First Name"},
                    "last_name": {"type": "text", "required": True, "label": "Last Name"},
                    "email": {"type": "email", "required": True, "label": "Email"},
                    "phone": {"type": "phone", "required": False, "label": "Phone"},
                    "account_id": {"type": "text", "required": False, "label": "Account ID"},
                    "title": {"type": "text", "required": False, "label": "Title"},
                    "department": {"type": "text", "required": False, "label": "Department"},
                    "contact_type": {"type": "select", "required": False, "label": "Contact Type",
                                    "options": ["Customer", "Prospect", "Partner", "Vendor"]},
                    "mailing_city": {"type": "text", "required": False, "label": "Mailing City"},
                    "mailing_state": {"type": "text", "required": False, "label": "Mailing State"},
                    "mailing_country": {"type": "text", "required": False, "label": "Mailing Country"},
                    "mailing_postal_code": {"type": "text", "required": False, "label": "Mailing Postal Code"},
                    "source": {"type": "select", "required": False, "label": "Source",
                              "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement"]},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "notes": {"type": "textarea", "required": False, "label": "Notes"}
                }
            },
            "account": {
                "name": "Account",
                "plural": "Accounts",
                "name_field": "account_name", 
                "fields": {
                    "account_name": {"type": "text", "required": True, "label": "Account Name"},
                    "industry": {"type": "select", "required": False, "label": "Industry",
                                "options": ["Technology", "Healthcare", "Finance", "Manufacturing", "Retail", "Other"]},
                    "website": {"type": "url", "required": False, "label": "Website"},
                    "phone": {"type": "phone", "required": False, "label": "Phone"},
                    "email": {"type": "email", "required": False, "label": "Email"},
                    "annual_revenue": {"type": "number", "required": False, "label": "Annual Revenue"},
                    "employees": {"type": "number", "required": False, "label": "Number of Employees"},
                    "account_type": {"type": "select", "required": False, "label": "Account Type",
                                    "options": ["Customer", "Prospect", "Partner", "Competitor"]},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "billing_city": {"type": "text", "required": False, "label": "Billing City"},
                    "billing_state": {"type": "text", "required": False, "label": "Billing State"},
                    "billing_country": {"type": "text", "required": False, "label": "Billing Country"},
                    "billing_postal_code": {"type": "text", "required": False, "label": "Billing Postal Code"},
                    "source": {"type": "select", "required": False, "label": "Source",
                              "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement"]}
                }
            },
            "opportunity": {
                "name": "Opportunity",
                "plural": "Opportunities",
                "name_field": "name",
                "fields": {
                    "name": {"type": "text", "required": True, "label": "Opportunity Name"},
                    "account_id": {"type": "text", "required": False, "label": "Account ID"},
                    "contact_id": {"type": "text", "required": False, "label": "Contact ID"},
                    "amount": {"type": "number", "required": False, "label": "Amount"},
                    "stage": {"type": "select", "required": True, "label": "Stage",
                             "options": ["Prospecting", "Qualification", "Needs Analysis", "Value Proposition", 
                                        "Decision Makers", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]},
                    "probability": {"type": "number", "required": False, "label": "Probability (%)"},
                    "close_date": {"type": "date", "required": False, "label": "Expected Close Date"},
                    "lead_source": {"type": "select", "required": False, "label": "Lead Source",
                                   "options": ["Website", "Referral", "Cold Call", "Social Media", "Advertisement"]},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "next_step": {"type": "text", "required": False, "label": "Next Step"}
                }
            }
        }
    },
    "realestate": {
        "name": "Real Estate CRM", 
        "description": "Real estate management system",
        "objects": {
            "task": {
                "name": "Task",
                "plural": "Tasks",
                "fields": {
                    "subject": {"type": "text", "required": True, "label": "Subject"},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "status": {"type": "select", "required": True, "label": "Status", 
                              "options": ["Not Started", "In Progress", "Completed", "Waiting", "Cancelled"]},
                    "priority": {"type": "select", "required": True, "label": "Priority",
                                "options": ["Low", "Normal", "High", "Urgent"]},
                    "due_date": {"type": "date", "required": False, "label": "Due Date"},
                    "assigned_to": {"type": "text", "required": False, "label": "Assigned To"},
                    "related_to": {"type": "text", "required": False, "label": "Related To"},
                    "related_type": {"type": "select", "required": False, "label": "Related Type",
                                    "options": ["Property", "Client", "Showing"]}
                }
            },
            "event": {
                "name": "Event",
                "plural": "Events",
                "fields": {
                    "subject": {"type": "text", "required": True, "label": "Subject"},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "start_date": {"type": "datetime", "required": True, "label": "Start Date & Time"},
                    "end_date": {"type": "datetime", "required": True, "label": "End Date & Time"},
                    "location": {"type": "text", "required": False, "label": "Location"},
                    "event_type": {"type": "select", "required": True, "label": "Event Type",
                                  "options": ["Showing", "Open House", "Inspection", "Closing", "Meeting"]},
                    "attendees": {"type": "text", "required": False, "label": "Attendees"},
                    "related_to": {"type": "text", "required": False, "label": "Related To"},
                    "related_type": {"type": "select", "required": False, "label": "Related Type",
                                    "options": ["Property", "Client", "Showing"]}
                }
            },
            "property": {
                "name": "Property",
                "plural": "Properties",
                "name_field": "address",
                "fields": {
                    "address": {"type": "text", "required": True, "label": "Address"},
                    "city": {"type": "text", "required": True, "label": "City"},
                    "state": {"type": "text", "required": True, "label": "State"},
                    "zip_code": {"type": "text", "required": True, "label": "ZIP Code"},
                    "property_type": {"type": "select", "required": True, "label": "Property Type",
                                     "options": ["Single Family", "Condo", "Townhouse", "Multi-Family", "Commercial"]},
                    "bedrooms": {"type": "number", "required": False, "label": "Bedrooms"},
                    "bathrooms": {"type": "number", "required": False, "label": "Bathrooms"},
                    "square_feet": {"type": "number", "required": False, "label": "Square Feet"},
                    "price": {"type": "number", "required": True, "label": "Price"},
                    "status": {"type": "select", "required": True, "label": "Status",
                              "options": ["Available", "Under Contract", "Sold", "Off Market"]},
                    "description": {"type": "textarea", "required": False, "label": "Description"}
                }
            },
            "client": {
                "name": "Client",
                "plural": "Clients",
                "name_field": "first_name", 
                "fields": {
                    "first_name": {"type": "text", "required": True, "label": "First Name"},
                    "last_name": {"type": "text", "required": True, "label": "Last Name"},
                    "email": {"type": "email", "required": True, "label": "Email"},
                    "phone": {"type": "phone", "required": False, "label": "Phone"},
                    "client_type": {"type": "select", "required": True, "label": "Client Type",
                                   "options": ["Buyer", "Seller", "Both"]},
                    "budget_min": {"type": "number", "required": False, "label": "Min Budget"},
                    "budget_max": {"type": "number", "required": False, "label": "Max Budget"},
                    "preferred_areas": {"type": "text", "required": False, "label": "Preferred Areas"},
                    "notes": {"type": "textarea", "required": False, "label": "Notes"}
                }
            }
        }
    },
    "healthcare": {
        "name": "Healthcare CRM",
        "description": "Healthcare patient management system", 
        "objects": {
            "task": {
                "name": "Task",
                "plural": "Tasks",
                "fields": {
                    "subject": {"type": "text", "required": True, "label": "Subject"},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "status": {"type": "select", "required": True, "label": "Status", 
                              "options": ["Not Started", "In Progress", "Completed", "Waiting", "Cancelled"]},
                    "priority": {"type": "select", "required": True, "label": "Priority",
                                "options": ["Low", "Normal", "High", "Urgent"]},
                    "due_date": {"type": "date", "required": False, "label": "Due Date"},
                    "assigned_to": {"type": "text", "required": False, "label": "Assigned To"},
                    "related_to": {"type": "text", "required": False, "label": "Related To"},
                    "related_type": {"type": "select", "required": False, "label": "Related Type",
                                    "options": ["Patient", "Appointment", "Case"]}
                }
            },
            "event": {
                "name": "Event", 
                "plural": "Events",
                "fields": {
                    "subject": {"type": "text", "required": True, "label": "Subject"},
                    "description": {"type": "textarea", "required": False, "label": "Description"},
                    "start_date": {"type": "datetime", "required": True, "label": "Start Date & Time"},
                    "end_date": {"type": "datetime", "required": True, "label": "End Date & Time"},
                    "location": {"type": "text", "required": False, "label": "Location"},
                    "event_type": {"type": "select", "required": True, "label": "Event Type",
                                  "options": ["Appointment", "Consultation", "Surgery", "Follow-up", "Meeting"]},
                    "attendees": {"type": "text", "required": False, "label": "Attendees"},
                    "related_to": {"type": "text", "required": False, "label": "Related To"},
                    "related_type": {"type": "select", "required": False, "label": "Related Type",
                                    "options": ["Patient", "Appointment", "Case"]}
                }
            },
            "patient": {
                "name": "Patient",
                "plural": "Patients",
                "name_field": "first_name",
                "fields": {
                    "first_name": {"type": "text", "required": True, "label": "First Name"},
                    "last_name": {"type": "text", "required": True, "label": "Last Name"},
                    "date_of_birth": {"type": "date", "required": True, "label": "Date of Birth"},
                    "gender": {"type": "select", "required": False, "label": "Gender",
                              "options": ["Male", "Female", "Other", "Prefer not to say"]},
                    "email": {"type": "email", "required": False, "label": "Email"},
                    "phone": {"type": "phone", "required": True, "label": "Phone"},
                    "address": {"type": "text", "required": False, "label": "Address"},
                    "emergency_contact": {"type": "text", "required": False, "label": "Emergency Contact"},
                    "insurance_provider": {"type": "text", "required": False, "label": "Insurance Provider"},
                    "medical_history": {"type": "textarea", "required": False, "label": "Medical History"}
                }
            },
            "appointment": {
                "name": "Appointment",
                "plural": "Appointments",
                "name_field": "patient_id",
                "fields": {
                    "patient_id": {"type": "text", "required": True, "label": "Patient ID"},
                    "appointment_date": {"type": "datetime", "required": True, "label": "Appointment Date"},
                    "appointment_type": {"type": "select", "required": True, "label": "Appointment Type",
                                        "options": ["Consultation", "Follow-up", "Procedure", "Emergency"]},
                    "provider": {"type": "text", "required": True, "label": "Healthcare Provider"},
                    "status": {"type": "select", "required": True, "label": "Status",
                              "options": ["Scheduled", "Confirmed", "In Progress", "Completed", "Cancelled"]},
                    "notes": {"type": "textarea", "required": False, "label": "Notes"}
                }
            }
        }
    }
}

# Lead Conversion Field Mappings
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
