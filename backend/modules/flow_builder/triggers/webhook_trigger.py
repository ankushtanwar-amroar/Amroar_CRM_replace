"""
Webhook Trigger Handler
Handles webhook triggers via /api/hooks/:slug
"""
import logging
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..models.flow import Flow
from ..runtime.flow_runtime import FlowRuntimeEngine

logger = logging.getLogger(__name__)


class WebhookTriggerHandler:
    """Handle webhook triggers"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.runtime = FlowRuntimeEngine(db)
    
    async def handle_webhook(
        self, 
        slug: str,
        payload: Dict[str, Any],
        tenant_id: str,
        method: str = "POST"
    ):
        """Handle incoming webhook and trigger matching flow"""
        
        logger.info(f"Webhook trigger: slug={slug}, method={method}, tenant={tenant_id}")
        
        # Find flow with matching webhook trigger
        flow_data = await self.db.flows.find_one({
            "tenant_id": tenant_id,
            "status": "active",
            "triggers": {
                "$elemMatch": {
                    "type": "webhook",
                    "config.slug": slug
                }
            }
        })
        
        if not flow_data:
            logger.warning(f"No active flow found for webhook slug: {slug}")
            return None
        
        # Convert to Flow model
        flow = Flow(**flow_data)
        
        # Prepare context from webhook payload
        context = {
            "trigger_type": "webhook",
            "webhook_slug": slug,
            "webhook_method": method,
            **payload
        }
        
        # Execute flow
        execution = await self.runtime.execute_flow(
            flow=flow,
            trigger_data={"webhook_slug": slug, "payload": payload},
            context=context
        )
        
        logger.info(f"Webhook flow {flow.id} execution completed with status: {execution.status}")
        
        return execution
