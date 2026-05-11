"""
DocFlow Content Configuration — System Defaults (Phase 81.80)

Centralised default copy for the three consent / disclaimer surfaces shown to
public signers. When a tenant has not yet customised a section, the API falls
back to these defaults so the signing UI never shows blank content.

Variable placeholders the renderer supports (case-sensitive):
  {{user_name}}      — recipient full name
  {{email}}          — recipient email
  {{phone}}          — full phone (if available)
  {{phone_last4}}    — last 4 digits of phone, e.g. 3210
  {{company_name}}   — tenant / company display name
  {{document_name}}  — current document or package name
  {{date}}           — today's date (locale-formatted on the client)
"""

CONSENT_DISCLOSURE_DEFAULT = {
    "title": "Agreement to do business",
    "subtitle": "Electronic Record & Signature Consent",
    "sections": [
        {
            "title": "ELECTRONIC RECORD AND SIGNATURE DISCLOSURE",
            "content": (
                "From time to time, {{company_name}} (we, us or Company) may be required by law to "
                "provide to you certain written notices or disclosures. Described below are the terms "
                "and conditions for providing to you such notices and disclosures electronically. Please "
                "read the information below carefully and thoroughly, and if you can access this "
                "information electronically to your satisfaction and agree to this Electronic Record "
                "and Signature Disclosure (ERSD), please confirm your agreement by selecting the "
                "check-box next to ‘I agree to use electronic records and signatures’ before clicking "
                "‘CONTINUE’."
            ),
        },
        {
            "title": "Getting Paper Copies",
            "content": (
                "At any time, you may request from us a paper copy of any record provided or made "
                "available electronically to you by us. You will have the ability to download and print "
                "documents we send to you during and immediately after the signing session."
            ),
        },
        {
            "title": "Withdrawing Your Consent",
            "content": (
                "If you decide to receive notices and disclosures from us electronically, you may at "
                "any time change your mind and tell us that thereafter you want to receive required "
                "notices and disclosures only in paper format."
            ),
        },
        {
            "title": "All notices and disclosures will be sent to you electronically",
            "content": (
                "Unless you tell us otherwise in accordance with the procedures described herein, we "
                "will provide electronically to you all required notices, disclosures, authorizations, "
                "acknowledgements, and other documents that are required to be provided or made "
                "available to you during the course of our relationship with you."
            ),
        },
        {
            "title": "How to Contact {{company_name}}",
            "content": (
                "You may contact us to let us know of your changes as to how we may contact you "
                "electronically, to request paper copies of certain information from us, and to "
                "withdraw your prior consent to receive notices and disclosures electronically."
            ),
        },
    ],
    "footer": "© {{date}} {{company_name}}. All rights reserved.",
}

REVIEW_CONTINUE_DEFAULT = {
    "title": "Review and Continue",
    "subtitle": "Electronic Record & Signature Consent",
    "body_html": (
        "<p>Dear {{user_name}},</p>"
        "<p>Thank you for choosing {{company_name}}.</p>"
        "<p>Please review and agree to the use of electronic records and signatures, then click "
        "<strong>\"Continue\"</strong> to begin the process of reviewing and signing your documents.</p>"
        "<p>Signing will not be complete until you have reviewed the agreement and confirmed your "
        "signature by clicking <strong>\"Finish\"</strong>.</p>"
        "<p>Should you have any questions or require assistance, please do not hesitate to contact us.</p>"
        "<p>Thank you,<br/><strong>The {{company_name}} Team</strong></p>"
    ),
    "footer_html": (
        "<p>You are receiving this because you opted in via our website or prior communications.</p>"
        "<p>This communication and any attachments may contain confidential or legally protected "
        "information intended solely for the use of the individual or entity to whom it is addressed.</p>"
        "<p>© {{date}} {{company_name}}.</p>"
    ),
    "disclosure_link_text": "Please read the Electronic Record and Signature Disclosure",
    "checkbox_text": "I agree to use electronic records and signatures.",
    "error_text": "Please agree to use electronic records and signatures.",
    "continue_label": "Continue",
}

SMS_DISCLAIMER_DEFAULT = {
    "title": "Security Check",
    "subtitle": "For your security, we've sent this document via SMS",
    "info_box_title": "Document Sent via Secure SMS",
    "info_box_message": (
        "This signing document has been securely delivered to <strong>{{phone}}</strong> in addition "
        "to email. This dual delivery method enhances your security and ensures you don't miss "
        "important documents."
    ),
    "consent_text": (
        "By clicking <strong>Continue</strong>, you acknowledge that this document has been securely "
        "delivered to you via SMS. You also consent to receive documents electronically and authorize "
        "electronic signatures for this transaction."
    ),
    "bullets": [
        "Your information is encrypted and secure",
        "You can access this document on any device",
        "Electronic signatures are legally binding",
    ],
    "footer": "This is a secure transaction. Your information is protected by industry-standard encryption.",
    "continue_label": "Continue to Document",
    "decline_label": "Decline",
}

DEFAULTS = {
    "consent_disclosure": CONSENT_DISCLOSURE_DEFAULT,
    "review_continue": REVIEW_CONTINUE_DEFAULT,
    "sms_disclaimer": SMS_DISCLAIMER_DEFAULT,
}

VALID_SECTION_TYPES = list(DEFAULTS.keys())


def get_default(section_type: str) -> dict:
    """Return a fresh copy of the default content for a section."""
    import copy
    return copy.deepcopy(DEFAULTS.get(section_type, {}))


def get_all_defaults() -> dict:
    """Return all defaults as a dict keyed by section type."""
    import copy
    return copy.deepcopy(DEFAULTS)
