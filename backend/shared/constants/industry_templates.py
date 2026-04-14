"""
Industry Templates - Predefined CRM configurations for different industries
Extracted from server.py as part of Phase 3 refactoring.
"""

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
                    "account_id": {
                        "type": "lookup", 
                        "required": False, 
                        "label": "Account",
                        "lookup_object": "account",
                        "lookup_display_field": "account_name",
                        "always_visible": True
                    },
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
                    "account_id": {
                        "type": "lookup", 
                        "required": False, 
                        "label": "Account",
                        "lookup_object": "account",
                        "lookup_display_field": "account_name",
                        "always_visible": True
                    },
                    "contact_id": {
                        "type": "lookup", 
                        "required": False, 
                        "label": "Contact",
                        "lookup_object": "contact",
                        "lookup_display_field": "first_name"
                    },
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
