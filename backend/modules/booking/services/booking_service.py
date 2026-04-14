from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from uuid import uuid4
from motor.motor_asyncio import AsyncIOMotorDatabase

class BookingService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.services_collection = db.booking_services
        self.staff_collection = db.booking_staff
        self.bookings_collection = db.bookings

    # Services
    async def create_service(self, tenant_id: str, service_data: dict) -> dict:
        service = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            **service_data,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await self.services_collection.insert_one(service)
        service.pop("_id", None)
        return service

    async def get_services(self, tenant_id: str, active_only: bool = False) -> List[dict]:
        query = {"tenant_id": tenant_id}
        if active_only:
            query["is_active"] = True
        services = await self.services_collection.find(query, {"_id": 0}).to_list(1000)
        return services

    async def get_service(self, tenant_id: str, service_id: str) -> Optional[dict]:
        service = await self.services_collection.find_one(
            {"id": service_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        return service

    async def update_service(self, tenant_id: str, service_id: str, update_data: dict) -> Optional[dict]:
        update_data["updated_at"] = datetime.utcnow()
        result = await self.services_collection.update_one(
            {"id": service_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        if result.modified_count > 0:
            return await self.get_service(tenant_id, service_id)
        return None

    async def delete_service(self, tenant_id: str, service_id: str) -> bool:
        result = await self.services_collection.delete_one(
            {"id": service_id, "tenant_id": tenant_id}
        )
        return result.deleted_count > 0

    # Staff
    async def create_staff(self, tenant_id: str, staff_data: dict) -> dict:
        staff = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            **staff_data,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await self.staff_collection.insert_one(staff)
        staff.pop("_id", None)
        return staff

    async def get_staff_list(self, tenant_id: str, service_id: Optional[str] = None, active_only: bool = False) -> List[dict]:
        query = {"tenant_id": tenant_id}
        if active_only:
            query["is_active"] = True
        if service_id:
            query["services"] = service_id
        staff_list = await self.staff_collection.find(query, {"_id": 0}).to_list(1000)
        return staff_list

    async def get_staff(self, tenant_id: str, staff_id: str) -> Optional[dict]:
        staff = await self.staff_collection.find_one(
            {"id": staff_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        return staff

    async def update_staff(self, tenant_id: str, staff_id: str, update_data: dict) -> Optional[dict]:
        update_data["updated_at"] = datetime.utcnow()
        result = await self.staff_collection.update_one(
            {"id": staff_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        if result.modified_count > 0:
            return await self.get_staff(tenant_id, staff_id)
        return None

    async def delete_staff(self, tenant_id: str, staff_id: str) -> bool:
        result = await self.staff_collection.delete_one(
            {"id": staff_id, "tenant_id": tenant_id}
        )
        return result.deleted_count > 0

    # Bookings
    async def create_booking(self, tenant_id: str, booking_data: dict) -> dict:
        booking = {
            "id": str(uuid4()),
            "tenant_id": tenant_id,
            **booking_data,
            "status": "confirmed",
            "confirmation_sent": False,
            "reminder_sent": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await self.bookings_collection.insert_one(booking)
        booking.pop("_id", None)
        return booking

    async def get_bookings(self, tenant_id: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, staff_id: Optional[str] = None, status: Optional[str] = None) -> List[dict]:
        query = {"tenant_id": tenant_id}
        if start_date or end_date:
            query["start_time"] = {}
            if start_date:
                query["start_time"]["$gte"] = start_date
            if end_date:
                query["start_time"]["$lte"] = end_date
        if staff_id:
            query["staff_id"] = staff_id
        if status:
            query["status"] = status
        bookings = await self.bookings_collection.find(query, {"_id": 0}).sort("start_time", 1).to_list(1000)
        return bookings

    async def get_booking(self, tenant_id: str, booking_id: str) -> Optional[dict]:
        booking = await self.bookings_collection.find_one(
            {"id": booking_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        return booking

    async def update_booking(self, tenant_id: str, booking_id: str, update_data: dict) -> Optional[dict]:
        update_data["updated_at"] = datetime.utcnow()
        result = await self.bookings_collection.update_one(
            {"id": booking_id, "tenant_id": tenant_id},
            {"$set": update_data}
        )
        if result.modified_count > 0:
            return await self.get_booking(tenant_id, booking_id)
        return None

    async def delete_booking(self, tenant_id: str, booking_id: str) -> bool:
        result = await self.bookings_collection.delete_one(
            {"id": booking_id, "tenant_id": tenant_id}
        )
        return result.deleted_count > 0

    async def get_available_slots(self, tenant_id: str, service_id: str, staff_id: str, date: datetime) -> List[dict]:
        service = await self.get_service(tenant_id, service_id)
        staff = await self.get_staff(tenant_id, staff_id)
        
        if not service or not staff:
            return []

        day_name = date.strftime("%A").lower()
        availability = next((a for a in staff.get("availability", []) if a["day"] == day_name and a.get("enabled")), None)
        
        if not availability or not availability.get("slots"):
            return []

        duration = service["duration"] + service.get("buffer_time", 0)
        slots = []

        for slot in availability["slots"]:
            start_time = datetime.strptime(f"{date.date()} {slot['start']}", "%Y-%m-%d %H:%M")
            end_time = datetime.strptime(f"{date.date()} {slot['end']}", "%Y-%m-%d %H:%M")
            
            current = start_time
            while current + timedelta(minutes=service["duration"]) <= end_time:
                slot_end = current + timedelta(minutes=service["duration"])
                
                # Check if slot is available
                existing = await self.bookings_collection.find_one({
                    "tenant_id": tenant_id,
                    "staff_id": staff_id,
                    "status": {"$in": ["confirmed", "pending"]},
                    "start_time": {"$lt": slot_end},
                    "end_time": {"$gt": current}
                })
                
                if not existing and current >= datetime.utcnow():
                    slots.append({
                        "start": current.isoformat(),
                        "end": slot_end.isoformat(),
                        "available": True
                    })
                
                current += timedelta(minutes=duration)

        return slots

    async def get_dashboard_stats(self, tenant_id: str) -> dict:
        now = datetime.utcnow()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        total_bookings = await self.bookings_collection.count_documents({"tenant_id": tenant_id})
        today_bookings = await self.bookings_collection.count_documents({
            "tenant_id": tenant_id,
            "start_time": {"$gte": today_start}
        })
        upcoming = await self.bookings_collection.count_documents({
            "tenant_id": tenant_id,
            "start_time": {"$gte": now},
            "status": {"$in": ["confirmed", "pending"]}
        })

        revenue_pipeline = self.bookings_collection.aggregate([
            {"$match": {
                "tenant_id": tenant_id,
                "status": {"$in": ["confirmed", "pending"]}
            }},
            {"$lookup": {
                "from": "booking_services",
                "localField": "service_id",
                "foreignField": "id",
                "as": "service"
            }},
            {"$unwind": "$service"},
            {"$group": {"_id": None, "total": {"$sum": "$service.price"}}}
        ])
        revenue_list = await revenue_pipeline.to_list(1)
        revenue = revenue_list[0]["total"] if revenue_list else 0

        return {
            "total_bookings": total_bookings,
            "today_bookings": today_bookings,
            "upcoming_bookings": upcoming,
            "revenue": revenue
        }
