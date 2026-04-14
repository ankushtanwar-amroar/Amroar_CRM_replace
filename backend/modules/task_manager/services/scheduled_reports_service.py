"""
Scheduled Reports Service - Phase 15
Handles scheduling and delivery of reports via email
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
import base64
import os

logger = logging.getLogger(__name__)


class ScheduledReportsService:
    """Service for scheduling and delivering reports"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.tm_report_schedules
        self.logs_collection = db.tm_report_delivery_logs
    
    # =========================================================================
    # SCHEDULE MANAGEMENT
    # =========================================================================
    
    async def create_schedule(
        self,
        tenant_id: str,
        created_by: str,
        name: str,
        report_type: str,
        frequency: str,  # daily, weekly, monthly
        export_format: str,  # csv, pdf
        recipients: List[str],
        filters: Optional[Dict[str, Any]] = None,
        day_of_week: Optional[int] = None,  # 0-6 for weekly
        day_of_month: Optional[int] = None,  # 1-31 for monthly
        time_of_day: str = "09:00",
        timezone_str: str = "UTC"
    ) -> Dict[str, Any]:
        """Create a new report schedule"""
        
        schedule_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        # Calculate next run time
        next_run = self._calculate_next_run(
            frequency=frequency,
            time_of_day=time_of_day,
            day_of_week=day_of_week,
            day_of_month=day_of_month
        )
        
        schedule = {
            "id": schedule_id,
            "tenant_id": tenant_id,
            "created_by": created_by,
            "name": name,
            "report_type": report_type,
            "frequency": frequency,
            "export_format": export_format,
            "recipients": recipients,
            "filters": filters or {},
            "day_of_week": day_of_week,
            "day_of_month": day_of_month,
            "time_of_day": time_of_day,
            "timezone": timezone_str,
            "is_active": True,
            "is_paused": False,
            "next_run_at": next_run,
            "last_run_at": None,
            "run_count": 0,
            "failure_count": 0,
            "created_at": now,
            "updated_at": now
        }
        
        await self.collection.insert_one(schedule)
        
        # Return without _id
        schedule.pop("_id", None)
        return schedule
    
    async def update_schedule(
        self,
        schedule_id: str,
        tenant_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update a schedule"""
        
        # Remove protected fields
        protected = ["id", "tenant_id", "created_by", "created_at", "run_count", "failure_count"]
        for field in protected:
            updates.pop(field, None)
        
        updates["updated_at"] = datetime.now(timezone.utc)
        
        # Recalculate next run if schedule params changed
        if any(k in updates for k in ["frequency", "time_of_day", "day_of_week", "day_of_month"]):
            schedule = await self.collection.find_one({"id": schedule_id, "tenant_id": tenant_id})
            if schedule:
                frequency = updates.get("frequency", schedule.get("frequency"))
                time_of_day = updates.get("time_of_day", schedule.get("time_of_day"))
                day_of_week = updates.get("day_of_week", schedule.get("day_of_week"))
                day_of_month = updates.get("day_of_month", schedule.get("day_of_month"))
                
                updates["next_run_at"] = self._calculate_next_run(
                    frequency=frequency,
                    time_of_day=time_of_day,
                    day_of_week=day_of_week,
                    day_of_month=day_of_month
                )
        
        result = await self.collection.find_one_and_update(
            {"id": schedule_id, "tenant_id": tenant_id, "is_active": True},
            {"$set": updates},
            return_document=True
        )
        
        if result:
            result.pop("_id", None)
        return result
    
    async def delete_schedule(
        self,
        schedule_id: str,
        tenant_id: str
    ) -> bool:
        """Soft delete a schedule"""
        result = await self.collection.update_one(
            {"id": schedule_id, "tenant_id": tenant_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0
    
    async def get_schedule(
        self,
        schedule_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a single schedule"""
        schedule = await self.collection.find_one(
            {"id": schedule_id, "tenant_id": tenant_id, "is_active": True},
            {"_id": 0}
        )
        return schedule
    
    async def list_schedules(
        self,
        tenant_id: str,
        include_paused: bool = True
    ) -> List[Dict[str, Any]]:
        """List all schedules for tenant"""
        query = {"tenant_id": tenant_id, "is_active": True}
        if not include_paused:
            query["is_paused"] = False
        
        schedules = await self.collection.find(query, {"_id": 0}).to_list(100)
        return schedules
    
    async def pause_schedule(
        self,
        schedule_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Pause a schedule"""
        return await self.update_schedule(schedule_id, tenant_id, {"is_paused": True})
    
    async def resume_schedule(
        self,
        schedule_id: str,
        tenant_id: str
    ) -> Optional[Dict[str, Any]]:
        """Resume a schedule"""
        schedule = await self.collection.find_one({"id": schedule_id, "tenant_id": tenant_id})
        if schedule:
            # Recalculate next run
            next_run = self._calculate_next_run(
                frequency=schedule.get("frequency"),
                time_of_day=schedule.get("time_of_day"),
                day_of_week=schedule.get("day_of_week"),
                day_of_month=schedule.get("day_of_month")
            )
            return await self.update_schedule(schedule_id, tenant_id, {"is_paused": False, "next_run_at": next_run})
        return None
    
    # =========================================================================
    # SCHEDULE EXECUTION
    # =========================================================================
    
    async def get_due_schedules(self) -> List[Dict[str, Any]]:
        """Get all schedules that are due for execution"""
        now = datetime.now(timezone.utc)
        
        schedules = await self.collection.find(
            {
                "is_active": True,
                "is_paused": False,
                "next_run_at": {"$lte": now}
            },
            {"_id": 0}
        ).to_list(100)
        
        return schedules
    
    async def process_due_schedules(self, reports_service, sendgrid_api_key: Optional[str] = None) -> Dict[str, Any]:
        """Process all due schedules"""
        from .advanced_reports_service import AdvancedReportsService
        
        schedules = await self.get_due_schedules()
        results = {
            "processed": 0,
            "success": 0,
            "failed": 0,
            "details": []
        }
        
        for schedule in schedules:
            try:
                result = await self.execute_schedule(schedule, reports_service, sendgrid_api_key)
                results["processed"] += 1
                if result.get("success"):
                    results["success"] += 1
                else:
                    results["failed"] += 1
                results["details"].append(result)
            except Exception as e:
                logger.error(f"Failed to process schedule {schedule['id']}: {e}")
                results["processed"] += 1
                results["failed"] += 1
                results["details"].append({
                    "schedule_id": schedule["id"],
                    "success": False,
                    "error": str(e)
                })
        
        return results
    
    async def execute_schedule(
        self,
        schedule: Dict[str, Any],
        reports_service,
        sendgrid_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute a single schedule - generate report and send email"""
        schedule_id = schedule["id"]
        tenant_id = schedule["tenant_id"]
        report_type = schedule["report_type"]
        export_format = schedule["export_format"]
        recipients = schedule["recipients"]
        filters = schedule.get("filters", {})
        
        now = datetime.now(timezone.utc)
        
        # Parse filters
        start_date = None
        end_date = now
        
        if filters.get("date_range") == "last_7_days":
            start_date = now - timedelta(days=7)
        elif filters.get("date_range") == "last_30_days":
            start_date = now - timedelta(days=30)
        elif filters.get("date_range") == "last_90_days":
            start_date = now - timedelta(days=90)
        elif filters.get("start_date"):
            start_date = datetime.fromisoformat(filters["start_date"].replace("Z", "+00:00"))
        
        project_id = filters.get("project_id")
        
        try:
            # Generate report
            report_data = await self._generate_report(
                reports_service=reports_service,
                report_type=report_type,
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                project_id=project_id
            )
            
            # Export to file
            if export_format == "csv":
                file_content = reports_service.export_to_csv(report_type, report_data)
                file_name = f"{report_type}_report_{now.strftime('%Y%m%d')}.csv"
                content_type = "text/csv"
            else:  # pdf
                file_content = reports_service.export_to_pdf(report_type, report_data)
                file_name = f"{report_type}_report_{now.strftime('%Y%m%d')}.pdf"
                content_type = "application/pdf"
            
            # Send email
            email_sent = await self._send_report_email(
                recipients=recipients,
                report_name=schedule["name"],
                report_type=report_type,
                file_content=file_content,
                file_name=file_name,
                content_type=content_type,
                sendgrid_api_key=sendgrid_api_key
            )
            
            # Update schedule
            next_run = self._calculate_next_run(
                frequency=schedule["frequency"],
                time_of_day=schedule["time_of_day"],
                day_of_week=schedule.get("day_of_week"),
                day_of_month=schedule.get("day_of_month")
            )
            
            await self.collection.update_one(
                {"id": schedule_id},
                {
                    "$set": {
                        "last_run_at": now,
                        "next_run_at": next_run,
                        "updated_at": now
                    },
                    "$inc": {"run_count": 1}
                }
            )
            
            # Log success
            await self._log_delivery(
                schedule_id=schedule_id,
                tenant_id=tenant_id,
                status="success",
                recipients=recipients,
                details={"email_sent": email_sent, "file_name": file_name}
            )
            
            return {
                "schedule_id": schedule_id,
                "success": True,
                "email_sent": email_sent,
                "next_run": next_run.isoformat() if next_run else None
            }
            
        except Exception as e:
            logger.error(f"Schedule execution failed: {e}")
            
            # Update failure count
            await self.collection.update_one(
                {"id": schedule_id},
                {
                    "$inc": {"failure_count": 1},
                    "$set": {"updated_at": now}
                }
            )
            
            # Log failure
            await self._log_delivery(
                schedule_id=schedule_id,
                tenant_id=tenant_id,
                status="failed",
                recipients=recipients,
                details={"error": str(e)}
            )
            
            return {
                "schedule_id": schedule_id,
                "success": False,
                "error": str(e)
            }
    
    async def _generate_report(
        self,
        reports_service,
        report_type: str,
        tenant_id: str,
        start_date: Optional[datetime],
        end_date: Optional[datetime],
        project_id: Optional[str]
    ) -> Dict[str, Any]:
        """Generate report data based on type"""
        
        if report_type == "task_performance":
            return await reports_service.get_task_performance_report(
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                project_id=project_id
            )
        elif report_type == "time_tracking":
            return await reports_service.get_time_tracking_report(
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                project_id=project_id
            )
        elif report_type == "sla_compliance":
            return await reports_service.get_sla_compliance_report(
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                project_id=project_id
            )
        elif report_type == "recurring_tasks":
            return await reports_service.get_recurring_tasks_report(
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                project_id=project_id
            )
        elif report_type == "approval_analytics":
            return await reports_service.get_approval_analytics_report(
                tenant_id=tenant_id,
                start_date=start_date,
                end_date=end_date,
                project_id=project_id
            )
        else:
            raise ValueError(f"Unknown report type: {report_type}")
    
    async def _send_report_email(
        self,
        recipients: List[str],
        report_name: str,
        report_type: str,
        file_content,
        file_name: str,
        content_type: str,
        sendgrid_api_key: Optional[str] = None
    ) -> bool:
        """Send report via email using SendGrid"""
        import httpx
        
        api_key = sendgrid_api_key or os.environ.get("SENDGRID_API_KEY")
        if not api_key:
            logger.warning("No SendGrid API key configured, skipping email")
            return False
        
        from_email = os.environ.get("SENDGRID_FROM_EMAIL", "reports@taskmanager.com")
        
        # Encode file content for attachment
        if isinstance(file_content, str):
            encoded_content = base64.b64encode(file_content.encode()).decode()
        else:
            encoded_content = base64.b64encode(file_content).decode()
        
        report_type_display = report_type.replace("_", " ").title()
        
        email_data = {
            "personalizations": [{"to": [{"email": r} for r in recipients]}],
            "from": {"email": from_email, "name": "Task Manager Reports"},
            "subject": f"Scheduled Report: {report_name}",
            "content": [
                {
                    "type": "text/html",
                    "value": f"""
                    <html>
                    <body style="font-family: Arial, sans-serif; color: #333;">
                        <h2>Scheduled Report: {report_name}</h2>
                        <p>Your scheduled <strong>{report_type_display}</strong> report is attached.</p>
                        <p>This report was automatically generated on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #666;">
                            This is an automated email from Task Manager. 
                            To manage your report schedules, please log in to the application.
                        </p>
                    </body>
                    </html>
                    """
                }
            ],
            "attachments": [
                {
                    "content": encoded_content,
                    "filename": file_name,
                    "type": content_type,
                    "disposition": "attachment"
                }
            ]
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json=email_data,
                    timeout=30
                )
                
                if response.status_code in [200, 202]:
                    logger.info(f"Report email sent successfully to {recipients}")
                    return True
                else:
                    logger.error(f"SendGrid error: {response.status_code} - {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False
    
    async def _log_delivery(
        self,
        schedule_id: str,
        tenant_id: str,
        status: str,
        recipients: List[str],
        details: Optional[Dict[str, Any]] = None
    ):
        """Log delivery attempt"""
        log = {
            "id": str(uuid.uuid4()),
            "schedule_id": schedule_id,
            "tenant_id": tenant_id,
            "status": status,
            "recipients": recipients,
            "details": details or {},
            "created_at": datetime.now(timezone.utc)
        }
        await self.logs_collection.insert_one(log)
    
    async def get_delivery_logs(
        self,
        schedule_id: str,
        tenant_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get delivery logs for a schedule"""
        logs = await self.logs_collection.find(
            {"schedule_id": schedule_id, "tenant_id": tenant_id},
            {"_id": 0}
        ).sort("created_at", -1).limit(limit).to_list(limit)
        return logs
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    def _calculate_next_run(
        self,
        frequency: str,
        time_of_day: str,
        day_of_week: Optional[int] = None,
        day_of_month: Optional[int] = None
    ) -> datetime:
        """Calculate the next run time for a schedule"""
        now = datetime.now(timezone.utc)
        hour, minute = map(int, time_of_day.split(":"))
        
        if frequency == "daily":
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            return next_run
        
        elif frequency == "weekly":
            # day_of_week: 0=Monday, 6=Sunday
            target_day = day_of_week if day_of_week is not None else 0
            current_day = now.weekday()
            days_ahead = target_day - current_day
            if days_ahead < 0:
                days_ahead += 7
            
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
            if next_run <= now:
                next_run += timedelta(days=7)
            return next_run
        
        elif frequency == "monthly":
            target_day = day_of_month if day_of_month else 1
            # Try this month
            try:
                next_run = now.replace(day=target_day, hour=hour, minute=minute, second=0, microsecond=0)
                if next_run <= now:
                    # Move to next month
                    if now.month == 12:
                        next_run = next_run.replace(year=now.year + 1, month=1)
                    else:
                        next_run = next_run.replace(month=now.month + 1)
            except ValueError:
                # Day doesn't exist in month, use last day
                if now.month == 12:
                    next_month = now.replace(year=now.year + 1, month=1, day=1)
                else:
                    next_month = now.replace(month=now.month + 1, day=1)
                last_day = (next_month - timedelta(days=1)).day
                next_run = now.replace(day=min(target_day, last_day), hour=hour, minute=minute, second=0, microsecond=0)
                if next_run <= now:
                    next_run = next_month.replace(hour=hour, minute=minute, second=0, microsecond=0)
            
            return next_run
        
        # Default: tomorrow
        return now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=1)
