from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from modules.booking.models.booking_models import (
    Service, ServiceCreate, ServiceUpdate,
    Staff, StaffCreate, StaffUpdate,
    Booking, BookingCreate, BookingUpdate, BookingStatus
)
from modules.booking.services.booking_service import BookingService
from modules.booking.services.google_calendar_service import GoogleCalendarService
from modules.booking.services.email_service import EmailService
from shared.auth import get_current_user_dict
from shared.database import db as shared_db

booking_db = shared_db

async def get_database():
    return booking_db

router = APIRouter(prefix="/api/booking", tags=["booking"])

# Services Routes
@router.post("/services", response_model=Service)
async def create_service(
    service_data: ServiceCreate,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    service = await booking_service.create_service(
        current_user["tenant_id"],
        service_data.dict()
    )
    return service

@router.get("/services", response_model=List[Service])
async def get_services(
    active_only: bool = Query(False),
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    services = await booking_service.get_services(current_user["tenant_id"], active_only)
    return services

@router.get("/services/{service_id}", response_model=Service)
async def get_service(
    service_id: str,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    service = await booking_service.get_service(current_user["tenant_id"], service_id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service

@router.put("/services/{service_id}", response_model=Service)
async def update_service(
    service_id: str,
    service_data: ServiceUpdate,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    service = await booking_service.update_service(
        current_user["tenant_id"],
        service_id,
        service_data.dict(exclude_unset=True)
    )
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    return service

@router.delete("/services/{service_id}")
async def delete_service(
    service_id: str,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    deleted = await booking_service.delete_service(current_user["tenant_id"], service_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Service not found")
    return {"message": "Service deleted successfully"}

# Staff Routes
@router.post("/staff", response_model=Staff)
async def create_staff(
    staff_data: StaffCreate,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    staff = await booking_service.create_staff(
        current_user["tenant_id"],
        staff_data.dict()
    )
    return staff

@router.get("/staff", response_model=List[Staff])
async def get_staff_list(
    service_id: Optional[str] = Query(None),
    active_only: bool = Query(False),
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    staff_list = await booking_service.get_staff_list(
        current_user["tenant_id"],
        service_id,
        active_only
    )
    return staff_list

@router.get("/staff/{staff_id}", response_model=Staff)
async def get_staff(
    staff_id: str,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    staff = await booking_service.get_staff(current_user["tenant_id"], staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    return staff

@router.put("/staff/{staff_id}", response_model=Staff)
async def update_staff(
    staff_id: str,
    staff_data: StaffUpdate,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    staff = await booking_service.update_staff(
        current_user["tenant_id"],
        staff_id,
        staff_data.dict(exclude_unset=True)
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    return staff

@router.delete("/staff/{staff_id}")
async def delete_staff(
    staff_id: str,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    deleted = await booking_service.delete_staff(current_user["tenant_id"], staff_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Staff not found")
    return {"message": "Staff deleted successfully"}

# Bookings Routes
@router.post("/bookings", response_model=Booking)
async def create_booking(
    booking_data: BookingCreate,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    google_calendar = GoogleCalendarService()
    email_service = EmailService()
    
    # Get service, staff, and tenant details
    service = await booking_service.get_service(current_user["tenant_id"], booking_data.service_id)
    staff = await booking_service.get_staff(current_user["tenant_id"], booking_data.staff_id)
    
    if not service or not staff:
        raise HTTPException(status_code=404, detail="Service or Staff not found")
    
    # Get tenant email from user collection
    tenant_user = await db.users.find_one({"tenant_id": current_user["tenant_id"]}, {"_id": 0, "email": 1})
    tenant_email = tenant_user.get("email") if tenant_user else None
    
    # Calculate end time
    end_time = booking_data.start_time + timedelta(minutes=service["duration"])
    
    # Create booking
    booking_dict = booking_data.dict()
    booking_dict["end_time"] = end_time
    booking = await booking_service.create_booking(current_user["tenant_id"], booking_dict)
    
    # Create Google Calendar event if staff has calendar connected
    if staff.get("google_refresh_token"):
        try:
            # Build attendees list: customer, staff, and tenant
            attendees = [{"email": booking["customer_email"]}]
            if staff.get("email"):
                attendees.append({"email": staff["email"]})
            if tenant_email and tenant_email != staff.get("email"):
                attendees.append({"email": tenant_email})
            
            event_data = {
                "summary": f"{service['name']} - {booking['customer_name']}",
                "description": f"Booking with {staff['name']}\n\nCustomer: {booking['customer_name']}\nEmail: {booking['customer_email']}\nPhone: {booking.get('customer_phone', 'N/A')}\n\nNotes: {booking.get('notes', 'N/A')}",
                "start_time": booking["start_time"].isoformat(),
                "end_time": booking["end_time"].isoformat(),
                "attendees": attendees,
                "request_id": f"booking-{booking['id']}"
            }
            
            result = await google_calendar.create_event(staff["google_refresh_token"], event_data)
            
            # Update booking with Google event details
            await booking_service.update_booking(
                current_user["tenant_id"],
                booking["id"],
                {
                    "google_event_id": result["event_id"],
                    "google_meet_link": result.get("meet_link")
                }
            )
            
            booking["google_event_id"] = result["event_id"]
            booking["google_meet_link"] = result.get("meet_link")
        except Exception as e:
            print(f"Failed to create calendar event: {str(e)}")
    
    # Send confirmation emails to all parties
    try:
        # Send to customer
        await email_service.send_confirmation(booking, service, staff)
        
        # Send to staff member
        if staff.get("email"):
            await email_service.send_staff_notification(booking, service, staff)
        
        # Send to tenant
        if tenant_email:
            await email_service.send_tenant_notification(booking, service, staff, tenant_email)
        
        await booking_service.update_booking(
            current_user["tenant_id"],
            booking["id"],
            {"confirmation_sent": True}
        )
    except Exception as e:
        print(f"Failed to send confirmation email: {str(e)}")
    
    return booking

@router.get("/bookings", response_model=List[Booking])
async def get_bookings(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    staff_id: Optional[str] = Query(None),
    status: Optional[BookingStatus] = Query(None),
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    bookings = await booking_service.get_bookings(
        current_user["tenant_id"],
        start_date,
        end_date,
        staff_id,
        status.value if status else None
    )
    return bookings

@router.get("/bookings/{booking_id}", response_model=Booking)
async def get_booking(
    booking_id: str,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    booking = await booking_service.get_booking(current_user["tenant_id"], booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking

@router.put("/bookings/{booking_id}", response_model=Booking)
async def update_booking(
    booking_id: str,
    booking_data: BookingUpdate,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    google_calendar = GoogleCalendarService()
    email_service = EmailService()
    
    # Get current booking
    current_booking = await booking_service.get_booking(current_user["tenant_id"], booking_id)
    if not current_booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    old_start_time = current_booking["start_time"]
    
    # Update booking
    update_dict = booking_data.dict(exclude_unset=True)
    
    # If rescheduling, calculate new end time
    if "start_time" in update_dict:
        service = await booking_service.get_service(current_user["tenant_id"], current_booking["service_id"])
        update_dict["end_time"] = update_dict["start_time"] + timedelta(minutes=service["duration"])
    
    booking = await booking_service.update_booking(
        current_user["tenant_id"],
        booking_id,
        update_dict
    )
    
    # Update Google Calendar event if exists
    if booking.get("google_event_id"):
        staff = await booking_service.get_staff(current_user["tenant_id"], booking["staff_id"])
        if staff and staff.get("google_refresh_token"):
            try:
                event_update = {}
                if "start_time" in update_dict:
                    event_update["start_time"] = booking["start_time"].isoformat()
                    event_update["end_time"] = booking["end_time"].isoformat()
                
                if event_update:
                    await google_calendar.update_event(
                        staff["google_refresh_token"],
                        booking["google_event_id"],
                        event_update
                    )
                
                # Send reschedule email if time changed
                if "start_time" in update_dict:
                    service = await booking_service.get_service(current_user["tenant_id"], booking["service_id"])
                    await email_service.send_reschedule(booking, service, staff, old_start_time)
            except Exception as e:
                print(f"Failed to update calendar event: {str(e)}")
    
    # Handle cancellation
    if booking_data.status == BookingStatus.CANCELLED:
        # Delete Google Calendar event
        if booking.get("google_event_id"):
            staff = await booking_service.get_staff(current_user["tenant_id"], booking["staff_id"])
            if staff and staff.get("google_refresh_token"):
                try:
                    await google_calendar.delete_event(
                        staff["google_refresh_token"],
                        booking["google_event_id"]
                    )
                except Exception as e:
                    print(f"Failed to delete calendar event: {str(e)}")
        
        # Send cancellation email
        service = await booking_service.get_service(current_user["tenant_id"], booking["service_id"])
        staff = await booking_service.get_staff(current_user["tenant_id"], booking["staff_id"])
        try:
            await email_service.send_cancellation(booking, service, staff)
        except Exception as e:
            print(f"Failed to send cancellation email: {str(e)}")
    
    return booking

@router.delete("/bookings/{booking_id}")
async def delete_booking(
    booking_id: str,
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    deleted = await booking_service.delete_booking(current_user["tenant_id"], booking_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"message": "Booking deleted successfully"}

# Availability Routes
@router.get("/availability/{service_id}/{staff_id}")
async def get_available_slots(
    service_id: str,
    staff_id: str,
    date: str = Query(...),
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    date_obj = datetime.fromisoformat(date)
    slots = await booking_service.get_available_slots(
        current_user["tenant_id"],
        service_id,
        staff_id,
        date_obj
    )
    return {"slots": slots}

# Public Routes (no auth)
@router.get("/public/services/{tenant_id}", response_model=List[Service])
async def get_public_services(
    tenant_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    services = await booking_service.get_services(tenant_id, active_only=True)
    return services

@router.get("/public/staff/{tenant_id}", response_model=List[Staff])
async def get_public_staff(
    tenant_id: str,
    service_id: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    staff_list = await booking_service.get_staff_list(tenant_id, service_id, active_only=True)
    return staff_list

@router.get("/public/availability/{tenant_id}/{service_id}/{staff_id}")
async def get_public_available_slots(
    tenant_id: str,
    service_id: str,
    staff_id: str,
    date: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    date_obj = datetime.fromisoformat(date)
    slots = await booking_service.get_available_slots(tenant_id, service_id, staff_id, date_obj)
    return {"slots": slots}

@router.post("/public/bookings/{tenant_id}", response_model=Booking)
async def create_public_booking(
    tenant_id: str,
    booking_data: BookingCreate,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    google_calendar = GoogleCalendarService()
    email_service = EmailService()
    
    service = await booking_service.get_service(tenant_id, booking_data.service_id)
    staff = await booking_service.get_staff(tenant_id, booking_data.staff_id)
    
    if not service or not staff:
        raise HTTPException(status_code=404, detail="Service or Staff not found")
    
    # Get tenant email
    tenant_user = await db.users.find_one({"tenant_id": tenant_id}, {"_id": 0, "email": 1})
    tenant_email = tenant_user.get("email") if tenant_user else None
    
    end_time = booking_data.start_time + timedelta(minutes=service["duration"])
    
    booking_dict = booking_data.dict()
    booking_dict["end_time"] = end_time
    booking = await booking_service.create_booking(tenant_id, booking_dict)
    
    if staff.get("google_refresh_token"):
        try:
            # Build attendees list: customer, staff, and tenant
            attendees = [{"email": booking["customer_email"]}]
            if staff.get("email"):
                attendees.append({"email": staff["email"]})
            if tenant_email and tenant_email != staff.get("email"):
                attendees.append({"email": tenant_email})
            
            event_data = {
                "summary": f"{service['name']} - {booking['customer_name']}",
                "description": f"Booking with {staff['name']}\n\nCustomer: {booking['customer_name']}\nEmail: {booking['customer_email']}\nPhone: {booking.get('customer_phone', 'N/A')}\n\nNotes: {booking.get('notes', 'N/A')}",
                "start_time": booking["start_time"].isoformat(),
                "end_time": booking["end_time"].isoformat(),
                "attendees": attendees,
                "request_id": f"booking-{booking['id']}"
            }
            
            result = await google_calendar.create_event(staff["google_refresh_token"], event_data)
            
            await booking_service.update_booking(
                tenant_id,
                booking["id"],
                {
                    "google_event_id": result["event_id"],
                    "google_meet_link": result.get("meet_link")
                }
            )
            
            booking["google_event_id"] = result["event_id"]
            booking["google_meet_link"] = result.get("meet_link")
        except Exception as e:
            print(f"Failed to create calendar event: {str(e)}")
    
    try:
        # Send to customer
        await email_service.send_confirmation(booking, service, staff)
        
        # Send to staff member
        if staff.get("email"):
            await email_service.send_staff_notification(booking, service, staff)
        
        # Send to tenant
        if tenant_email:
            await email_service.send_tenant_notification(booking, service, staff, tenant_email)
        
        await booking_service.update_booking(tenant_id, booking["id"], {"confirmation_sent": True})
    except Exception as e:
        print(f"Failed to send confirmation email: {str(e)}")
    
    return booking

# Dashboard
@router.get("/dashboard/stats")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    booking_service = BookingService(db)
    stats = await booking_service.get_dashboard_stats(current_user["tenant_id"])
    return stats

# OAuth Routes
@router.get("/oauth/google/url")
async def get_google_auth_url(
    staff_id: str = Query(...),
    current_user: dict = Depends(get_current_user_dict)
):
    google_calendar = GoogleCalendarService()
    auth_url = google_calendar.get_auth_url(state=f"{current_user['tenant_id']}:{staff_id}")
    return {"auth_url": auth_url}

@router.get("/oauth/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    google_calendar = GoogleCalendarService()
    
    # Extract tenant_id and staff_id from state
    tenant_id, staff_id = state.split(":")
    
    # Exchange code for tokens
    tokens = google_calendar.exchange_code(code)
    
    # Update staff with refresh token
    booking_service = BookingService(db)
    await booking_service.update_staff(
        tenant_id,
        staff_id,
        {"google_refresh_token": tokens["refresh_token"]}
    )
    
    return {"message": "Google Calendar connected successfully", "staff_id": staff_id}

# Public Booking Management Routes
@router.get("/public/booking/{booking_id}")
async def get_public_booking(
    booking_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Get booking details without authentication"""
    booking_service = BookingService(db)
    # Find booking across all tenants
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking

@router.put("/public/booking/{booking_id}/cancel")
async def cancel_public_booking(
    booking_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Cancel a booking without authentication"""
    booking_service = BookingService(db)
    email_service = EmailService()
    google_calendar = GoogleCalendarService()
    
    # Get booking
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    # Get service and staff
    service = await booking_service.get_service(booking["tenant_id"], booking["service_id"])
    staff = await booking_service.get_staff(booking["tenant_id"], booking["staff_id"])
    
    # Update status
    await booking_service.update_booking(booking["tenant_id"], booking_id, {"status": "cancelled"})
    
    # Delete Google Calendar event
    if booking.get("google_event_id") and staff.get("google_refresh_token"):
        try:
            await google_calendar.delete_event(staff["google_refresh_token"], booking["google_event_id"])
        except Exception as e:
            print(f"Failed to delete calendar event: {str(e)}")
    
    # Send cancellation emails
    try:
        await email_service.send_cancellation(booking, service, staff)
    except Exception as e:
        print(f"Failed to send cancellation email: {str(e)}")
    
    return {"message": "Booking cancelled successfully"}

@router.put("/public/booking/{booking_id}/reschedule")
async def reschedule_public_booking(
    booking_id: str,
    booking_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Reschedule a booking without authentication"""
    booking_service = BookingService(db)
    email_service = EmailService()
    google_calendar = GoogleCalendarService()
    
    # Get booking
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    old_start_time = booking["start_time"]
    new_start_time = datetime.fromisoformat(booking_data["start_time"].replace('Z', '+00:00'))
    
    # Get service and staff
    service = await booking_service.get_service(booking["tenant_id"], booking["service_id"])
    staff = await booking_service.get_staff(booking["tenant_id"], booking["staff_id"])
    
    # Calculate new end time
    new_end_time = new_start_time + timedelta(minutes=service["duration"])
    
    # Update booking
    updated_booking = await booking_service.update_booking(
        booking["tenant_id"],
        booking_id,
        {"start_time": new_start_time, "end_time": new_end_time}
    )
    
    # Update Google Calendar event
    if booking.get("google_event_id") and staff.get("google_refresh_token"):
        try:
            await google_calendar.update_event(
                staff["google_refresh_token"],
                booking["google_event_id"],
                {
                    "start_time": new_start_time.isoformat(),
                    "end_time": new_end_time.isoformat()
                }
            )
        except Exception as e:
            print(f"Failed to update calendar event: {str(e)}")
    
    # Send reschedule emails
    try:
        await email_service.send_reschedule(updated_booking, service, staff, old_start_time)
    except Exception as e:
        print(f"Failed to send reschedule email: {str(e)}")
    
    return {"message": "Booking rescheduled successfully"}

# Test Email Route
@router.get("/test-email")
async def test_email(
    to_email: str = Query(...),
    current_user: dict = Depends(get_current_user_dict),
    db: AsyncIOMotorDatabase = Depends(get_database)
):
    """Test endpoint to verify email configuration"""
    email_service = EmailService()
    
    test_html = """
    <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #4CAF50;">✅ Email Test Successful!</h2>
            <p>If you're reading this, your email configuration is working correctly.</p>
            <p><strong>SMTP Settings:</strong></p>
            <ul>
                <li>Host: smtp.gmail.com</li>
                <li>Port: 587</li>
                <li>From: ankush.t@amroar.com</li>
            </ul>
            <p>Your booking system is ready to send notifications!</p>
        </body>
    </html>
    """
    
    try:
        result = await email_service.send_email(
            to_email,
            "🧪 Booking System - Email Test",
            test_html
        )
        if result:
            return {"success": True, "message": f"Test email sent to {to_email}"}
        else:
            return {"success": False, "message": "Email sending failed - check backend logs"}
    except Exception as e:
        return {"success": False, "message": f"Error: {str(e)}"}
