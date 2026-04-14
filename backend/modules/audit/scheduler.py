"""
Audit Cleanup Scheduler

Scheduled job to clean up old audit logs based on retention policies.
This runs as a background task and cleans up audit records older than
the configured retention period for each object.

Usage:
    From server.py startup:
    from modules.audit.scheduler import start_audit_cleanup_scheduler
    
    @app.on_event("startup")
    async def startup_event():
        await start_audit_cleanup_scheduler()
"""

import logging
import asyncio
from datetime import datetime, timezone, time
from typing import Optional
import os

from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

# Scheduler state
_cleanup_task: Optional[asyncio.Task] = None
_is_running = False


async def run_cleanup_job():
    """
    Execute the cleanup job.
    This deletes audit events older than the configured retention period.
    """
    logger.info("Starting scheduled audit cleanup job...")
    
    try:
        # Get database connection
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME", "crm_platform")
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        
        # Import and run cleanup service
        from .services.audit_cleanup_service import AuditCleanupService
        cleanup_service = AuditCleanupService(db)
        
        result = await cleanup_service.run_cleanup()
        
        logger.info(f"Audit cleanup completed: {result.get('events_deleted', 0)} events deleted")
        
        # Close connection
        client.close()
        
        return result
        
    except Exception as e:
        logger.error(f"Audit cleanup job failed: {e}")
        return {"error": str(e)}


async def cleanup_scheduler_loop():
    """
    Background loop that runs the cleanup job daily at 2 AM.
    """
    global _is_running
    _is_running = True
    
    logger.info("Audit cleanup scheduler started")
    
    while _is_running:
        try:
            now = datetime.now(timezone.utc)
            
            # Calculate time until next 2 AM UTC
            target_time = time(2, 0, 0)  # 2:00 AM
            target_datetime = datetime.combine(now.date(), target_time, tzinfo=timezone.utc)
            
            # If we've already passed 2 AM today, schedule for tomorrow
            if now.time() >= target_time:
                target_datetime = datetime.combine(
                    now.date(), target_time, tzinfo=timezone.utc
                ).replace(day=now.day + 1)
            
            # Calculate seconds until target
            seconds_until_target = (target_datetime - now).total_seconds()
            
            # Cap at 24 hours max wait
            if seconds_until_target > 86400:
                seconds_until_target = 86400
            
            logger.info(f"Next audit cleanup scheduled in {seconds_until_target / 3600:.1f} hours")
            
            # Wait until target time
            await asyncio.sleep(seconds_until_target)
            
            # Run cleanup
            if _is_running:
                await run_cleanup_job()
                
        except asyncio.CancelledError:
            logger.info("Audit cleanup scheduler cancelled")
            break
        except Exception as e:
            logger.error(f"Error in cleanup scheduler loop: {e}")
            # Wait 1 hour before retrying on error
            await asyncio.sleep(3600)
    
    logger.info("Audit cleanup scheduler stopped")


async def start_audit_cleanup_scheduler():
    """
    Start the audit cleanup scheduler as a background task.
    Should be called from server startup.
    """
    global _cleanup_task
    
    if _cleanup_task is not None and not _cleanup_task.done():
        logger.warning("Audit cleanup scheduler already running")
        return
    
    _cleanup_task = asyncio.create_task(cleanup_scheduler_loop())
    logger.info("Audit cleanup scheduler task created")


async def stop_audit_cleanup_scheduler():
    """
    Stop the audit cleanup scheduler.
    Should be called from server shutdown.
    """
    global _cleanup_task, _is_running
    
    _is_running = False
    
    if _cleanup_task is not None:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        _cleanup_task = None
    
    logger.info("Audit cleanup scheduler stopped")


async def trigger_manual_cleanup():
    """
    Trigger an immediate cleanup job.
    Useful for testing or manual intervention.
    """
    return await run_cleanup_job()
