"""
Task Manager Reports API Router - Phase 15
Handles advanced reporting, exports, and scheduled reports
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from fastapi.responses import StreamingResponse
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import logging
import io

from motor.motor_asyncio import AsyncIOMotorClient
import os

from server import get_current_user
from shared.models import User

from ..services.advanced_reports_service import AdvancedReportsService
from ..services.scheduled_reports_service import ScheduledReportsService

logger = logging.getLogger(__name__)

# Database connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "crm_platform")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Initialize services
reports_service = AdvancedReportsService(db)
scheduled_reports_service = ScheduledReportsService(db)

# Create router
reports_router = APIRouter(prefix="/api/task-manager/reports", tags=["task-manager-reports"])


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class CreateScheduleRequest(BaseModel):
    name: str
    report_type: str  # task_performance, time_tracking, sla_compliance, recurring_tasks, approval_analytics
    frequency: str  # daily, weekly, monthly
    export_format: str  # csv, pdf
    recipients: List[str]
    filters: Optional[dict] = None
    day_of_week: Optional[int] = None  # 0-6 for weekly
    day_of_month: Optional[int] = None  # 1-31 for monthly
    time_of_day: str = "09:00"
    timezone: str = "UTC"


class UpdateScheduleRequest(BaseModel):
    name: Optional[str] = None
    recipients: Optional[List[str]] = None
    filters: Optional[dict] = None
    day_of_week: Optional[int] = None
    day_of_month: Optional[int] = None
    time_of_day: Optional[str] = None
    timezone: Optional[str] = None
    frequency: Optional[str] = None
    export_format: Optional[str] = None


# ============================================================================
# REPORT ENDPOINTS
# ============================================================================

@reports_router.get("/task-performance")
async def get_task_performance_report(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    assignee_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None)
):
    """Get Task Performance Report"""
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else None
    end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else None
    
    report = await reports_service.get_task_performance_report(
        tenant_id=current_user.tenant_id,
        start_date=start,
        end_date=end,
        project_id=project_id,
        assignee_id=assignee_id,
        status=status
    )
    return report


@reports_router.get("/time-tracking")
async def get_time_tracking_report(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None)
):
    """Get Time Tracking Report"""
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else None
    end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else None
    
    report = await reports_service.get_time_tracking_report(
        tenant_id=current_user.tenant_id,
        start_date=start,
        end_date=end,
        project_id=project_id,
        user_id=user_id
    )
    return report


@reports_router.get("/sla-compliance")
async def get_sla_compliance_report(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assignee_id: Optional[str] = Query(None)
):
    """Get SLA Compliance Report"""
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else None
    end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else None
    
    report = await reports_service.get_sla_compliance_report(
        tenant_id=current_user.tenant_id,
        start_date=start,
        end_date=end,
        project_id=project_id,
        priority=priority,
        assignee_id=assignee_id
    )
    return report


@reports_router.get("/recurring-tasks")
async def get_recurring_tasks_report(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None)
):
    """Get Recurring Tasks Report"""
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else None
    end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else None
    
    report = await reports_service.get_recurring_tasks_report(
        tenant_id=current_user.tenant_id,
        start_date=start,
        end_date=end,
        project_id=project_id
    )
    return report


@reports_router.get("/approval-analytics")
async def get_approval_analytics_report(
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    workflow_id: Optional[str] = Query(None)
):
    """Get Approval Analytics Report (Extended)"""
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else None
    end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else None
    
    report = await reports_service.get_approval_analytics_report(
        tenant_id=current_user.tenant_id,
        start_date=start,
        end_date=end,
        project_id=project_id,
        workflow_id=workflow_id
    )
    return report


# ============================================================================
# EXPORT ENDPOINTS
# ============================================================================

@reports_router.get("/export/{report_type}/csv")
async def export_report_csv(
    report_type: str,
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None)
):
    """Export report as CSV"""
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else None
    end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else None
    
    # Get report data
    report_data = await _get_report_by_type(
        report_type=report_type,
        tenant_id=current_user.tenant_id,
        start_date=start,
        end_date=end,
        project_id=project_id
    )
    
    # Export to CSV
    csv_content = reports_service.export_to_csv(report_type, report_data)
    
    # Create streaming response
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={report_type}_report_{datetime.now().strftime('%Y%m%d')}.csv"
        }
    )


@reports_router.get("/export/{report_type}/pdf")
async def export_report_pdf(
    report_type: str,
    current_user: User = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None),
    company_name: str = Query("Task Manager")
):
    """Export report as PDF"""
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date else None
    end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date else None
    
    # Get report data
    report_data = await _get_report_by_type(
        report_type=report_type,
        tenant_id=current_user.tenant_id,
        start_date=start,
        end_date=end,
        project_id=project_id
    )
    
    # Export to PDF
    pdf_content = reports_service.export_to_pdf(report_type, report_data, company_name)
    
    # Create streaming response
    return StreamingResponse(
        io.BytesIO(pdf_content),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={report_type}_report_{datetime.now().strftime('%Y%m%d')}.pdf"
        }
    )


async def _get_report_by_type(
    report_type: str,
    tenant_id: str,
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    project_id: Optional[str]
):
    """Helper to get report data by type"""
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
        raise HTTPException(status_code=400, detail=f"Unknown report type: {report_type}")


# ============================================================================
# SCHEDULED REPORTS ENDPOINTS
# ============================================================================

@reports_router.get("/schedules")
async def list_report_schedules(
    current_user: User = Depends(get_current_user),
    include_paused: bool = Query(True)
):
    """List all report schedules"""
    schedules = await scheduled_reports_service.list_schedules(
        tenant_id=current_user.tenant_id,
        include_paused=include_paused
    )
    return {"schedules": schedules, "total": len(schedules)}


@reports_router.get("/schedules/{schedule_id}")
async def get_report_schedule(
    schedule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific schedule"""
    schedule = await scheduled_reports_service.get_schedule(
        schedule_id=schedule_id,
        tenant_id=current_user.tenant_id
    )
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return schedule


@reports_router.post("/schedules")
async def create_report_schedule(
    request: CreateScheduleRequest,
    current_user: User = Depends(get_current_user)
):
    """Create a new report schedule (Admin only)"""
    # Validate report type
    valid_types = ["task_performance", "time_tracking", "sla_compliance", "recurring_tasks", "approval_analytics"]
    if request.report_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid report type. Must be one of: {valid_types}")
    
    # Validate frequency
    if request.frequency not in ["daily", "weekly", "monthly"]:
        raise HTTPException(status_code=400, detail="Invalid frequency. Must be daily, weekly, or monthly")
    
    # Validate export format
    if request.export_format not in ["csv", "pdf"]:
        raise HTTPException(status_code=400, detail="Invalid export format. Must be csv or pdf")
    
    # Validate recipients
    if not request.recipients:
        raise HTTPException(status_code=400, detail="At least one recipient is required")
    
    schedule = await scheduled_reports_service.create_schedule(
        tenant_id=current_user.tenant_id,
        created_by=current_user.id,
        name=request.name,
        report_type=request.report_type,
        frequency=request.frequency,
        export_format=request.export_format,
        recipients=request.recipients,
        filters=request.filters,
        day_of_week=request.day_of_week,
        day_of_month=request.day_of_month,
        time_of_day=request.time_of_day,
        timezone_str=request.timezone
    )
    
    return schedule


@reports_router.put("/schedules/{schedule_id}")
async def update_report_schedule(
    schedule_id: str,
    request: UpdateScheduleRequest,
    current_user: User = Depends(get_current_user)
):
    """Update a report schedule"""
    updates = {k: v for k, v in request.model_dump().items() if v is not None}
    
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    schedule = await scheduled_reports_service.update_schedule(
        schedule_id=schedule_id,
        tenant_id=current_user.tenant_id,
        updates=updates
    )
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return schedule


@reports_router.delete("/schedules/{schedule_id}")
async def delete_report_schedule(
    schedule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a report schedule"""
    success = await scheduled_reports_service.delete_schedule(
        schedule_id=schedule_id,
        tenant_id=current_user.tenant_id
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return {"message": "Schedule deleted successfully"}


@reports_router.post("/schedules/{schedule_id}/pause")
async def pause_report_schedule(
    schedule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Pause a report schedule"""
    schedule = await scheduled_reports_service.pause_schedule(
        schedule_id=schedule_id,
        tenant_id=current_user.tenant_id
    )
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return schedule


@reports_router.post("/schedules/{schedule_id}/resume")
async def resume_report_schedule(
    schedule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Resume a paused report schedule"""
    schedule = await scheduled_reports_service.resume_schedule(
        schedule_id=schedule_id,
        tenant_id=current_user.tenant_id
    )
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    return schedule


@reports_router.get("/schedules/{schedule_id}/logs")
async def get_schedule_delivery_logs(
    schedule_id: str,
    current_user: User = Depends(get_current_user),
    limit: int = Query(50, le=100)
):
    """Get delivery logs for a schedule"""
    logs = await scheduled_reports_service.get_delivery_logs(
        schedule_id=schedule_id,
        tenant_id=current_user.tenant_id,
        limit=limit
    )
    return {"logs": logs, "total": len(logs)}


@reports_router.post("/schedules/{schedule_id}/run-now")
async def run_schedule_now(
    schedule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Manually trigger a scheduled report"""
    schedule = await scheduled_reports_service.get_schedule(
        schedule_id=schedule_id,
        tenant_id=current_user.tenant_id
    )
    
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    
    result = await scheduled_reports_service.execute_schedule(
        schedule=schedule,
        reports_service=reports_service,
        sendgrid_api_key=sendgrid_key
    )
    
    return result


@reports_router.post("/schedules/process")
async def process_due_schedules(
    current_user: User = Depends(get_current_user)
):
    """Process all due scheduled reports (should be called by scheduler)"""
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    
    results = await scheduled_reports_service.process_due_schedules(
        reports_service=reports_service,
        sendgrid_api_key=sendgrid_key
    )
    
    return results


# ============================================================================
# REPORT METADATA
# ============================================================================

@reports_router.get("/types")
async def get_report_types(
    current_user: User = Depends(get_current_user)
):
    """Get available report types"""
    return {
        "report_types": [
            {
                "id": "task_performance",
                "name": "Task Performance",
                "description": "Tasks created vs completed, cycle time, breakdowns by project/assignee/status/priority"
            },
            {
                "id": "time_tracking",
                "name": "Time Tracking",
                "description": "Total time logged, time by project/task/user, daily trends"
            },
            {
                "id": "sla_compliance",
                "name": "SLA Compliance",
                "description": "SLA met vs breached, compliance rates by project/priority/assignee"
            },
            {
                "id": "recurring_tasks",
                "name": "Recurring Tasks",
                "description": "Generated tasks, active/paused rules, success rates"
            },
            {
                "id": "approval_analytics",
                "name": "Approval Analytics",
                "description": "Approval volume, turnaround times, approval rates by workflow/approver"
            }
        ]
    }
