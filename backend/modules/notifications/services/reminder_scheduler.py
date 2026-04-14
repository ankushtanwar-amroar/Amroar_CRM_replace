"""
Event Reminder Scheduler

Background job that checks for upcoming events and creates reminder notifications.
Runs periodically (every minute) to find events that need reminders.
"""

import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from .notification_engine import get_notification_engine

logger = logging.getLogger(__name__)


class ReminderScheduler:
    """Scheduler for event reminder notifications"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the reminder scheduler"""
        if self.is_running:
            logger.warning("Reminder scheduler already running")
            return
        
        self.is_running = True
        self._task = asyncio.create_task(self._run_scheduler())
        logger.info("Reminder scheduler started")
    
    async def stop(self):
        """Stop the reminder scheduler"""
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Reminder scheduler stopped")
    
    async def _run_scheduler(self):
        """Main scheduler loop"""
        while self.is_running:
            try:
                await self._process_pending_reminders()
            except Exception as e:
                logger.error(f"Error in reminder scheduler: {e}")
            
            # Wait 1 minute before next check
            await asyncio.sleep(60)
    
    async def _process_pending_reminders(self):
        """Find and process events that need reminder notifications"""
        now = datetime.now(timezone.utc)
        
        # Find events with:
        # - send_reminder = true
        # - reminder_sent = false
        # - reminder_scheduled_at <= now
        query = {
            "object_name": "event",
            "data.send_reminder": True,
            "data.reminder_sent": {"$ne": True},
            "data.reminder_scheduled_at": {"$lte": now}
        }
        
        cursor = self.db.object_records.find(query)
        events = await cursor.to_list(length=100)
        
        if events:
            logger.info(f"Processing {len(events)} event reminders")
        
        notification_engine = get_notification_engine(self.db)
        
        for event in events:
            try:
                event_data = event.get("data", {})
                event_id = event.get("id")
                tenant_id = event.get("tenant_id")
                
                # Get event owner
                owner_id = event_data.get("owner_id") or event.get("owner_id") or event.get("created_by")
                if not owner_id:
                    logger.warning(f"Event {event_id} has no owner, skipping reminder")
                    continue
                
                # Calculate minutes until event
                start_time = event_data.get("start_time") or event_data.get("start_date")
                if isinstance(start_time, str):
                    start_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                
                minutes_until = int((start_time - now).total_seconds() / 60) if start_time else 0
                
                # Create reminder notification
                event_name = event_data.get("subject") or event_data.get("name") or "Event"
                await notification_engine.notify_event_reminder(
                    tenant_id=tenant_id,
                    user_id=owner_id,
                    event_id=event_id,
                    event_name=event_name,
                    event_start_time=start_time or now,
                    minutes_until=minutes_until
                )
                
                # Mark reminder as sent
                await self.db.object_records.update_one(
                    {"id": event_id},
                    {"$set": {"data.reminder_sent": True}}
                )
                
                logger.info(f"Sent reminder for event {event_id} to user {owner_id}")
                
            except Exception as e:
                logger.error(f"Error processing reminder for event {event.get('id')}: {e}")
    
    async def schedule_event_reminder(
        self,
        event_id: str,
        event_start_time: datetime,
        reminder_minutes: int = 15
    ):
        """Schedule a reminder for an event"""
        reminder_time = event_start_time - timedelta(minutes=reminder_minutes)
        
        await self.db.object_records.update_one(
            {"id": event_id},
            {
                "$set": {
                    "data.send_reminder": True,
                    "data.reminder_minutes": reminder_minutes,
                    "data.reminder_scheduled_at": reminder_time,
                    "data.reminder_sent": False
                }
            }
        )
        
        logger.info(f"Scheduled reminder for event {event_id} at {reminder_time}")


# Global instance
_reminder_scheduler: Optional[ReminderScheduler] = None


def get_reminder_scheduler(db: AsyncIOMotorDatabase) -> ReminderScheduler:
    """Get or create reminder scheduler instance"""
    global _reminder_scheduler
    if _reminder_scheduler is None:
        _reminder_scheduler = ReminderScheduler(db)
    return _reminder_scheduler
