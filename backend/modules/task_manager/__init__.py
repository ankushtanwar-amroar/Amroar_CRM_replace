"""
Task Manager Module
A Jira-like task management system integrated with CRM
"""
from .api.task_manager_api import task_manager_router

__all__ = ["task_manager_router"]
