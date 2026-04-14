"""
CLU-BOT Analytics MCP Service
Handles analytics queries: reports, comparisons, and CRM insights.
Implements read-only analytics via deterministic execution.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase
from dateutil.relativedelta import relativedelta

from ..models import (
    ActionType, ExecutionStatus,
    GenerateReportPayload, CompareMetricsPayload, FindInsightsPayload,
    CreateDashboardPayload, TrendAnalysisPayload, PipelineForecastPayload
)

logger = logging.getLogger(__name__)


class AnalyticsMCPService:
    """
    Analytics MCP - Provides analytics and insights from CRM data.
    All operations are read-only and respect user permissions.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    # =========================================================================
    # Report Generation
    # =========================================================================
    
    async def generate_report(
        self,
        tenant_id: str,
        user_id: str,
        payload: GenerateReportPayload
    ) -> Dict[str, Any]:
        """
        Generate an analytics report.
        
        Supported report types:
        - revenue: Total revenue by period
        - pipeline: Pipeline value and stages
        - leads: Lead metrics (count, sources, conversion)
        - opportunities: Opportunity metrics
        - activities: Activity counts
        - conversion: Conversion rates
        
        Returns:
            {
                "success": bool,
                "report": {...},
                "summary": str,
                "data": [...]
            }
        """
        try:
            report_type = payload.report_type.lower()
            
            # Calculate date range
            start_date, end_date = self._get_date_range(
                payload.period,
                payload.start_date,
                payload.end_date
            )
            
            # Generate report based on type
            if report_type == "revenue":
                return await self._generate_revenue_report(
                    tenant_id, start_date, end_date, payload.group_by
                )
            elif report_type == "pipeline":
                return await self._generate_pipeline_report(
                    tenant_id, start_date, end_date, payload.group_by
                )
            elif report_type == "leads":
                return await self._generate_leads_report(
                    tenant_id, start_date, end_date, payload.group_by
                )
            elif report_type == "opportunities":
                return await self._generate_opportunities_report(
                    tenant_id, start_date, end_date, payload.group_by
                )
            elif report_type == "activities":
                return await self._generate_activities_report(
                    tenant_id, start_date, end_date, payload.group_by
                )
            elif report_type == "conversion":
                return await self._generate_conversion_report(
                    tenant_id, start_date, end_date
                )
            else:
                return {
                    "success": False,
                    "error": f"Unknown report type: {report_type}",
                    "message": f"Report type '{report_type}' is not supported. Try: revenue, pipeline, leads, opportunities, activities, conversion."
                }
                
        except Exception as e:
            logger.error(f"Generate report error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to generate report: {str(e)}"
            }
    
    async def _generate_revenue_report(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
        group_by: Optional[str]
    ) -> Dict[str, Any]:
        """Generate revenue report from closed won opportunities"""
        
        pipeline = [
            {
                "$match": {
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                }
            },
            {
                "$match": {
                    "$or": [
                        {"data.stage": {"$regex": "closed.*won", "$options": "i"}},
                        {"data.status": {"$regex": "closed.*won", "$options": "i"}},
                        {"data.is_won": True}
                    ]
                }
            }
        ]
        
        # Add grouping
        if group_by == "month":
            pipeline.append({
                "$group": {
                    "_id": {"$substr": ["$created_at", 0, 7]},
                    "total_revenue": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}},
                    "deal_count": {"$sum": 1}
                }
            })
        elif group_by == "owner":
            pipeline.append({
                "$group": {
                    "_id": "$owner_id",
                    "total_revenue": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}},
                    "deal_count": {"$sum": 1}
                }
            })
        else:
            pipeline.append({
                "$group": {
                    "_id": None,
                    "total_revenue": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}},
                    "deal_count": {"$sum": 1},
                    "avg_deal_size": {"$avg": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}
                }
            })
        
        pipeline.append({"$sort": {"total_revenue": -1}})
        
        results = await self.db.object_records.aggregate(pipeline).to_list(100)
        
        # Calculate totals
        total_revenue = sum(r.get("total_revenue", 0) for r in results)
        total_deals = sum(r.get("deal_count", 0) for r in results)
        
        return {
            "success": True,
            "report_type": "revenue",
            "period": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
            "summary": f"Total Revenue: ${total_revenue:,.2f} from {total_deals} closed deals",
            "data": results,
            "totals": {
                "total_revenue": total_revenue,
                "deal_count": total_deals,
                "avg_deal_size": total_revenue / total_deals if total_deals > 0 else 0
            }
        }
    
    async def _generate_pipeline_report(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
        group_by: Optional[str]
    ) -> Dict[str, Any]:
        """Generate pipeline report showing opportunities by stage"""
        
        pipeline = [
            {
                "$match": {
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "is_deleted": {"$ne": True}
                }
            },
            {
                "$group": {
                    "_id": {"$ifNull": ["$data.stage", "Unknown"]},
                    "total_value": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}},
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"total_value": -1}}
        ]
        
        results = await self.db.object_records.aggregate(pipeline).to_list(100)
        
        total_pipeline = sum(r.get("total_value", 0) for r in results)
        total_opps = sum(r.get("count", 0) for r in results)
        
        # Format stages
        stages = []
        for r in results:
            stages.append({
                "stage": r["_id"],
                "value": r["total_value"],
                "count": r["count"],
                "percentage": (r["total_value"] / total_pipeline * 100) if total_pipeline > 0 else 0
            })
        
        return {
            "success": True,
            "report_type": "pipeline",
            "summary": f"Total Pipeline: ${total_pipeline:,.2f} across {total_opps} opportunities",
            "data": stages,
            "totals": {
                "total_pipeline_value": total_pipeline,
                "opportunity_count": total_opps
            }
        }
    
    async def _generate_leads_report(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
        group_by: Optional[str]
    ) -> Dict[str, Any]:
        """Generate leads report"""
        
        # Count leads by status
        pipeline = [
            {
                "$match": {
                    "tenant_id": tenant_id,
                    "object_name": "lead",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                }
            },
            {
                "$group": {
                    "_id": {"$ifNull": ["$data.status", "Unknown"]},
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"count": -1}}
        ]
        
        results = await self.db.object_records.aggregate(pipeline).to_list(100)
        
        total_leads = sum(r.get("count", 0) for r in results)
        
        # By source if requested
        source_data = []
        if group_by == "source":
            source_pipeline = [
                {
                    "$match": {
                        "tenant_id": tenant_id,
                        "object_name": "lead",
                        "is_deleted": {"$ne": True},
                        "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                    }
                },
                {
                    "$group": {
                        "_id": {"$ifNull": ["$data.lead_source", "Unknown"]},
                        "count": {"$sum": 1}
                    }
                },
                {"$sort": {"count": -1}}
            ]
            source_data = await self.db.object_records.aggregate(source_pipeline).to_list(100)
        
        return {
            "success": True,
            "report_type": "leads",
            "period": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
            "summary": f"Total Leads: {total_leads} in this period",
            "data": {
                "by_status": results,
                "by_source": source_data
            },
            "totals": {
                "total_leads": total_leads
            }
        }
    
    async def _generate_opportunities_report(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
        group_by: Optional[str]
    ) -> Dict[str, Any]:
        """Generate opportunities report"""
        
        pipeline = [
            {
                "$match": {
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_value": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}},
                    "count": {"$sum": 1},
                    "avg_value": {"$avg": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}
                }
            }
        ]
        
        results = await self.db.object_records.aggregate(pipeline).to_list(1)
        totals = results[0] if results else {"total_value": 0, "count": 0, "avg_value": 0}
        
        return {
            "success": True,
            "report_type": "opportunities",
            "period": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
            "summary": f"Created {totals['count']} opportunities worth ${totals['total_value']:,.2f}",
            "data": totals,
            "totals": totals
        }
    
    async def _generate_activities_report(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
        group_by: Optional[str]
    ) -> Dict[str, Any]:
        """Generate activities report (tasks, events, notes)"""
        
        # Count tasks
        tasks_count = await self.db.object_records.count_documents({
            "tenant_id": tenant_id,
            "object_name": "task",
            "is_deleted": {"$ne": True},
            "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        })
        
        # Count events
        events_count = await self.db.object_records.count_documents({
            "tenant_id": tenant_id,
            "object_name": "event",
            "is_deleted": {"$ne": True},
            "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        })
        
        # Count notes
        notes_count = await self.db.notes.count_documents({
            "tenant_id": tenant_id,
            "is_deleted": {"$ne": True},
            "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        })
        
        total_activities = tasks_count + events_count + notes_count
        
        return {
            "success": True,
            "report_type": "activities",
            "period": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
            "summary": f"Total Activities: {total_activities} ({tasks_count} tasks, {events_count} events, {notes_count} notes)",
            "data": {
                "tasks": tasks_count,
                "events": events_count,
                "notes": notes_count
            },
            "totals": {
                "total_activities": total_activities
            }
        }
    
    async def _generate_conversion_report(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """Generate conversion rate report"""
        
        # Count total leads
        total_leads = await self.db.object_records.count_documents({
            "tenant_id": tenant_id,
            "object_name": "lead",
            "is_deleted": {"$ne": True},
            "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        })
        
        # Count converted leads (status contains 'converted' or 'qualified')
        converted_leads = await self.db.object_records.count_documents({
            "tenant_id": tenant_id,
            "object_name": "lead",
            "is_deleted": {"$ne": True},
            "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "$or": [
                {"data.status": {"$regex": "converted", "$options": "i"}},
                {"data.status": {"$regex": "qualified", "$options": "i"}},
                {"data.is_converted": True}
            ]
        })
        
        # Count total opportunities
        total_opps = await self.db.object_records.count_documents({
            "tenant_id": tenant_id,
            "object_name": "opportunity",
            "is_deleted": {"$ne": True},
            "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        })
        
        # Count won opportunities
        won_opps = await self.db.object_records.count_documents({
            "tenant_id": tenant_id,
            "object_name": "opportunity",
            "is_deleted": {"$ne": True},
            "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "$or": [
                {"data.stage": {"$regex": "closed.*won", "$options": "i"}},
                {"data.is_won": True}
            ]
        })
        
        lead_conversion_rate = (converted_leads / total_leads * 100) if total_leads > 0 else 0
        win_rate = (won_opps / total_opps * 100) if total_opps > 0 else 0
        
        return {
            "success": True,
            "report_type": "conversion",
            "period": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
            "summary": f"Lead Conversion: {lead_conversion_rate:.1f}% | Win Rate: {win_rate:.1f}%",
            "data": {
                "lead_conversion": {
                    "total_leads": total_leads,
                    "converted_leads": converted_leads,
                    "conversion_rate": lead_conversion_rate
                },
                "opportunity_win": {
                    "total_opportunities": total_opps,
                    "won_opportunities": won_opps,
                    "win_rate": win_rate
                }
            }
        }
    
    # =========================================================================
    # Metrics Comparison
    # =========================================================================
    
    async def compare_metrics(
        self,
        tenant_id: str,
        user_id: str,
        payload: CompareMetricsPayload
    ) -> Dict[str, Any]:
        """
        Compare metrics between two periods.
        
        Returns:
            {
                "success": bool,
                "metric_type": str,
                "period_1": {...},
                "period_2": {...},
                "change": {...}
            }
        """
        try:
            metric_type = payload.metric_type.lower()
            
            # Get date ranges for both periods
            p1_start, p1_end = self._get_period_dates(payload.period_1)
            p2_start, p2_end = self._get_period_dates(payload.period_2)
            
            # Get metrics for both periods
            p1_value = await self._get_metric_value(tenant_id, metric_type, p1_start, p1_end)
            p2_value = await self._get_metric_value(tenant_id, metric_type, p2_start, p2_end)
            
            # Calculate change
            if p2_value != 0:
                change_pct = ((p1_value - p2_value) / p2_value) * 100
            else:
                change_pct = 100 if p1_value > 0 else 0
            
            change_abs = p1_value - p2_value
            
            # Format summary
            trend = "up" if change_pct > 0 else "down" if change_pct < 0 else "unchanged"
            trend_emoji = "📈" if change_pct > 0 else "📉" if change_pct < 0 else "➡️"
            
            return {
                "success": True,
                "metric_type": metric_type,
                "period_1": {
                    "label": payload.period_1,
                    "start": p1_start.strftime('%Y-%m-%d'),
                    "end": p1_end.strftime('%Y-%m-%d'),
                    "value": p1_value
                },
                "period_2": {
                    "label": payload.period_2,
                    "start": p2_start.strftime('%Y-%m-%d'),
                    "end": p2_end.strftime('%Y-%m-%d'),
                    "value": p2_value
                },
                "change": {
                    "absolute": change_abs,
                    "percentage": change_pct,
                    "trend": trend
                },
                "summary": f"{trend_emoji} {metric_type.replace('_', ' ').title()}: {self._format_metric_value(metric_type, p1_value)} vs {self._format_metric_value(metric_type, p2_value)} ({change_pct:+.1f}%)"
            }
            
        except Exception as e:
            logger.error(f"Compare metrics error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to compare metrics: {str(e)}"
            }
    
    async def _get_metric_value(
        self,
        tenant_id: str,
        metric_type: str,
        start_date: datetime,
        end_date: datetime
    ) -> float:
        """Get a specific metric value for a period"""
        
        if metric_type == "revenue":
            pipeline = [
                {
                    "$match": {
                        "tenant_id": tenant_id,
                        "object_name": "opportunity",
                        "is_deleted": {"$ne": True},
                        "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                        "$or": [
                            {"data.stage": {"$regex": "closed.*won", "$options": "i"}},
                            {"data.is_won": True}
                        ]
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}
                    }
                }
            ]
            result = await self.db.object_records.aggregate(pipeline).to_list(1)
            return result[0]["total"] if result else 0
        
        elif metric_type == "pipeline_value":
            pipeline = [
                {
                    "$match": {
                        "tenant_id": tenant_id,
                        "object_name": "opportunity",
                        "is_deleted": {"$ne": True},
                        "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                    }
                },
                {
                    "$group": {
                        "_id": None,
                        "total": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}
                    }
                }
            ]
            result = await self.db.object_records.aggregate(pipeline).to_list(1)
            return result[0]["total"] if result else 0
        
        elif metric_type == "lead_count":
            return await self.db.object_records.count_documents({
                "tenant_id": tenant_id,
                "object_name": "lead",
                "is_deleted": {"$ne": True},
                "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
            })
        
        elif metric_type == "opportunity_count":
            return await self.db.object_records.count_documents({
                "tenant_id": tenant_id,
                "object_name": "opportunity",
                "is_deleted": {"$ne": True},
                "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
            })
        
        elif metric_type in ["conversion_rate", "win_rate"]:
            if metric_type == "conversion_rate":
                total = await self.db.object_records.count_documents({
                    "tenant_id": tenant_id,
                    "object_name": "lead",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                })
                converted = await self.db.object_records.count_documents({
                    "tenant_id": tenant_id,
                    "object_name": "lead",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                    "$or": [
                        {"data.status": {"$regex": "converted", "$options": "i"}},
                        {"data.is_converted": True}
                    ]
                })
            else:  # win_rate
                total = await self.db.object_records.count_documents({
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                })
                converted = await self.db.object_records.count_documents({
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                    "$or": [
                        {"data.stage": {"$regex": "closed.*won", "$options": "i"}},
                        {"data.is_won": True}
                    ]
                })
            
            return (converted / total * 100) if total > 0 else 0
        
        return 0
    
    # =========================================================================
    # CRM Insights
    # =========================================================================
    
    async def find_insights(
        self,
        tenant_id: str,
        user_id: str,
        payload: FindInsightsPayload
    ) -> Dict[str, Any]:
        """
        Find CRM insights.
        
        Supported insight types:
        - inactive_leads: Leads with no activity in X days
        - stale_opportunities: Opportunities not updated in X days
        - slipping_deals: Opportunities past close date
        - overdue_tasks: Tasks past due date
        - high_value_leads: Leads from high-value sources
        
        Returns:
            {
                "success": bool,
                "insight_type": str,
                "records": [...],
                "summary": str
            }
        """
        try:
            insight_type = payload.insight_type.lower()
            days = payload.days_threshold
            limit = payload.limit
            
            if insight_type == "inactive_leads":
                return await self._find_inactive_leads(tenant_id, days, limit)
            elif insight_type == "stale_opportunities":
                return await self._find_stale_opportunities(tenant_id, days, limit)
            elif insight_type == "slipping_deals":
                return await self._find_slipping_deals(tenant_id, limit)
            elif insight_type == "overdue_tasks":
                return await self._find_overdue_tasks(tenant_id, limit)
            elif insight_type == "high_value_leads":
                return await self._find_high_value_leads(tenant_id, limit)
            elif insight_type == "top_performers":
                return await self._find_top_performers(tenant_id, days, limit)
            elif insight_type == "at_risk_accounts":
                return await self._find_at_risk_accounts(tenant_id, days, limit)
            else:
                return {
                    "success": False,
                    "error": f"Unknown insight type: {insight_type}",
                    "message": f"Insight type '{insight_type}' is not supported. Try: inactive_leads, stale_opportunities, slipping_deals, overdue_tasks, high_value_leads."
                }
                
        except Exception as e:
            logger.error(f"Find insights error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to find insights: {str(e)}"
            }
    
    async def _find_inactive_leads(
        self,
        tenant_id: str,
        days: int,
        limit: int
    ) -> Dict[str, Any]:
        """Find leads with no activity in X days"""
        
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        # Find leads not updated recently
        cursor = self.db.object_records.find({
            "tenant_id": tenant_id,
            "object_name": "lead",
            "is_deleted": {"$ne": True},
            "updated_at": {"$lt": cutoff_date},
            "data.status": {"$nin": ["Converted", "Disqualified", "Closed"]}
        }, {"_id": 0}).sort("updated_at", 1).limit(limit)
        
        records = await cursor.to_list(length=limit)
        
        # Format records
        formatted = []
        for r in records:
            data = r.get("data", {})
            name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or data.get("name", "Unknown")
            formatted.append({
                "id": r.get("id"),
                "series_id": r.get("series_id"),
                "name": name,
                "email": data.get("email"),
                "status": data.get("status", "Unknown"),
                "last_updated": r.get("updated_at"),
                "days_inactive": (datetime.now(timezone.utc) - datetime.fromisoformat(r.get("updated_at", datetime.now(timezone.utc).isoformat()).replace('Z', '+00:00'))).days
            })
        
        return {
            "success": True,
            "insight_type": "inactive_leads",
            "threshold_days": days,
            "summary": f"Found {len(formatted)} leads with no activity in {days}+ days",
            "records": formatted,
            "count": len(formatted)
        }
    
    async def _find_stale_opportunities(
        self,
        tenant_id: str,
        days: int,
        limit: int
    ) -> Dict[str, Any]:
        """Find opportunities not updated in X days"""
        
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        cursor = self.db.object_records.find({
            "tenant_id": tenant_id,
            "object_name": "opportunity",
            "is_deleted": {"$ne": True},
            "updated_at": {"$lt": cutoff_date},
            "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}
        }, {"_id": 0}).sort("data.amount", -1).limit(limit)
        
        records = await cursor.to_list(length=limit)
        
        formatted = []
        total_value = 0
        for r in records:
            data = r.get("data", {})
            amount = float(data.get("amount", 0) or 0)
            total_value += amount
            formatted.append({
                "id": r.get("id"),
                "series_id": r.get("series_id"),
                "name": data.get("opportunity_name") or data.get("name", "Unknown"),
                "amount": amount,
                "stage": data.get("stage", "Unknown"),
                "last_updated": r.get("updated_at"),
                "days_stale": (datetime.now(timezone.utc) - datetime.fromisoformat(r.get("updated_at", datetime.now(timezone.utc).isoformat()).replace('Z', '+00:00'))).days
            })
        
        return {
            "success": True,
            "insight_type": "stale_opportunities",
            "threshold_days": days,
            "summary": f"Found {len(formatted)} stale opportunities worth ${total_value:,.2f}",
            "records": formatted,
            "count": len(formatted),
            "total_value": total_value
        }
    
    async def _find_slipping_deals(
        self,
        tenant_id: str,
        limit: int
    ) -> Dict[str, Any]:
        """Find opportunities past their close date"""
        
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        cursor = self.db.object_records.find({
            "tenant_id": tenant_id,
            "object_name": "opportunity",
            "is_deleted": {"$ne": True},
            "data.close_date": {"$lt": today},
            "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}
        }, {"_id": 0}).sort("data.amount", -1).limit(limit)
        
        records = await cursor.to_list(length=limit)
        
        formatted = []
        total_value = 0
        for r in records:
            data = r.get("data", {})
            amount = float(data.get("amount", 0) or 0)
            total_value += amount
            formatted.append({
                "id": r.get("id"),
                "series_id": r.get("series_id"),
                "name": data.get("opportunity_name") or data.get("name", "Unknown"),
                "amount": amount,
                "stage": data.get("stage", "Unknown"),
                "close_date": data.get("close_date"),
                "days_overdue": (datetime.now(timezone.utc).date() - datetime.strptime(data.get("close_date", today), '%Y-%m-%d').date()).days if data.get("close_date") else 0
            })
        
        return {
            "success": True,
            "insight_type": "slipping_deals",
            "summary": f"Found {len(formatted)} deals past close date worth ${total_value:,.2f}",
            "records": formatted,
            "count": len(formatted),
            "total_value": total_value
        }
    
    async def _find_overdue_tasks(
        self,
        tenant_id: str,
        limit: int
    ) -> Dict[str, Any]:
        """Find overdue tasks"""
        
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        
        cursor = self.db.object_records.find({
            "tenant_id": tenant_id,
            "object_name": "task",
            "is_deleted": {"$ne": True},
            "data.due_date": {"$lt": today},
            "data.status": {"$nin": ["Completed", "Done", "Closed"]}
        }, {"_id": 0}).sort("data.due_date", 1).limit(limit)
        
        records = await cursor.to_list(length=limit)
        
        formatted = []
        for r in records:
            data = r.get("data", {})
            formatted.append({
                "id": r.get("id"),
                "series_id": r.get("series_id"),
                "subject": data.get("subject", "Unknown"),
                "due_date": data.get("due_date"),
                "priority": data.get("priority", "Normal"),
                "status": data.get("status", "Unknown"),
                "days_overdue": (datetime.now(timezone.utc).date() - datetime.strptime(data.get("due_date", today), '%Y-%m-%d').date()).days if data.get("due_date") else 0
            })
        
        return {
            "success": True,
            "insight_type": "overdue_tasks",
            "summary": f"Found {len(formatted)} overdue tasks",
            "records": formatted,
            "count": len(formatted)
        }
    
    async def _find_high_value_leads(
        self,
        tenant_id: str,
        limit: int
    ) -> Dict[str, Any]:
        """Find leads from high-value sources"""
        
        high_value_sources = ["Referral", "Partner", "Enterprise", "Website - Demo Request", "Inbound"]
        
        cursor = self.db.object_records.find({
            "tenant_id": tenant_id,
            "object_name": "lead",
            "is_deleted": {"$ne": True},
            "data.lead_source": {"$in": high_value_sources},
            "data.status": {"$nin": ["Converted", "Disqualified", "Closed"]}
        }, {"_id": 0}).sort("created_at", -1).limit(limit)
        
        records = await cursor.to_list(length=limit)
        
        formatted = []
        for r in records:
            data = r.get("data", {})
            name = f"{data.get('first_name', '')} {data.get('last_name', '')}".strip() or data.get("name", "Unknown")
            formatted.append({
                "id": r.get("id"),
                "series_id": r.get("series_id"),
                "name": name,
                "email": data.get("email"),
                "company": data.get("company"),
                "lead_source": data.get("lead_source"),
                "status": data.get("status", "Unknown"),
                "created_at": r.get("created_at")
            })
        
        return {
            "success": True,
            "insight_type": "high_value_leads",
            "summary": f"Found {len(formatted)} high-value leads",
            "records": formatted,
            "count": len(formatted)
        }
    
    async def _find_top_performers(
        self,
        tenant_id: str,
        days: int,
        limit: int
    ) -> Dict[str, Any]:
        """Find top performing sales reps"""
        
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        pipeline = [
            {
                "$match": {
                    "tenant_id": tenant_id,
                    "object_name": "opportunity",
                    "is_deleted": {"$ne": True},
                    "created_at": {"$gte": start_date},
                    "$or": [
                        {"data.stage": {"$regex": "closed.*won", "$options": "i"}},
                        {"data.is_won": True}
                    ]
                }
            },
            {
                "$group": {
                    "_id": "$owner_id",
                    "total_revenue": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}},
                    "deal_count": {"$sum": 1}
                }
            },
            {"$sort": {"total_revenue": -1}},
            {"$limit": limit}
        ]
        
        results = await self.db.object_records.aggregate(pipeline).to_list(limit)
        
        # Enrich with user names
        formatted = []
        for r in results:
            user = await self.db.users.find_one({"id": r["_id"]}, {"_id": 0, "name": 1, "email": 1})
            formatted.append({
                "user_id": r["_id"],
                "name": user.get("name", "Unknown") if user else "Unknown",
                "email": user.get("email") if user else None,
                "total_revenue": r["total_revenue"],
                "deal_count": r["deal_count"]
            })
        
        return {
            "success": True,
            "insight_type": "top_performers",
            "period_days": days,
            "summary": f"Top {len(formatted)} performers in the last {days} days",
            "records": formatted,
            "count": len(formatted)
        }
    
    async def _find_at_risk_accounts(
        self,
        tenant_id: str,
        days: int,
        limit: int
    ) -> Dict[str, Any]:
        """Find accounts at risk (no activity in X days)"""
        
        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        cursor = self.db.object_records.find({
            "tenant_id": tenant_id,
            "object_name": "account",
            "is_deleted": {"$ne": True},
            "updated_at": {"$lt": cutoff_date}
        }, {"_id": 0}).sort("updated_at", 1).limit(limit)
        
        records = await cursor.to_list(length=limit)
        
        formatted = []
        for r in records:
            data = r.get("data", {})
            formatted.append({
                "id": r.get("id"),
                "series_id": r.get("series_id"),
                "name": data.get("account_name") or data.get("name", "Unknown"),
                "industry": data.get("industry"),
                "last_updated": r.get("updated_at"),
                "days_inactive": (datetime.now(timezone.utc) - datetime.fromisoformat(r.get("updated_at", datetime.now(timezone.utc).isoformat()).replace('Z', '+00:00'))).days
            })
        
        return {
            "success": True,
            "insight_type": "at_risk_accounts",
            "threshold_days": days,
            "summary": f"Found {len(formatted)} accounts with no activity in {days}+ days",
            "records": formatted,
            "count": len(formatted)
        }
    
    # =========================================================================
    # Phase 3: Dashboard Generation
    # =========================================================================
    
    async def create_dashboard(
        self,
        tenant_id: str,
        user_id: str,
        payload: CreateDashboardPayload,
        conversation_id: str
    ) -> Dict[str, Any]:
        """
        Create an AI-generated dashboard with widgets populated from CRM data.
        Stores the dashboard in clu_bot_dashboards collection.
        """
        import uuid
        try:
            dashboard_type = payload.dashboard_type.lower()
            period = payload.period
            
            # Auto-generate widgets based on dashboard type
            widgets = await self._generate_dashboard_widgets(
                tenant_id, dashboard_type, period
            )
            
            dashboard_id = str(uuid.uuid4())
            dashboard = {
                "id": dashboard_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "conversation_id": conversation_id,
                "name": payload.name,
                "description": payload.description or f"Auto-generated {dashboard_type.replace('_', ' ')} dashboard",
                "dashboard_type": dashboard_type,
                "period": period,
                "widgets": widgets,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            
            await self.db.clu_bot_dashboards.insert_one(dashboard)
            
            # Build summary
            widget_names = [w["title"] for w in widgets]
            
            return {
                "success": True,
                "dashboard_id": dashboard_id,
                "name": payload.name,
                "dashboard_type": dashboard_type,
                "widget_count": len(widgets),
                "widgets": widgets,
                "summary": f"Created dashboard '{payload.name}' with {len(widgets)} widgets: {', '.join(widget_names)}",
                "message": f"Dashboard '{payload.name}' has been created with {len(widgets)} widgets."
            }
            
        except Exception as e:
            logger.error(f"Create dashboard error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to create dashboard: {str(e)}"
            }
    
    async def _generate_dashboard_widgets(
        self,
        tenant_id: str,
        dashboard_type: str,
        period: str
    ) -> List[Dict[str, Any]]:
        """Generate widget configs and populate with live CRM data"""
        
        # Define widget templates per dashboard type
        DASHBOARD_TEMPLATES = {
            "sales_performance": [
                {"widget_type": "metric_card", "title": "Total Revenue", "data_source": "revenue"},
                {"widget_type": "metric_card", "title": "Deals Won", "data_source": "won_deals"},
                {"widget_type": "metric_card", "title": "Win Rate", "data_source": "win_rate"},
                {"widget_type": "metric_card", "title": "Avg Deal Size", "data_source": "avg_deal_size"},
                {"widget_type": "bar_chart", "title": "Revenue by Stage", "data_source": "pipeline"},
                {"widget_type": "table", "title": "Top Deals", "data_source": "top_opportunities"},
            ],
            "pipeline_overview": [
                {"widget_type": "metric_card", "title": "Total Pipeline Value", "data_source": "pipeline_value"},
                {"widget_type": "metric_card", "title": "Open Opportunities", "data_source": "open_opps"},
                {"widget_type": "metric_card", "title": "Weighted Pipeline", "data_source": "weighted_pipeline"},
                {"widget_type": "bar_chart", "title": "Pipeline by Stage", "data_source": "pipeline"},
                {"widget_type": "table", "title": "Slipping Deals", "data_source": "slipping_deals"},
                {"widget_type": "list", "title": "Stale Opportunities", "data_source": "stale_opportunities"},
            ],
            "lead_management": [
                {"widget_type": "metric_card", "title": "Total Leads", "data_source": "lead_count"},
                {"widget_type": "metric_card", "title": "New Leads", "data_source": "new_leads"},
                {"widget_type": "metric_card", "title": "Conversion Rate", "data_source": "conversion_rate"},
                {"widget_type": "pie_chart", "title": "Leads by Status", "data_source": "leads_by_status"},
                {"widget_type": "bar_chart", "title": "Leads by Source", "data_source": "leads_by_source"},
                {"widget_type": "list", "title": "Inactive Leads", "data_source": "inactive_leads"},
            ],
            "activity_tracker": [
                {"widget_type": "metric_card", "title": "Total Activities", "data_source": "total_activities"},
                {"widget_type": "metric_card", "title": "Tasks Created", "data_source": "tasks_count"},
                {"widget_type": "metric_card", "title": "Events Scheduled", "data_source": "events_count"},
                {"widget_type": "metric_card", "title": "Notes Added", "data_source": "notes_count"},
                {"widget_type": "table", "title": "Overdue Tasks", "data_source": "overdue_tasks"},
            ],
        }
        
        templates = DASHBOARD_TEMPLATES.get(dashboard_type, DASHBOARD_TEMPLATES["sales_performance"])
        
        # Populate each widget with live data
        widgets = []
        start_date, end_date = self._get_date_range(period, None, None)
        
        for tmpl in templates:
            widget = {
                "widget_id": str(__import__("uuid").uuid4())[:8],
                "widget_type": tmpl["widget_type"],
                "title": tmpl["title"],
                "data_source": tmpl["data_source"],
                "data": await self._get_widget_data(tenant_id, tmpl["data_source"], start_date, end_date),
                "period": period
            }
            widgets.append(widget)
        
        return widgets
    
    async def _get_widget_data(
        self,
        tenant_id: str,
        data_source: str,
        start_date: datetime,
        end_date: datetime
    ) -> Any:
        """Fetch data for a specific widget data source"""
        
        date_filter = {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        
        if data_source == "revenue":
            pipeline = [
                {"$match": {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                             "created_at": date_filter,
                             "$or": [{"data.stage": {"$regex": "closed.*won", "$options": "i"}}, {"data.is_won": True}]}},
                {"$group": {"_id": None, "total": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}}}
            ]
            result = await self.db.object_records.aggregate(pipeline).to_list(1)
            return {"value": result[0]["total"] if result else 0, "format": "currency"}
        
        elif data_source == "won_deals":
            count = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                "created_at": date_filter,
                "$or": [{"data.stage": {"$regex": "closed.*won", "$options": "i"}}, {"data.is_won": True}]
            })
            return {"value": count, "format": "number"}
        
        elif data_source == "win_rate":
            total = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                "created_at": date_filter
            })
            won = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                "created_at": date_filter,
                "$or": [{"data.stage": {"$regex": "closed.*won", "$options": "i"}}, {"data.is_won": True}]
            })
            return {"value": (won / total * 100) if total > 0 else 0, "format": "percentage"}
        
        elif data_source == "avg_deal_size":
            pipeline = [
                {"$match": {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                             "created_at": date_filter,
                             "$or": [{"data.stage": {"$regex": "closed.*won", "$options": "i"}}, {"data.is_won": True}]}},
                {"$group": {"_id": None, "avg": {"$avg": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}}}
            ]
            result = await self.db.object_records.aggregate(pipeline).to_list(1)
            return {"value": result[0]["avg"] if result else 0, "format": "currency"}
        
        elif data_source == "pipeline_value":
            pipeline = [
                {"$match": {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                             "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}}},
                {"$group": {"_id": None, "total": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}}}
            ]
            result = await self.db.object_records.aggregate(pipeline).to_list(1)
            return {"value": result[0]["total"] if result else 0, "format": "currency"}
        
        elif data_source == "open_opps":
            count = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}
            })
            return {"value": count, "format": "number"}
        
        elif data_source == "weighted_pipeline":
            stage_weights = {"Prospecting": 0.1, "Qualification": 0.2, "Needs Analysis": 0.4,
                           "Proposal": 0.6, "Negotiation": 0.75, "Verbal Commitment": 0.9}
            pipeline = [
                {"$match": {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                             "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}}},
                {"$project": {"stage": {"$ifNull": ["$data.stage", "Unknown"]}, "amount": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}}
            ]
            records = await self.db.object_records.aggregate(pipeline).to_list(500)
            weighted = sum(r["amount"] * stage_weights.get(r["stage"], 0.3) for r in records)
            return {"value": weighted, "format": "currency"}
        
        elif data_source == "pipeline":
            pipeline = [
                {"$match": {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True}}},
                {"$group": {"_id": {"$ifNull": ["$data.stage", "Unknown"]},
                            "value": {"$sum": {"$toDouble": {"$ifNull": ["$data.amount", 0]}}}, "count": {"$sum": 1}}},
                {"$sort": {"value": -1}}
            ]
            results = await self.db.object_records.aggregate(pipeline).to_list(20)
            return {"items": [{"label": r["_id"], "value": r["value"], "count": r["count"]} for r in results]}
        
        elif data_source == "top_opportunities":
            cursor = self.db.object_records.find(
                {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                 "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}},
                {"_id": 0}
            ).sort("data.amount", -1).limit(5)
            records = await cursor.to_list(5)
            return {"items": [{"name": r.get("data", {}).get("opportunity_name") or r.get("data", {}).get("name", "Unknown"),
                              "amount": float(r.get("data", {}).get("amount", 0) or 0),
                              "stage": r.get("data", {}).get("stage", "Unknown")} for r in records]}
        
        elif data_source == "lead_count":
            count = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "lead", "is_deleted": {"$ne": True}, "created_at": date_filter
            })
            return {"value": count, "format": "number"}
        
        elif data_source == "new_leads":
            count = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "lead", "is_deleted": {"$ne": True},
                "created_at": date_filter, "data.status": "New"
            })
            return {"value": count, "format": "number"}
        
        elif data_source == "conversion_rate":
            total = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "lead", "is_deleted": {"$ne": True}, "created_at": date_filter
            })
            converted = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "lead", "is_deleted": {"$ne": True}, "created_at": date_filter,
                "$or": [{"data.status": {"$regex": "converted", "$options": "i"}}, {"data.is_converted": True}]
            })
            return {"value": (converted / total * 100) if total > 0 else 0, "format": "percentage"}
        
        elif data_source == "leads_by_status":
            pipeline = [
                {"$match": {"tenant_id": tenant_id, "object_name": "lead", "is_deleted": {"$ne": True}}},
                {"$group": {"_id": {"$ifNull": ["$data.status", "Unknown"]}, "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            results = await self.db.object_records.aggregate(pipeline).to_list(20)
            return {"items": [{"label": r["_id"], "value": r["count"]} for r in results]}
        
        elif data_source == "leads_by_source":
            pipeline = [
                {"$match": {"tenant_id": tenant_id, "object_name": "lead", "is_deleted": {"$ne": True}}},
                {"$group": {"_id": {"$ifNull": ["$data.lead_source", "Unknown"]}, "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            results = await self.db.object_records.aggregate(pipeline).to_list(20)
            return {"items": [{"label": r["_id"], "value": r["count"]} for r in results]}
        
        elif data_source == "inactive_leads":
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            cursor = self.db.object_records.find(
                {"tenant_id": tenant_id, "object_name": "lead", "is_deleted": {"$ne": True},
                 "updated_at": {"$lt": cutoff}, "data.status": {"$nin": ["Converted", "Disqualified", "Closed"]}},
                {"_id": 0}
            ).sort("updated_at", 1).limit(5)
            records = await cursor.to_list(5)
            return {"items": [{"name": f"{r.get('data',{}).get('first_name','')} {r.get('data',{}).get('last_name','')}".strip() or "Unknown",
                              "status": r.get("data", {}).get("status", "Unknown"),
                              "last_updated": r.get("updated_at")} for r in records]}
        
        elif data_source == "slipping_deals":
            today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            cursor = self.db.object_records.find(
                {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                 "data.close_date": {"$lt": today}, "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}},
                {"_id": 0}
            ).sort("data.amount", -1).limit(5)
            records = await cursor.to_list(5)
            return {"items": [{"name": r.get("data", {}).get("opportunity_name") or r.get("data", {}).get("name", "Unknown"),
                              "amount": float(r.get("data", {}).get("amount", 0) or 0),
                              "close_date": r.get("data", {}).get("close_date")} for r in records]}
        
        elif data_source == "stale_opportunities":
            cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
            cursor = self.db.object_records.find(
                {"tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                 "updated_at": {"$lt": cutoff}, "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}},
                {"_id": 0}
            ).sort("data.amount", -1).limit(5)
            records = await cursor.to_list(5)
            return {"items": [{"name": r.get("data", {}).get("opportunity_name") or r.get("data", {}).get("name", "Unknown"),
                              "amount": float(r.get("data", {}).get("amount", 0) or 0),
                              "stage": r.get("data", {}).get("stage", "Unknown")} for r in records]}
        
        elif data_source in ["total_activities", "tasks_count", "events_count", "notes_count"]:
            if data_source == "tasks_count" or data_source == "total_activities":
                tasks = await self.db.object_records.count_documents({
                    "tenant_id": tenant_id, "object_name": "task", "is_deleted": {"$ne": True}, "created_at": date_filter
                })
            if data_source == "events_count" or data_source == "total_activities":
                events = await self.db.object_records.count_documents({
                    "tenant_id": tenant_id, "object_name": "event", "is_deleted": {"$ne": True}, "created_at": date_filter
                })
            if data_source == "notes_count" or data_source == "total_activities":
                notes = await self.db.notes.count_documents({
                    "tenant_id": tenant_id, "is_deleted": {"$ne": True}, "created_at": date_filter
                })
            if data_source == "total_activities":
                return {"value": tasks + events + notes, "format": "number"}
            elif data_source == "tasks_count":
                return {"value": tasks, "format": "number"}
            elif data_source == "events_count":
                return {"value": events, "format": "number"}
            elif data_source == "notes_count":
                return {"value": notes, "format": "number"}
        
        elif data_source == "overdue_tasks":
            today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            cursor = self.db.object_records.find(
                {"tenant_id": tenant_id, "object_name": "task", "is_deleted": {"$ne": True},
                 "data.due_date": {"$lt": today}, "data.status": {"$nin": ["Completed", "Done", "Closed"]}},
                {"_id": 0}
            ).sort("data.due_date", 1).limit(5)
            records = await cursor.to_list(5)
            return {"items": [{"subject": r.get("data", {}).get("subject", "Unknown"),
                              "due_date": r.get("data", {}).get("due_date"),
                              "priority": r.get("data", {}).get("priority", "Normal")} for r in records]}
        
        return {"value": 0, "format": "number"}
    
    # =========================================================================
    # Phase 3: Trend Analysis
    # =========================================================================
    
    async def analyze_trend(
        self,
        tenant_id: str,
        user_id: str,
        payload: TrendAnalysisPayload
    ) -> Dict[str, Any]:
        """
        Analyze time-series trends for CRM metrics.
        Returns data points for each period with labels.
        """
        try:
            metric = payload.metric.lower()
            period_count = payload.period_count
            period_type = payload.period_type.lower()
            
            # Generate period boundaries
            periods = self._generate_period_boundaries(period_count, period_type)
            
            # Collect data for each period
            data_points = []
            for p in periods:
                value = await self._get_metric_value(tenant_id, metric, p["start"], p["end"])
                data_points.append({
                    "label": p["label"],
                    "start": p["start"].strftime('%Y-%m-%d'),
                    "end": p["end"].strftime('%Y-%m-%d'),
                    "value": value
                })
            
            # Calculate trend direction and change
            values = [d["value"] for d in data_points]
            if len(values) >= 2 and values[-1] != 0:
                overall_change = ((values[-1] - values[0]) / values[0] * 100) if values[0] != 0 else (100 if values[-1] > 0 else 0)
            else:
                overall_change = 0
            
            trend = "upward" if overall_change > 5 else "downward" if overall_change < -5 else "stable"
            avg_value = sum(values) / len(values) if values else 0
            max_point = max(data_points, key=lambda d: d["value"]) if data_points else None
            min_point = min(data_points, key=lambda d: d["value"]) if data_points else None
            
            metric_label = metric.replace('_', ' ').title()
            
            return {
                "success": True,
                "metric": metric,
                "period_type": period_type,
                "period_count": period_count,
                "trend": trend,
                "overall_change_pct": overall_change,
                "average": avg_value,
                "peak": {"label": max_point["label"], "value": max_point["value"]} if max_point else None,
                "low": {"label": min_point["label"], "value": min_point["value"]} if min_point else None,
                "data_points": data_points,
                "summary": f"{metric_label} trend over {period_count} {period_type}s: {trend} ({overall_change:+.1f}%). Average: {self._format_metric_value(metric, avg_value)}"
            }
            
        except Exception as e:
            logger.error(f"Trend analysis error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to analyze trend: {str(e)}"
            }
    
    def _generate_period_boundaries(self, count: int, period_type: str) -> List[Dict[str, Any]]:
        """Generate period boundaries going back from now"""
        now = datetime.now(timezone.utc)
        periods = []
        
        for i in range(count - 1, -1, -1):
            if period_type == "day":
                start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
                end = start.replace(hour=23, minute=59, second=59)
                label = start.strftime('%b %d')
            elif period_type == "week":
                start = (now - timedelta(weeks=i))
                start = (start - timedelta(days=start.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
                end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
                label = f"W{start.isocalendar()[1]} {start.strftime('%b')}"
            elif period_type == "month":
                target = now - relativedelta(months=i)
                start = target.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                next_month = start + relativedelta(months=1)
                end = next_month - timedelta(seconds=1)
                label = start.strftime('%b %Y')
            elif period_type == "quarter":
                target = now - relativedelta(months=i * 3)
                q_month = ((target.month - 1) // 3) * 3 + 1
                start = target.replace(month=q_month, day=1, hour=0, minute=0, second=0, microsecond=0)
                end = start + relativedelta(months=3) - timedelta(seconds=1)
                label = f"Q{(q_month - 1) // 3 + 1} {start.year}"
            else:
                start = (now - timedelta(days=i * 30)).replace(hour=0, minute=0, second=0, microsecond=0)
                end = start + timedelta(days=29, hours=23, minutes=59, seconds=59)
                label = start.strftime('%b %Y')
            
            periods.append({"start": start, "end": end, "label": label})
        
        return periods
    
    # =========================================================================
    # Phase 3: Pipeline Forecasting
    # =========================================================================
    
    async def forecast_pipeline(
        self,
        tenant_id: str,
        user_id: str,
        payload: PipelineForecastPayload
    ) -> Dict[str, Any]:
        """
        Provide pipeline forecast analysis based on opportunity data.
        Includes weighted pipeline, deal risk analysis, and projected revenue.
        """
        try:
            # Stage probability weights for weighted pipeline
            stage_weights = {
                "Prospecting": 0.10, "Qualification": 0.20, "Needs Analysis": 0.40,
                "Value Proposition": 0.50, "Proposal": 0.60, "Negotiation": 0.75,
                "Verbal Commitment": 0.90, "Id. Decision Makers": 0.30,
                "Perception Analysis": 0.35
            }
            
            # Get all open opportunities
            cursor = self.db.object_records.find({
                "tenant_id": tenant_id,
                "object_name": "opportunity",
                "is_deleted": {"$ne": True},
                "data.stage": {"$not": {"$regex": "closed", "$options": "i"}}
            }, {"_id": 0})
            
            opportunities = await cursor.to_list(500)
            
            total_pipeline = 0
            weighted_pipeline = 0
            stage_breakdown = {}
            at_risk_deals = []
            likely_to_close = []
            today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            
            # Determine forecast end date
            now = datetime.now(timezone.utc)
            if payload.forecast_period == "month":
                forecast_end = (now + relativedelta(months=1)).strftime('%Y-%m-%d')
                forecast_label = "next month"
            elif payload.forecast_period == "quarter":
                forecast_end = (now + relativedelta(months=3)).strftime('%Y-%m-%d')
                forecast_label = "next quarter"
            else:
                forecast_end = (now + relativedelta(years=1)).strftime('%Y-%m-%d')
                forecast_label = "next year"
            
            for opp in opportunities:
                data = opp.get("data", {})
                amount = float(data.get("amount", 0) or 0)
                stage = data.get("stage", "Unknown")
                close_date = data.get("close_date", "")
                name = data.get("opportunity_name") or data.get("name", "Unknown")
                
                total_pipeline += amount
                weight = stage_weights.get(stage, 0.3)
                weighted_pipeline += amount * weight
                
                # Stage breakdown
                if stage not in stage_breakdown:
                    stage_breakdown[stage] = {"count": 0, "value": 0, "weighted": 0}
                stage_breakdown[stage]["count"] += 1
                stage_breakdown[stage]["value"] += amount
                stage_breakdown[stage]["weighted"] += amount * weight
                
                # Risk analysis
                if payload.include_risk_analysis:
                    risk_factors = []
                    if close_date and close_date < today:
                        risk_factors.append("past close date")
                    if opp.get("updated_at"):
                        days_since_update = (datetime.now(timezone.utc) - datetime.fromisoformat(
                            opp["updated_at"].replace('Z', '+00:00')
                        )).days
                        if days_since_update > 14:
                            risk_factors.append(f"{days_since_update}d since last update")
                    if weight < 0.3:
                        risk_factors.append("early stage")
                    
                    if risk_factors:
                        at_risk_deals.append({
                            "name": name, "amount": amount, "stage": stage,
                            "close_date": close_date, "risk_factors": risk_factors,
                            "risk_score": len(risk_factors)
                        })
                    
                    # Likely to close (high probability, close date within forecast)
                    if weight >= 0.6 and close_date and close_date <= forecast_end and close_date >= today:
                        likely_to_close.append({
                            "name": name, "amount": amount, "stage": stage,
                            "close_date": close_date, "probability": int(weight * 100)
                        })
            
            # Sort results
            at_risk_deals.sort(key=lambda d: d["risk_score"], reverse=True)
            likely_to_close.sort(key=lambda d: d["amount"], reverse=True)
            
            # Historical win rate for better forecast
            total_hist_opps = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True}
            })
            won_hist_opps = await self.db.object_records.count_documents({
                "tenant_id": tenant_id, "object_name": "opportunity", "is_deleted": {"$ne": True},
                "$or": [{"data.stage": {"$regex": "closed.*won", "$options": "i"}}, {"data.is_won": True}]
            })
            historical_win_rate = (won_hist_opps / total_hist_opps * 100) if total_hist_opps > 0 else 0
            
            # Build stage breakdown list
            stages_list = [
                {"stage": s, "count": d["count"], "value": d["value"], "weighted": d["weighted"],
                 "probability": int(stage_weights.get(s, 0.3) * 100)}
                for s, d in sorted(stage_breakdown.items(), key=lambda x: x[1]["value"], reverse=True)
            ]
            
            forecast_revenue = sum(d["amount"] for d in likely_to_close)
            
            result = {
                "success": True,
                "forecast_period": forecast_label,
                "total_pipeline": total_pipeline,
                "weighted_pipeline": weighted_pipeline,
                "open_opportunities": len(opportunities),
                "historical_win_rate": historical_win_rate,
                "stages": stages_list,
                "summary": (
                    f"Pipeline Forecast ({forecast_label}): "
                    f"${total_pipeline:,.2f} total pipeline, "
                    f"${weighted_pipeline:,.2f} weighted. "
                    f"{len(likely_to_close)} deals ({self._format_metric_value('revenue', forecast_revenue)}) likely to close. "
                    f"{len(at_risk_deals)} deals at risk. "
                    f"Historical win rate: {historical_win_rate:.1f}%"
                )
            }
            
            if payload.include_risk_analysis:
                result["at_risk_deals"] = at_risk_deals[:10]
                result["likely_to_close"] = likely_to_close[:10]
            
            return result
            
        except Exception as e:
            logger.error(f"Pipeline forecast error: {str(e)}")
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to forecast pipeline: {str(e)}"
            }
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    
    def _get_date_range(
        self,
        period: str,
        start_date: Optional[str],
        end_date: Optional[str]
    ) -> tuple:
        """Get date range for a period"""
        now = datetime.now(timezone.utc)
        
        if period == "custom" and start_date and end_date:
            return (
                datetime.fromisoformat(start_date.replace('Z', '+00:00')),
                datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            )
        
        if period == "day":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == "week":
            start = now - timedelta(days=now.weekday())
            start = start.replace(hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == "quarter":
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == "year":
            start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        else:
            # Default to month
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        
        return start, end
    
    def _get_period_dates(self, period: str) -> tuple:
        """Get start and end dates for a named period"""
        now = datetime.now(timezone.utc)
        
        if period == "this_month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == "last_month":
            start = (now.replace(day=1) - timedelta(days=1)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(seconds=1)
        elif period == "this_quarter":
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == "last_quarter":
            quarter_month = ((now.month - 1) // 3) * 3 + 1
            this_q_start = now.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = this_q_start - timedelta(seconds=1)
            start = (this_q_start - relativedelta(months=3))
        elif period == "this_year":
            start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        elif period == "last_year":
            start = now.replace(year=now.year-1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(seconds=1)
        else:
            # Default to this month
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now
        
        return start, end
    
    def _format_metric_value(self, metric_type: str, value: float) -> str:
        """Format metric value for display"""
        if metric_type in ["revenue", "pipeline_value"]:
            return f"${value:,.2f}"
        elif metric_type in ["conversion_rate", "win_rate"]:
            return f"{value:.1f}%"
        else:
            return f"{int(value):,}"


# Factory function
def get_analytics_mcp_service(db: AsyncIOMotorDatabase) -> AnalyticsMCPService:
    """Get AnalyticsMCPService instance"""
    return AnalyticsMCPService(db)
