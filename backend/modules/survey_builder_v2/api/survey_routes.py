"""
Survey Builder V2 API Routes
Complete API with all features
"""
from fastapi import APIRouter, Depends, HTTPException, Request, File, UploadFile
from typing import Dict, Any, List, Optional

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
from server import User, db
from shared.auth import get_current_user
from shared.services.license_enforcement import require_module_license, ModuleKey

from ..services.survey_service import SurveyService
from ..services.ai_service import SurveyAIService
from ..services.analytics_service import AnalyticsService
from ..services.distribution_service import DistributionService
from ..services.s3_service import S3Service

router = APIRouter()


# ============= SURVEY CRUD =============

@router.post("/surveys")
@require_module_license(ModuleKey.SURVEY_BUILDER)
async def create_survey(
    survey_data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Create new survey"""
    try:
        survey = await SurveyService.create_survey(
            survey_data,
            current_user.tenant_id,
            current_user.id
        )
        return survey
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/surveys")
@require_module_license(ModuleKey.SURVEY_BUILDER)
async def list_surveys(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List all surveys with filters"""
    try:
        return await SurveyService.list_surveys(
            current_user.tenant_id, 
            page, 
            limit,
            status,
            search
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/surveys/{survey_id}")
async def get_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get survey by ID"""
    survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@router.put("/surveys/{survey_id}")
async def update_survey(
    survey_id: str,
    updates: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Update survey"""
    try:
        from datetime import datetime, timezone
        
        # Check if updating close_date - auto-determine status
        if "distribution.close_date" in updates or "distribution" in updates:
            survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
            if survey:
                # Get the new close_date
                new_close_date = None
                if "distribution.close_date" in updates:
                    new_close_date = updates["distribution.close_date"]
                elif "distribution" in updates and isinstance(updates["distribution"], dict):
                    new_close_date = updates["distribution"].get("close_date")
                
                if new_close_date:
                    try:
                        close_datetime = datetime.fromisoformat(new_close_date.replace('Z', '+00:00'))
                        now = datetime.now(timezone.utc)
                        
                        # If date is in the past, expire it
                        if close_datetime <= now:
                            updates["status"] = "closed"
                            if "distribution.is_expired" not in updates:
                                updates["distribution.is_expired"] = True
                        else:
                            # Future date - make it active
                            updates["status"] = "active"
                            if "distribution.is_expired" not in updates:
                                updates["distribution.is_expired"] = False
                    except:
                        pass
        
        success = await SurveyService.update_survey(survey_id, updates, current_user.tenant_id)
        if not success:
            raise HTTPException(status_code=404, detail="Survey not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/surveys/{survey_id}")
async def delete_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete survey"""
    success = await SurveyService.delete_survey(survey_id, current_user.tenant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Survey not found")
    return {"success": True}


@router.post("/surveys/{survey_id}/duplicate")
async def duplicate_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Duplicate an existing survey"""
    try:
        survey = await SurveyService.duplicate_survey(survey_id, current_user.tenant_id, current_user.id)
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        return survey
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= PUBLISHING & STATUS =============

@router.post("/surveys/{survey_id}/publish")
async def publish_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Publish survey (activate)"""
    try:
        success = await SurveyService.update_survey(
            survey_id,
            {"status": "active"},
            current_user.tenant_id
        )
        if not success:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
        return {
            "success": True,
            "public_url": f"/survey-public/{survey['distribution']['public_link']}",
            "survey": survey
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/pause")
async def pause_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Pause survey"""
    try:
        success = await SurveyService.update_survey(
            survey_id,
            {"status": "paused"},
            current_user.tenant_id
        )
        if not success:
            raise HTTPException(status_code=404, detail="Survey not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/close")
async def close_survey(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Close survey"""
    try:
        success = await SurveyService.update_survey(
            survey_id,
            {"status": "closed"},
            current_user.tenant_id
        )
        if not success:
            raise HTTPException(status_code=404, detail="Survey not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/surveys/{survey_id}/toggle-expiry")
async def toggle_survey_expiry(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle survey expiry status manually"""
    try:
        survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        current_expired = survey.get("distribution", {}).get("is_expired", False)
        new_expired = not current_expired
        
        # Update both expiry flag and status
        update_data = {
            "distribution.is_expired": new_expired,
            "status": "closed" if new_expired else "active"
        }
        
        success = await SurveyService.update_survey(
            survey_id,
            update_data,
            current_user.tenant_id
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        return {
            "success": True,
            "is_expired": new_expired,
            "status": "closed" if new_expired else "active"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= AI FEATURES =============

@router.post("/ai/command")
async def ai_command(
    command_data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Process AI natural language command"""
    try:
        command = command_data.get("command")
        survey_id = command_data.get("survey_id")
        
        survey_data = None
        if survey_id:
            survey_data = await SurveyService.get_survey(survey_id, current_user.tenant_id)
        
        result = await SurveyAIService.process_command(command, survey_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/generate-survey")
async def ai_generate_survey(
    prompt_data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Generate complete survey with AI"""
    try:
        prompt = prompt_data.get("prompt")
        result = await SurveyAIService.generate_survey(prompt)
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        # Create the survey
        survey_data = result.get("data", {})
        survey_data["ai_generated"] = True
        survey_data["ai_prompt"] = prompt
        
        survey = await SurveyService.create_survey(
            survey_data,
            current_user.tenant_id,
            current_user.id
        )
        
        return survey
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/ai/analyze")
async def ai_analyze_responses(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """AI analysis of survey responses"""
    try:
        survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        responses = await SurveyService.get_responses(survey_id, current_user.tenant_id)
        if not responses:
            return {"error": "No responses to analyze"}
        
        analysis = await SurveyAIService.analyze_responses(responses, survey)
        
        # Save insights
        await SurveyService.update_survey(
            survey_id,
            {"ai_insights": analysis},
            current_user.tenant_id
        )
        
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/ai/suggest-logic")
async def ai_suggest_logic(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """AI suggests conditional logic rules"""
    try:
        survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        suggestions = await SurveyAIService.suggest_logic_rules(survey)
        return suggestions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/ai/pdf-report")
async def ai_generate_pdf_report(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Generate AI-powered PDF report summary"""
    try:
        survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        responses = await SurveyService.get_responses(survey_id, current_user.tenant_id)
        analytics = await AnalyticsService.get_survey_analytics(survey_id, current_user.tenant_id)
        
        report = await SurveyAIService.generate_pdf_report(survey, responses, analytics)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= RESPONSES =============

@router.post("/surveys/{survey_id}/responses")
async def submit_response(
    survey_id: str,
    response_data: Dict[str, Any],
    request: Request
):
    """Submit survey response (public endpoint)"""
    try:
        # Get survey to find tenant_id
        survey = await db.surveys_v2.find_one({"id": survey_id}, {"_id": 0})
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        # Check if survey is active
        if survey["status"] != "active":
            raise HTTPException(status_code=400, detail="Survey is not active")
        
        # Check response limit
        if survey["distribution"].get("max_responses"):
            if survey["total_responses"] >= survey["distribution"]["max_responses"]:
                raise HTTPException(status_code=400, detail="Survey has reached maximum responses")
        
        # Add metadata
        response_data["survey_id"] = survey_id
        response_data["tenant_id"] = survey["tenant_id"]
        response_data["ip_address"] = request.client.host
        response_data["user_agent"] = request.headers.get("user-agent")
        
        response = await SurveyService.submit_response(response_data)
        return response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/surveys/{survey_id}/responses")
async def get_responses(
    survey_id: str,
    completed: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get survey responses with filters"""
    try:
        filters = {}
        if completed is not None:
            filters["completed"] = completed
        if date_from:
            filters["date_from"] = date_from
        if date_to:
            filters["date_to"] = date_to
        
        responses = await SurveyService.get_responses(survey_id, current_user.tenant_id, filters)
        return {"responses": responses, "total": len(responses)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/surveys/{survey_id}/responses/{response_id}")
async def get_single_response(
    survey_id: str,
    response_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get individual response"""
    try:
        response = await SurveyService.get_response_by_id(response_id, current_user.tenant_id)
        if not response:
            raise HTTPException(status_code=404, detail="Response not found")
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/surveys/{survey_id}/responses/{response_id}")
async def delete_response(
    survey_id: str,
    response_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a response"""
    try:
        success = await SurveyService.delete_response(response_id, survey_id, current_user.tenant_id)
        if not success:
            raise HTTPException(status_code=404, detail="Response not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= ANALYTICS =============

@router.get("/surveys/{survey_id}/analytics")
async def get_analytics(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive survey analytics"""
    try:
        analytics = await AnalyticsService.get_survey_analytics(survey_id, current_user.tenant_id)
        return analytics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/surveys/{survey_id}/drop-off-analysis")
async def get_drop_off_analysis(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get drop-off analysis by page"""
    try:
        analysis = await AnalyticsService.get_drop_off_analysis(survey_id, current_user.tenant_id)
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= EXPORT =============

@router.get("/surveys/{survey_id}/export/csv")
async def export_csv(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Export responses to CSV"""
    try:
        from fastapi.responses import Response
        
        csv_data = await AnalyticsService.export_to_csv(survey_id, current_user.tenant_id)
        
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=survey_{survey_id}_responses.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= DISTRIBUTION =============

@router.post("/surveys/{survey_id}/qr-code")
async def generate_qr_code(
    survey_id: str,
    current_user: User = Depends(get_current_user)
):
    """Generate QR code for survey"""
    try:
        survey = await SurveyService.get_survey(survey_id, current_user.tenant_id)
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        
        public_link = survey["distribution"]["public_link"]
        qr_code = await DistributionService.generate_qr_code(public_link)
        
        # Save QR code URL
        await SurveyService.update_survey(
            survey_id,
            {"distribution.qr_code_url": qr_code},
            current_user.tenant_id
        )
        
        return {"qr_code": qr_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/send-email")
async def send_email_invitations(
    survey_id: str,
    email_data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Send survey via email"""
    try:
        recipients = email_data.get("recipients", [])
        message = email_data.get("message")
        
        result = await DistributionService.send_email_invitation(
            survey_id,
            current_user.tenant_id,
            recipients,
            message
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/send-sms")
async def send_sms_invitations(
    survey_id: str,
    sms_data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Send survey via SMS"""
    try:
        phone_numbers = sms_data.get("phone_numbers", [])
        message = sms_data.get("message")
        
        result = await DistributionService.send_sms_invitation(
            survey_id,
            current_user.tenant_id,
            phone_numbers,
            message
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/surveys/{survey_id}/send-whatsapp")
async def send_whatsapp_invitations(
    survey_id: str,
    whatsapp_data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """Generate WhatsApp invitation links"""
    try:
        phone_numbers = whatsapp_data.get("phone_numbers", [])
        message = whatsapp_data.get("message")
        
        result = await DistributionService.send_whatsapp_invitation(
            survey_id,
            current_user.tenant_id,
            phone_numbers,
            message
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/surveys/{survey_id}/embed-code")
async def get_embed_code(
    survey_id: str,
    width: str = "100%",
    height: str = "600px",
    current_user: User = Depends(get_current_user)
):
    """Get embed code for survey"""
    try:
        result = await DistributionService.generate_embed_code(
            survey_id,
            current_user.tenant_id,
            width,
            height
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============= PUBLIC ENDPOINTS (No Auth) =============

async def check_expiry_status(survey: dict) -> bool:
    """
    Check if survey is expired.
    Returns True if expired, False if active.
    
    Logic:
    1. If is_expired = true → EXPIRED
    2. Else if close_date exists and is in the past → EXPIRED
    3. Else → ACTIVE
    """
    from datetime import datetime, timezone
    
    distribution = survey.get("distribution", {})
    
    # Check 1: Manual expiry flag (highest priority)
    if distribution.get("is_expired") is True:
        return True
    
    # Check 2: Date expiry
    close_date = distribution.get("close_date")
    if close_date:
        try:
            # Parse the close date
            close_datetime = datetime.fromisoformat(close_date.replace('Z', '+00:00'))
            current_time = datetime.now(timezone.utc)
            
            # If close date is in the past, survey is expired
            if current_time > close_datetime:
                return True
        except (ValueError, AttributeError):
            # Invalid date format - ignore it
            pass
    
    # Not expired
    return False

@router.get("/surveys/{survey_id}/public")
async def get_public_survey(survey_id: str):
    """Get survey for public view (no auth required)"""
    
    survey = await db.surveys_v2.find_one(
        {"id": survey_id},
        {"_id": 0}
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    # Check if survey is expired
    is_expired = await check_expiry_status(survey)
    
    if is_expired:
        raise HTTPException(status_code=410, detail="This survey has expired")
    
    return survey

@router.get("/public/surveys/{public_link}")
async def get_public_survey_by_link(public_link: str):
    """Get survey by public link (no auth required)"""
    
    survey = await db.surveys_v2.find_one(
        {"distribution.public_link": public_link},
        {"_id": 0}
    )
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    # Check if survey is expired
    is_expired = await check_expiry_status(survey)
    
    if is_expired:
        raise HTTPException(status_code=410, detail="This survey has expired")
    
    return survey



# ============= FILE UPLOAD =============

@router.post("/upload-file")
async def upload_file(file: UploadFile = File(...)):
    """
    Upload file to S3 (public endpoint for survey responses)
    Returns file URL to be saved in the response
    """
    try:
        # Validate file size (max 10MB)
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size exceeds 10MB limit")
        
        # Upload to S3
        s3_service = S3Service()
        result = await s3_service.upload_file(
            file_content=content,
            filename=file.filename,
            content_type=file.content_type
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Upload failed"))
        
        return {
            "success": True,
            "file_url": result["file_url"],
            "filename": result["filename"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

