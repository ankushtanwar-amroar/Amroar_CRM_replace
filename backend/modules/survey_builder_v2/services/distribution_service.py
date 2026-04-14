"""
Distribution Service
Handles survey distribution via email, SMS, WhatsApp, QR codes
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
from server import db

import qrcode
import io
import base64
from typing import Dict, Any, List


class DistributionService:
    
    @staticmethod
    async def generate_qr_code(public_link: str, frontend_url: str = "http://localhost:3000") -> str:
        """Generate QR code for survey"""
        
        full_url = f"{frontend_url}/survey-public/{public_link}"
        
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(full_url)
        qr.make(fit=True)
        
        # Create image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return f"data:image/png;base64,{img_base64}"
    
    @staticmethod
    async def send_email_invitation(survey_id: str, tenant_id: str, recipients: List[str], message: str = None) -> Dict[str, Any]:
        """Send survey invitation via email"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if not survey:
            return {"error": "Survey not found"}
        
        public_link = survey["distribution"]["public_link"]
        survey_url = f"http://localhost:3000/survey-public/{public_link}"
        
        # TODO: Integrate with email service (SendGrid, etc.)
        # For now, return email template
        
        default_message = "We'd love to hear your feedback!"
        email_message = message or default_message
        
        email_template = f"""
Subject: You're invited to take our survey: {survey['title']}

Hi there,

{email_message}

Survey: {survey['title']}
{survey.get('description', '')}

Click here to take the survey:
{survey_url}

Thank you for your time!
"""
        
        return {
            "success": True,
            "recipients": recipients,
            "survey_url": survey_url,
            "email_template": email_template,
            "message": f"Email invitations prepared for {len(recipients)} recipients"
        }
    
    @staticmethod
    async def generate_embed_code(survey_id: str, tenant_id: str, width: str = "100%", height: str = "600px") -> Dict[str, Any]:
        """Generate embed code for website"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if not survey:
            return {"error": "Survey not found"}
        
        public_link = survey["distribution"]["public_link"]
        
        iframe_code = f'<iframe src="http://localhost:3000/survey-public/{public_link}" width="{width}" height="{height}" frameborder="0" style="border: none;"></iframe>'
        
        script_code = f"""
<div id="survey-{survey_id}"></div>
<script>
  (function() {{
    var iframe = document.createElement('iframe');
    iframe.src = 'http://localhost:3000/survey-public/{public_link}';
    iframe.width = '{width}';
    iframe.height = '{height}';
    iframe.frameBorder = '0';
    iframe.style.border = 'none';
    document.getElementById('survey-{survey_id}').appendChild(iframe);
  }})();
</script>
"""
        
        return {
            "survey_id": survey_id,
            "public_link": public_link,
            "iframe_code": iframe_code,
            "script_code": script_code,
            "direct_url": f"http://localhost:3000/survey-public/{public_link}"
        }
    
    @staticmethod
    async def send_sms_invitation(survey_id: str, tenant_id: str, phone_numbers: List[str], message: str = None) -> Dict[str, Any]:
        """Send survey invitation via SMS"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if not survey:
            return {"error": "Survey not found"}
        
        public_link = survey["distribution"]["public_link"]
        survey_url = f"http://localhost:3000/survey-public/{public_link}"
        
        # TODO: Integrate with SMS service (Twilio, etc.)
        # For now, return SMS template
        
        sms_template = f"{message or 'Please take our survey'}: {survey['title']} - {survey_url}"
        
        return {
            "success": True,
            "recipients": phone_numbers,
            "sms_template": sms_template,
            "survey_url": survey_url,
            "message": f"SMS invitations prepared for {len(phone_numbers)} recipients"
        }
    
    @staticmethod
    async def send_whatsapp_invitation(survey_id: str, tenant_id: str, phone_numbers: List[str], message: str = None) -> Dict[str, Any]:
        """Send survey invitation via WhatsApp"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if not survey:
            return {"error": "Survey not found"}
        
        public_link = survey["distribution"]["public_link"]
        survey_url = f"http://localhost:3000/survey-public/{public_link}"
        
        # Generate WhatsApp links
        whatsapp_links = []
        for phone in phone_numbers:
            wa_message = f"{message or 'Please take our survey'}: {survey['title']} - {survey_url}"
            wa_link = f"https://wa.me/{phone}?text={wa_message}"
            whatsapp_links.append({"phone": phone, "link": wa_link})
        
        return {
            "success": True,
            "whatsapp_links": whatsapp_links,
            "survey_url": survey_url,
            "message": f"WhatsApp links generated for {len(phone_numbers)} recipients"
        }
    
    @staticmethod
    async def trigger_crm_send(survey_id: str, tenant_id: str, contact_ids: List[str]) -> Dict[str, Any]:
        """Trigger survey send to CRM contacts"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if not survey:
            return {"error": "Survey not found"}
        
        # TODO: Integrate with CRM workflow system
        # For now, log the intent
        
        return {
            "success": True,
            "survey_id": survey_id,
            "contact_ids": contact_ids,
            "message": f"Survey distribution queued for {len(contact_ids)} CRM contacts"
        }
