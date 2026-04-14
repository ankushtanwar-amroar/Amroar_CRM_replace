"""
CLU-BOT Module
AI-powered CRM Assistant with Deterministic Execution
Phase 1: Record Search, Summaries, Create Lead, Add Note, Create Task
"""

from .api.clu_bot_routes import router as clu_bot_router

__all__ = ["clu_bot_router"]
