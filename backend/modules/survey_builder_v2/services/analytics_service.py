"""
Analytics Service
Provides analytics, insights, and export functionality
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))
from server import db

from typing import List, Dict, Any
from collections import Counter
import csv
import io


class AnalyticsService:
    
    @staticmethod
    async def get_survey_analytics(survey_id: str, tenant_id: str) -> Dict[str, Any]:
        """Get comprehensive analytics for a survey"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        if not survey:
            return {"error": "Survey not found"}
        
        responses = await db.survey_responses_v2.find(
            {"survey_id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(length=None)
        
        total_responses = len(responses)
        completed_responses = sum(1 for r in responses if r.get("completed"))
        completion_rate = (completed_responses / total_responses * 100) if total_responses > 0 else 0
        
        # Calculate average completion time
        completion_times = [r.get("completion_time_seconds", 0) for r in responses if r.get("completion_time_seconds")]
        avg_time = sum(completion_times) / len(completion_times) if completion_times else 0
        
        # Calculate drop-off rate by page
        page_drop_off = {}
        for r in responses:
            last_page = r.get("last_page_reached", 1)
            page_drop_off[last_page] = page_drop_off.get(last_page, 0) + 1
        
        # Question-level analytics
        question_analytics = []
        for question in survey.get("questions", []):
            q_id = question["id"]
            q_type = question["type"]
            
            # Collect answers for this question
            answers = [r["answers"].get(q_id) for r in responses if q_id in r["answers"]]
            answer_count = len(answers)
            response_rate = (answer_count / total_responses * 100) if total_responses > 0 else 0
            
            analytics = {
                "question_id": q_id,
                "question_label": question["label"],
                "question_type": q_type,
                "response_count": answer_count,
                "response_rate": round(response_rate, 2),
                "skip_count": total_responses - answer_count
            }
            
            # Type-specific analytics
            if q_type in ["multiple_choice", "checkbox", "dropdown"]:
                answer_distribution = Counter()
                for ans in answers:
                    if isinstance(ans, list):
                        answer_distribution.update(ans)
                    else:
                        answer_distribution[ans] += 1
                analytics["distribution"] = dict(answer_distribution)
            
            elif q_type in ["rating", "nps"]:
                numeric_answers = [float(a) for a in answers if a is not None]
                if numeric_answers:
                    analytics["average"] = round(sum(numeric_answers) / len(numeric_answers), 2)
                    analytics["min"] = min(numeric_answers)
                    analytics["max"] = max(numeric_answers)
                    analytics["distribution"] = dict(Counter(numeric_answers))
            
            elif q_type == "likert":
                analytics["distribution"] = dict(Counter(answers))
            
            elif q_type == "yes_no":
                yes_count = sum(1 for a in answers if a == "Yes" or a == True)
                no_count = sum(1 for a in answers if a == "No" or a == False)
                analytics["distribution"] = {"Yes": yes_count, "No": no_count}
            
            question_analytics.append(analytics)
        
        # Sentiment analysis
        sentiments = [r.get("ai_sentiment") for r in responses if r.get("ai_sentiment")]
        sentiment_distribution = dict(Counter(sentiments))
        
        return {
            "survey_id": survey_id,
            "survey_title": survey["title"],
            "total_responses": total_responses,
            "completed_responses": completed_responses,
            "completion_rate": round(completion_rate, 2),
            "average_time_seconds": round(avg_time),
            "page_drop_off": page_drop_off,
            "question_analytics": question_analytics,
            "sentiment_distribution": sentiment_distribution,
            "status": survey["status"]
        }
    
    @staticmethod
    async def export_to_csv(survey_id: str, tenant_id: str) -> str:
        """Export responses to CSV format"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        responses = await db.survey_responses_v2.find(
            {"survey_id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(length=None)
        
        if not responses:
            return "No responses to export"
        
        # Build CSV
        output = io.StringIO()
        
        # Header row
        headers = ["Response ID", "Submitted At", "Completed", "Completion Time (s)"]
        for q in survey.get("questions", []):
            if q["type"] != "page_break":
                headers.append(q["label"])
        
        writer = csv.writer(output)
        writer.writerow(headers)
        
        # Data rows
        for response in responses:
            row = [
                response["id"],
                response.get("started_at", ""),
                "Yes" if response.get("completed") else "No",
                response.get("completion_time_seconds", "")
            ]
            
            for q in survey.get("questions", []):
                if q["type"] != "page_break":
                    answer = response["answers"].get(q["id"], "")
                    if isinstance(answer, list):
                        answer = ", ".join(str(a) for a in answer)
                    row.append(str(answer))
            
            writer.writerow(row)
        
        return output.getvalue()
    
    @staticmethod
    async def get_drop_off_analysis(survey_id: str, tenant_id: str) -> Dict[str, Any]:
        """Analyze where users drop off in the survey"""
        
        survey = await db.surveys_v2.find_one(
            {"id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        )
        
        responses = await db.survey_responses_v2.find(
            {"survey_id": survey_id, "tenant_id": tenant_id},
            {"_id": 0}
        ).to_list(length=None)
        
        total_pages = survey.get("total_pages", 1)
        
        page_stats = {}
        for page in range(1, total_pages + 1):
            reached = sum(1 for r in responses if r.get("last_page_reached", 1) >= page)
            completed_page = sum(1 for r in responses if r.get("last_page_reached", 1) > page or (r.get("last_page_reached") == page and r.get("completed")))
            
            drop_off = reached - completed_page
            drop_off_rate = (drop_off / reached * 100) if reached > 0 else 0
            
            page_stats[f"page_{page}"] = {
                "reached": reached,
                "completed": completed_page,
                "dropped_off": drop_off,
                "drop_off_rate": round(drop_off_rate, 2)
            }
        
        return {
            "survey_id": survey_id,
            "total_responses": len(responses),
            "total_pages": total_pages,
            "page_statistics": page_stats
        }
