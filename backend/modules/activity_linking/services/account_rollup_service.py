"""
Account Rollup Service
Computes and maintains rollup fields on Account:
- open_opportunity_count
- open_pipeline_amount

Triggered when:
- Opportunity is created
- Opportunity stage changes (open/closed)
- Opportunity amount changes
- Opportunity account_id changes
- Opportunity is deleted
"""
from datetime import datetime, timezone
from typing import Dict, Any, Optional
import logging

from config.database import db

logger = logging.getLogger(__name__)


async def compute_account_rollups(
    tenant_id: str,
    account_id: str
) -> Dict[str, Any]:
    """
    Compute rollup values for an account.
    
    Returns:
        {
            "open_opportunity_count": int,
            "open_pipeline_amount": float
        }
    """
    if not account_id:
        return {"open_opportunity_count": 0, "open_pipeline_amount": 0}
    
    # Find all open opportunities for this account
    pipeline = [
        {
            "$match": {
                "tenant_id": tenant_id,
                "object_name": "opportunity",
                "$or": [
                    {"data.account_id": account_id}
                ],
                "$and": [
                    {"data.is_closed": {"$ne": True}},
                    {"is_deleted": {"$ne": True}}
                ]
            }
        },
        {
            "$group": {
                "_id": None,
                "count": {"$sum": 1},
                "total_amount": {
                    "$sum": {
                        "$toDouble": {
                            "$ifNull": ["$data.amount", 0]
                        }
                    }
                }
            }
        }
    ]
    
    result = await db.object_records.aggregate(pipeline).to_list(1)
    
    if result:
        return {
            "open_opportunity_count": result[0].get("count", 0),
            "open_pipeline_amount": round(result[0].get("total_amount", 0), 2)
        }
    
    return {"open_opportunity_count": 0, "open_pipeline_amount": 0}


async def update_account_rollups(
    tenant_id: str,
    account_id: str
) -> bool:
    """
    Update rollup fields on an account record.
    
    Returns True if update was successful.
    """
    if not account_id:
        return False
    
    try:
        rollups = await compute_account_rollups(tenant_id, account_id)
        
        # Find the account record
        account = await db.object_records.find_one({
            "tenant_id": tenant_id,
            "object_name": "account",
            "$or": [
                {"id": account_id},
                {"series_id": account_id}
            ]
        })
        
        if not account:
            logger.warning(f"Account {account_id} not found for rollup update")
            return False
        
        # Update the rollup fields
        await db.object_records.update_one(
            {"_id": account["_id"]},
            {
                "$set": {
                    "data.open_opportunity_count": rollups["open_opportunity_count"],
                    "data.open_pipeline_amount": rollups["open_pipeline_amount"],
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
        
        logger.debug(f"Updated account {account_id} rollups: {rollups}")
        return True
        
    except Exception as e:
        logger.error(f"Error updating account rollups for {account_id}: {e}")
        return False


async def on_opportunity_change(
    tenant_id: str,
    opportunity_data: Dict[str, Any],
    old_opportunity_data: Optional[Dict[str, Any]] = None
):
    """
    Handle opportunity create/update to update account rollups.
    
    Called after opportunity is saved.
    """
    account_ids_to_update = set()
    
    # Current account
    current_account_id = opportunity_data.get("account_id")
    if current_account_id:
        account_ids_to_update.add(current_account_id)
    
    # Previous account (if changed)
    if old_opportunity_data:
        old_account_id = old_opportunity_data.get("account_id")
        if old_account_id and old_account_id != current_account_id:
            account_ids_to_update.add(old_account_id)
    
    # Update all affected accounts
    for account_id in account_ids_to_update:
        await update_account_rollups(tenant_id, account_id)


async def on_opportunity_delete(
    tenant_id: str,
    opportunity_data: Dict[str, Any]
):
    """
    Handle opportunity deletion to update account rollups.
    """
    account_id = opportunity_data.get("account_id")
    if account_id:
        await update_account_rollups(tenant_id, account_id)
