"""
Delay Scheduler - Resumes delayed flow executions
Runs as a background worker to pick up expired delays
"""
import asyncio
import logging
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from modules.flow_builder.runtime.flow_runtime import FlowRuntimeEngine
from modules.flow_builder.models.flow import Flow, FlowExecution

logger = logging.getLogger(__name__)


class DelayScheduler:
    """Background worker that resumes delayed executions"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.runtime = FlowRuntimeEngine(db)
        self.is_running = False
    
    async def start(self, interval_seconds: int = 10):
        """Start the scheduler loop"""
        self.is_running = True
        logger.info("⏰ Delay Scheduler started (interval: {}s)".format(interval_seconds))
        
        while self.is_running:
            try:
                await self.process_expired_delays()
                await asyncio.sleep(interval_seconds)
            except Exception as e:
                logger.error(f"❌ Error in delay scheduler: {e}")
                await asyncio.sleep(interval_seconds)
    
    def stop(self):
        """Stop the scheduler"""
        self.is_running = False
        logger.info("⏹️  Delay Scheduler stopped")
    
    async def process_expired_delays(self):
        """Find and resume expired delayed executions"""
        now = datetime.now(timezone.utc)
        
        # Find all waiting delays that should resume
        expired_delays = await self.db.delayed_executions.find({
            "status": "waiting",
            "resume_at": {"$lte": now}
        }).to_list(100)
        
        if expired_delays:
            logger.info(f"⏰ Found {len(expired_delays)} expired delays to resume")
        
        for delay in expired_delays:
            try:
                await self.resume_delayed_execution(delay)
            except Exception as e:
                logger.error(f"❌ Failed to resume delay {delay['id']}: {e}")
    
    async def resume_delayed_execution(self, delay: dict):
        """Resume a single delayed execution"""
        execution_id = delay["execution_id"]
        flow_id = delay["flow_id"]
        current_node_id = delay["current_node_id"]
        
        logger.info(f"⏩ Resuming execution {execution_id} from node {current_node_id}")
        
        # Get the execution
        exec_data = await self.db.flow_executions.find_one({"id": execution_id}, {"_id": 0})
        if not exec_data:
            logger.error(f"Execution {execution_id} not found")
            await self.db.delayed_executions.update_one(
                {"id": delay["id"]},
                {"$set": {"status": "cancelled"}}
            )
            return
        
        # Get the flow
        flow_data = await self.db.flows.find_one({"id": flow_id}, {"_id": 0})
        if not flow_data:
            logger.error(f"Flow {flow_id} not found")
            return
        
        flow = Flow(**flow_data)
        execution = FlowExecution(**exec_data)
        
        # Update delay status to resumed
        await self.db.delayed_executions.update_one(
            {"id": delay["id"]},
            {"$set": {"status": "resumed", "resumed_at": datetime.now(timezone.utc)}}
        )
        
        # Resume execution from next node after delay
        await self.runtime.resume_execution_after_delay(
            flow=flow,
            execution=execution,
            delay_node_id=current_node_id
        )
        
        logger.info(f"✅ Execution {execution_id} resumed successfully")


# For standalone testing
if __name__ == "__main__":
    async def main():
        mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
        db_name = os.environ.get('DB_NAME', 'crm_database')
        
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        
        scheduler = DelayScheduler(db)
        await scheduler.start(interval_seconds=10)
    
    asyncio.run(main())
