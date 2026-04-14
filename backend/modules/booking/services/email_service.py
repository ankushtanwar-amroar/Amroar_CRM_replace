import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from typing import Optional, Dict, Any
import io

class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_password = os.getenv("SMTP_PASSWORD", "")
        self.from_email = os.getenv("FROM_EMAIL", self.smtp_user)
        self.from_name = os.getenv("APP_NAME", os.getenv("FROM_NAME", "CRM Platform"))

    def generate_ics(self, booking: Dict[str, Any], service_name: str, staff_name: str) -> str:
        start = datetime.fromisoformat(str(booking["start_time"])) if isinstance(booking["start_time"], str) else booking["start_time"]
        end = datetime.fromisoformat(str(booking["end_time"])) if isinstance(booking["end_time"], str) else booking["end_time"]
        
        ics_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Booking System//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
DTSTART:{start.strftime('%Y%m%dT%H%M%SZ')}
DTEND:{end.strftime('%Y%m%dT%H%M%SZ')}
DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}
UID:{booking['id']}@bookingsystem.com
SUMMARY:{service_name} with {staff_name}
DESCRIPTION:Booking ID: {booking['id']}\nCustomer: {booking['customer_name']}\nEmail: {booking['customer_email']}"""
        
        if booking.get("google_meet_link"):
            ics_content += f"\nGoogle Meet: {booking['google_meet_link']}"
        
        if booking.get("notes"):
            ics_content += f"\nNotes: {booking['notes']}"
        
        ics_content += f"""
LOCATION:Online
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:Reminder
END:VALARM
END:VEVENT
END:VCALENDAR"""
        
        return ics_content

    def get_confirmation_template(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any], base_url: str = "https://sign-flow-fix-1.preview.emergentagent.com") -> str:
        start = datetime.fromisoformat(str(booking["start_time"])) if isinstance(booking["start_time"], str) else booking["start_time"]
        
        template = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
        .booking-details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .detail-row {{ display: flex; padding: 12px 0; border-bottom: 1px solid #eee; }}
        .detail-label {{ font-weight: bold; width: 140px; color: #666; }}
        .detail-value {{ flex: 1; color: #333; }}
        .button {{ display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 10px 5px; }}
        .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
        .meet-link {{ background: #34a853; color: white; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0; }}
        .meet-link a {{ color: white; text-decoration: none; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Booking Confirmed!</h1>
            <p>Your appointment has been successfully scheduled</p>
        </div>
        <div class="content">
            <p>Hi {booking['customer_name']},</p>
            <p>Thank you for booking with us! Here are your appointment details:</p>
            
            <div class="booking-details">
                <div class="detail-row">
                    <div class="detail-label">Service:</div>
                    <div class="detail-value">{service['name']}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Staff:</div>
                    <div class="detail-value">{staff['name']}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Date & Time:</div>
                    <div class="detail-value">{start.strftime('%B %d, %Y at %I:%M %p')}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Duration:</div>
                    <div class="detail-value">{service['duration']} minutes</div>
                </div>"""
        
        if service.get("price"):
            template += f"""
                <div class="detail-row">
                    <div class="detail-label">Price:</div>
                    <div class="detail-value">${service['price']}</div>
                </div>"""
        
        if booking.get("notes"):
            template += f"""
                <div class="detail-row">
                    <div class="detail-label">Notes:</div>
                    <div class="detail-value">{booking['notes']}</div>
                </div>"""
        
        template += """</div>"""
        
        if booking.get("google_meet_link"):
            template += f"""
            <div class="meet-link">
                📹 <a href="{booking['google_meet_link']}" target="_blank">Join Google Meet</a>
            </div>"""
        
        # Create management URLs
        reschedule_url = f"{base_url}/booking/manage/{booking['id']}?action=reschedule"
        cancel_url = f"{base_url}/booking/manage/{booking['id']}?action=cancel"
        
        template += f"""
            <div style="text-align: center; margin-top: 30px;">
                <p>Need to make changes?</p>
                <a href="{reschedule_url}" class="button" style="text-decoration: none;">Reschedule</a>
                <a href="{cancel_url}" class="button" style="background: #dc3545; text-decoration: none;">Cancel</a>
            </div>
            
            <div class="footer">
                <p>This is an automated confirmation. Please do not reply to this email.</p>
                <p>Booking ID: {booking['id']}</p>
            </div>
        </div>
    </div>
</body>
</html>"""
        return template

    def get_reschedule_template(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any], old_time: datetime) -> str:
        new_time = datetime.fromisoformat(str(booking["start_time"])) if isinstance(booking["start_time"], str) else booking["start_time"]
        
        template = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
        .time-change {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .old-time {{ color: #dc3545; text-decoration: line-through; }}
        .new-time {{ color: #28a745; font-weight: bold; font-size: 18px; }}
        .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📅 Booking Rescheduled</h1>
            <p>Your appointment time has been updated</p>
        </div>
        <div class="content">
            <p>Hi {booking['customer_name']},</p>
            <p>Your appointment has been rescheduled. Here are the updated details:</p>
            
            <div class="time-change">
                <p><strong>Service:</strong> {service['name']}</p>
                <p><strong>Staff:</strong> {staff['name']}</p>
                <p style="margin-top: 20px;"><strong>Previous Time:</strong></p>
                <p class="old-time">{old_time.strftime('%B %d, %Y at %I:%M %p')}</p>
                <p style="margin-top: 20px;"><strong>New Time:</strong></p>
                <p class="new-time">{new_time.strftime('%B %d, %Y at %I:%M %p')}</p>
            </div>"""
        
        if booking.get("google_meet_link"):
            template += f"""
            <div style="background: #34a853; color: white; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                📹 <a href="{booking['google_meet_link']}" style="color: white; text-decoration: none; font-weight: bold;" target="_blank">Join Google Meet</a>
            </div>"""
        
        template += f"""
            <div class="footer">
                <p>Booking ID: {booking['id']}</p>
            </div>
        </div>
    </div>
</body>
</html>"""
        return template

    def get_cancellation_template(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any]) -> str:
        start = datetime.fromisoformat(str(booking["start_time"])) if isinstance(booking["start_time"], str) else booking["start_time"]
        
        template = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #868f96 0%, #596164 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
        .cancelled-details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>❌ Booking Cancelled</h1>
            <p>Your appointment has been cancelled</p>
        </div>
        <div class="content">
            <p>Hi {booking['customer_name']},</p>
            <p>Your appointment has been cancelled as requested. Here are the details of the cancelled booking:</p>
            
            <div class="cancelled-details">
                <p><strong>Service:</strong> {service['name']}</p>
                <p><strong>Staff:</strong> {staff['name']}</p>
                <p><strong>Date & Time:</strong> {start.strftime('%B %d, %Y at %I:%M %p')}</p>
                <p><strong>Duration:</strong> {service['duration']} minutes</p>
            </div>
            
            <p>We hope to see you again soon!</p>
            
            <div class="footer">
                <p>Booking ID: {booking['id']}</p>
            </div>
        </div>
    </div>
</body>
</html>"""
        return template

    async def send_email(self, to_email: str, subject: str, html_content: str, ics_content: Optional[str] = None) -> bool:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{self.from_name} <{self.from_email}>"
            msg["To"] = to_email
            
            html_part = MIMEText(html_content, "html")
            msg.attach(html_part)
            
            if ics_content:
                ics_part = MIMEBase("text", "calendar", method="REQUEST")
                ics_part.set_payload(ics_content.encode("utf-8"))
                encoders.encode_base64(ics_part)
                ics_part.add_header("Content-Disposition", "attachment", filename="invite.ics")
                msg.attach(ics_part)
            
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                if self.smtp_user and self.smtp_password:
                    server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            return True
        except Exception as e:
            print(f"Email send error: {str(e)}")
            return False

    async def send_confirmation(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any]) -> bool:
        html_content = self.get_confirmation_template(booking, service, staff)
        ics_content = self.generate_ics(booking, service["name"], staff["name"])
        
        return await self.send_email(
            booking["customer_email"],
            f"✅ Booking Confirmed - {service['name']}",
            html_content,
            ics_content
        )

    async def send_reschedule(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any], old_time: datetime) -> bool:
        html_content = self.get_reschedule_template(booking, service, staff, old_time)
        ics_content = self.generate_ics(booking, service["name"], staff["name"])
        
        return await self.send_email(
            booking["customer_email"],
            f"📅 Booking Rescheduled - {service['name']}",
            html_content,
            ics_content
        )

    async def send_cancellation(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any]) -> bool:
        html_content = self.get_cancellation_template(booking, service, staff)
        
        return await self.send_email(
            booking["customer_email"],
            f"❌ Booking Cancelled - {service['name']}",
            html_content
        )

    async def send_staff_notification(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any]) -> bool:
        """Send booking notification to staff member"""
        start = datetime.fromisoformat(str(booking["start_time"])) if isinstance(booking["start_time"], str) else booking["start_time"]
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
        .booking-details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .detail-row {{ display: flex; padding: 12px 0; border-bottom: 1px solid #eee; }}
        .detail-label {{ font-weight: bold; width: 140px; color: #666; }}
        .detail-value {{ flex: 1; color: #333; }}
        .meet-link {{ background: #34a853; color: white; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0; }}
        .meet-link a {{ color: white; text-decoration: none; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📅 New Booking Assigned</h1>
            <p>You have a new appointment scheduled</p>
        </div>
        <div class="content">
            <p>Hi {staff['name']},</p>
            <p>A new booking has been created for you:</p>
            
            <div class="booking-details">
                <div class="detail-row">
                    <div class="detail-label">Service:</div>
                    <div class="detail-value">{service['name']}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Customer:</div>
                    <div class="detail-value">{booking['customer_name']}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Email:</div>
                    <div class="detail-value">{booking['customer_email']}</div>
                </div>"""
        
        if booking.get("customer_phone"):
            html_content += f"""
                <div class="detail-row">
                    <div class="detail-label">Phone:</div>
                    <div class="detail-value">{booking['customer_phone']}</div>
                </div>"""
        
        html_content += f"""
                <div class="detail-row">
                    <div class="detail-label">Date & Time:</div>
                    <div class="detail-value">{start.strftime('%B %d, %Y at %I:%M %p')}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Duration:</div>
                    <div class="detail-value">{service['duration']} minutes</div>
                </div>"""
        
        if booking.get("notes"):
            html_content += f"""
                <div class="detail-row">
                    <div class="detail-label">Notes:</div>
                    <div class="detail-value">{booking['notes']}</div>
                </div>"""
        
        html_content += """</div>"""
        
        if booking.get("google_meet_link"):
            html_content += f"""
            <div class="meet-link">
                📹 <a href="{booking['google_meet_link']}" target="_blank">Join Google Meet</a>
            </div>"""
        
        html_content += f"""
            <p style="margin-top: 30px; color: #666; font-size: 14px;">
                This invitation has been added to your Google Calendar.
            </p>
        </div>
    </div>
</body>
</html>"""
        
        ics_content = self.generate_ics(booking, service["name"], staff["name"])
        
        return await self.send_email(
            staff["email"],
            f"📅 New Booking: {service['name']} - {start.strftime('%b %d at %I:%M %p')}",
            html_content,
            ics_content
        )

    async def send_tenant_notification(self, booking: Dict[str, Any], service: Dict[str, Any], staff: Dict[str, Any], tenant_email: str) -> bool:
        """Send booking notification to tenant/admin"""
        start = datetime.fromisoformat(str(booking["start_time"])) if isinstance(booking["start_time"], str) else booking["start_time"]
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
        .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
        .booking-details {{ background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .detail-row {{ display: flex; padding: 12px 0; border-bottom: 1px solid #eee; }}
        .detail-label {{ font-weight: bold; width: 140px; color: #666; }}
        .detail-value {{ flex: 1; color: #333; }}
        .meet-link {{ background: #34a853; color: white; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0; }}
        .meet-link a {{ color: white; text-decoration: none; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 New Booking Created</h1>
            <p>A new appointment has been scheduled</p>
        </div>
        <div class="content">
            <p>Hello Admin,</p>
            <p>A new booking has been created in your system:</p>
            
            <div class="booking-details">
                <div class="detail-row">
                    <div class="detail-label">Service:</div>
                    <div class="detail-value">{service['name']}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Staff:</div>
                    <div class="detail-value">{staff['name']}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Customer:</div>
                    <div class="detail-value">{booking['customer_name']}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Email:</div>
                    <div class="detail-value">{booking['customer_email']}</div>
                </div>"""
        
        if booking.get("customer_phone"):
            html_content += f"""
                <div class="detail-row">
                    <div class="detail-label">Phone:</div>
                    <div class="detail-value">{booking['customer_phone']}</div>
                </div>"""
        
        html_content += f"""
                <div class="detail-row">
                    <div class="detail-label">Date & Time:</div>
                    <div class="detail-value">{start.strftime('%B %d, %Y at %I:%M %p')}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Duration:</div>
                    <div class="detail-value">{service['duration']} minutes</div>
                </div>"""
        
        if service.get("price"):
            html_content += f"""
                <div class="detail-row">
                    <div class="detail-label">Price:</div>
                    <div class="detail-value">${service['price']}</div>
                </div>"""
        
        if booking.get("notes"):
            html_content += f"""
                <div class="detail-row">
                    <div class="detail-label">Notes:</div>
                    <div class="detail-value">{booking['notes']}</div>
                </div>"""
        
        html_content += """</div>"""
        
        if booking.get("google_meet_link"):
            html_content += f"""
            <div class="meet-link">
                📹 <a href="{booking['google_meet_link']}" target="_blank">Join Google Meet (Monitor)</a>
            </div>"""
        
        html_content += f"""
            <p style="margin-top: 30px; color: #666; font-size: 14px;">
                Booking ID: {booking['id']}<br>
                This invitation has been added to your Google Calendar.
            </p>
        </div>
    </div>
</body>
</html>"""
        
        ics_content = self.generate_ics(booking, service["name"], staff["name"])
        
        return await self.send_email(
            tenant_email,
            f"📋 New Booking: {booking['customer_name']} - {service['name']}",
            html_content,
            ics_content
        )
