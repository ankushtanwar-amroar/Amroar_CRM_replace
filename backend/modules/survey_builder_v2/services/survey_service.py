"""
Survey Service
Core survey operations - CRUD, publishing, responses
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
from server import db

import secrets
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional


class SurveyService:
    
    @staticmethod
    async def create_survey(survey_data: Dict[str, Any], tenant_id: str, user_id: str) -> Dict[str, Any]:
        """Create new survey"""
        
        survey_id = f"survey_{secrets.token_hex(8)}"
        public_link = f"survey-{secrets.token_hex(6)}"
        
        # Generate embed code
        embed_code = f'<iframe src="{{FRONTEND_URL}}/survey-public/{public_link}" width="100%" height="600" frameborder="0"></iframe>'
        
        survey = {
            "id": survey_id,
            "tenant_id": tenant_id,
            "created_by": user_id,
            "title": survey_data.get("title", "Untitled Survey"),
            "description": survey_data.get("description"),
            "status": "draft",
            "questions": survey_data.get("questions", []),
            "branding": survey_data.get("branding", {
                "primary_color": "#667eea",
                "secondary_color": "#764ba2",
                "background_color": "#ffffff",
                "text_color": "#1a202c",
                "button_color": "#667eea"
            }),
            "distribution": {
                "public_link": public_link,
                "allow_anonymous": survey_data.get("distribution", {}).get("allow_anonymous", True),
                "require_crm_contact": survey_data.get("distribution", {}).get("require_crm_contact", False),
                "max_responses": survey_data.get("distribution", {}).get("max_responses"),
                "close_date": survey_data.get("distribution", {}).get("close_date"),
                "embed_code": embed_code
            },
            "notifications": survey_data.get("notifications", {
                "email_alerts": False,
                "email_recipients": [],
                "low_score_alert": False,
                "low_score_threshold": 5,
                "daily_digest": False,
                "weekly_digest": False
            }),
            "crm_integration": survey_data.get("crm_integration", {
                "enabled": False,
                "link_to_contacts": False,
                "create_tasks_on_negative": False,
                "negative_threshold": 5,
                "trigger_workflows": False,
                "workflow_ids": [],
                "auto_tag": False,
                "tag_rules": {}
            }),
            "pro_features": survey_data.get("pro_features", {
                "expiry_date": None,
                "response_quota": None,
                "team_collaboration": False,
                "team_members": [],
                "version_history": False,
                "ab_testing": False,
                "ab_variants": []
            }),
            "total_pages": survey_data.get("total_pages", 1),
            "total_responses": 0,
            "completed_responses": 0,
            "completion_rate": 0.0,
            "drop_off_rate": 0.0,
            "average_time_seconds": 0,
            "ai_generated": survey_data.get("ai_generated", False),
            "ai_prompt": survey_data.get("ai_prompt"),
            "ai_insights": survey_data.get("ai_insights"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.surveys_v2.insert_one(survey)
        survey.pop('_id', None)
        
        return survey
    
    @staticmethod
    async def get_survey(survey_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get survey by ID"""
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        return survey
    
    @staticmethod
    async def update_survey(survey_id: str, updates: Dict[str, Any], tenant_id: str) -> bool:
        """Update survey"""
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        result = await db.surveys_v2.update_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"$set": updates}
        )
        
        return result.modified_count > 0
    
    @staticmethod
    async def delete_survey(survey_id: str, tenant_id: str) -> bool:
        """Delete survey and all responses"""
        # Delete responses first
        await db.survey_responses_v2.delete_many({"survey_id": survey_id, "tenant_id": tenant_id})
        
        # Delete survey
        result = await db.surveys_v2.delete_one(
            {"id": survey_id, "tenant_id": tenant_id}
        )
        return result.deleted_count > 0
    
    @staticmethod
    async def duplicate_survey(survey_id: str, tenant_id: str, user_id: str) -> Dict[str, Any]:
        """Duplicate an existing survey"""
        original = await SurveyService.get_survey(survey_id, tenant_id)
        if not original:
            return None
        
        # Create copy with new IDs
        original["title"] = f"{original['title']} (Copy)"
        original["status"] = "draft"
        original["total_responses"] = 0
        original["completed_responses"] = 0
        original["completion_rate"] = 0.0
        
        return await SurveyService.create_survey(original, tenant_id, user_id)
    
    @staticmethod
    async def list_surveys(tenant_id: str, page: int = 1, limit: int = 20, status: str = None, search: str = None) -> Dict[str, Any]:
        """List all surveys with filters"""
        skip = (page - 1) * limit
        
        query = {"tenant_id": tenant_id}
        
        # Add status filter
        if status:
            query["status"] = status
        
        # Add search filter
        if search:
            query["$or"] = [
                {"title": {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}}
            ]
        
        surveys = await db.surveys_v2.find(
            query,
            {"_id": 0}
        ).sort("updated_at", -1).skip(skip).limit(limit).to_list(length=limit)
        
        total = await db.surveys_v2.count_documents(query)
        
        return {
            "surveys": surveys,
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit
        }
    
    @staticmethod
    async def submit_response(response_data: Dict[str, Any]) -> Dict[str, Any]:
        """Submit survey response"""
        
        response_id = f"response_{secrets.token_hex(8)}"
        
        response = {
            "id": response_id,
            "survey_id": response_data["survey_id"],
            "tenant_id": response_data["tenant_id"],
            "answers": response_data.get("answers", {}),
            "respondent_email": response_data.get("respondent_email"),
            "respondent_name": response_data.get("respondent_name"),
            "crm_contact_id": response_data.get("crm_contact_id"),
            "completed": response_data.get("completed", True),
            "completion_time_seconds": response_data.get("completion_time_seconds"),
            "started_at": response_data.get("started_at", datetime.now(timezone.utc).isoformat()),
            "completed_at": datetime.now(timezone.utc).isoformat() if response_data.get("completed") else None,
            "last_page_reached": response_data.get("last_page_reached", 1),
            "ai_sentiment": response_data.get("ai_sentiment"),
            "ai_tags": response_data.get("ai_tags", []),
            "ip_address": response_data.get("ip_address"),
            "user_agent": response_data.get("user_agent"),
            "referrer": response_data.get("referrer")
        }
        
        await db.survey_responses_v2.insert_one(response)
        
        # Update survey stats
        await db.surveys_v2.update_one(
            {"id": response_data["survey_id"]},
            {
                "$inc": {
                    "total_responses": 1,
                    "completed_responses": 1 if response_data.get("completed") else 0
                }
            }
        )
        
        # Recalculate completion rate
        survey = await db.surveys_v2.find_one({"id": response_data["survey_id"]}, {"_id": 0})
        if survey and survey["total_responses"] > 0:
            completion_rate = (survey["completed_responses"] / survey["total_responses"]) * 100
            await db.surveys_v2.update_one(
                {"id": response_data["survey_id"]},
                {"$set": {"completion_rate": round(completion_rate, 2)}}
            )
        
        response.pop('_id', None)
        return response
    
    @staticmethod
    async def get_responses(survey_id: str, tenant_id: str, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Get all responses for a survey with optional filters"""
        query = {"survey_id": survey_id, "tenant_id": tenant_id}
        
        if filters:
            if filters.get("completed") is not None:
                query["completed"] = filters["completed"]
            if filters.get("date_from"):
                query["started_at"] = {"$gte": filters["date_from"]}
            if filters.get("date_to"):
                if "started_at" in query:
                    query["started_at"]["$lte"] = filters["date_to"]
                else:
                    query["started_at"] = {"$lte": filters["date_to"]}
        
        responses = await db.survey_responses_v2.find(
            query,
            {"_id": 0}
        ).to_list(length=None)
        
        return responses
    
    @staticmethod
    async def get_response_by_id(response_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
        """Get single response by ID"""
        response = await db.survey_responses_v2.find_one(
            {"id": response_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        return response
    
    @staticmethod
    async def delete_response(response_id: str, survey_id: str, tenant_id: str) -> bool:
        """Delete a response"""
        result = await db.survey_responses_v2.delete_one(
            {"id": response_id, "tenant_id": tenant_id}
        )
        
        if result.deleted_count > 0:
            # Update survey stats
            await db.surveys_v2.update_one(
                {"id": survey_id},
                {"$inc": {"total_responses": -1}}
            )
        
        return result.deleted_count > 0
