"""
n8n Integration Service
Handles all interactions with n8n API for workflow management
"""
import os
import logging
import httpx
from typing import Dict, Any, List, Optional
import json

logger = logging.getLogger(__name__)

N8N_API_URL = os.getenv("N8N_API_URL", "https://n8n-2lsn.onrender.com")
N8N_API_KEY = os.getenv("N8N_API_KEY")


class N8nService:
    """Service class for n8n API interactions"""
    
    def __init__(self):
        self.base_url = N8N_API_URL.rstrip('/')
        self.api_key = N8N_API_KEY
        self.headers = {
            "X-N8N-API-KEY": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
    
    async def create_workflow(self, workflow_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new workflow in n8n
        
        Args:
            workflow_data: n8n workflow structure
            
        Returns:
            Created workflow with ID
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/workflows",
                    headers=self.headers,
                    json=workflow_data,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Created n8n workflow: {result.get('id')}")
                return result
        except httpx.HTTPError as e:
            logger.error(f"Failed to create n8n workflow: {e}")
            raise Exception(f"n8n API error: {str(e)}")
    
    async def get_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """
        Retrieve a workflow from n8n
        
        Args:
            workflow_id: n8n workflow ID
            
        Returns:
            Workflow data
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/v1/workflows/{workflow_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to get n8n workflow {workflow_id}: {e}")
            raise Exception(f"n8n API error: {str(e)}")
    
    async def update_workflow(self, workflow_id: str, workflow_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing workflow in n8n
        
        Args:
            workflow_id: n8n workflow ID
            workflow_data: Updated workflow structure
            
        Returns:
            Updated workflow
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.patch(
                    f"{self.base_url}/api/v1/workflows/{workflow_id}",
                    headers=self.headers,
                    json=workflow_data,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Updated n8n workflow: {workflow_id}")
                return result
        except httpx.HTTPError as e:
            logger.error(f"Failed to update n8n workflow {workflow_id}: {e}")
            raise Exception(f"n8n API error: {str(e)}")
    
    async def delete_workflow(self, workflow_id: str) -> bool:
        """
        Delete a workflow from n8n
        
        Args:
            workflow_id: n8n workflow ID
            
        Returns:
            Success boolean
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.delete(
                    f"{self.base_url}/api/v1/workflows/{workflow_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                logger.info(f"Deleted n8n workflow: {workflow_id}")
                return True
        except httpx.HTTPError as e:
            logger.error(f"Failed to delete n8n workflow {workflow_id}: {e}")
            raise Exception(f"n8n API error: {str(e)}")
    
    async def execute_workflow(self, workflow_id: str, input_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Execute a workflow in n8n
        
        Args:
            workflow_id: n8n workflow ID
            input_data: Input data for the workflow execution
            
        Returns:
            Execution result
        """
        try:
            async with httpx.AsyncClient() as client:
                payload = input_data or {}
                response = await client.post(
                    f"{self.base_url}/api/v1/workflows/{workflow_id}/execute",
                    headers=self.headers,
                    json=payload,
                    timeout=60.0
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"Executed n8n workflow: {workflow_id}")
                return result
        except httpx.HTTPError as e:
            logger.error(f"Failed to execute n8n workflow {workflow_id}: {e}")
            raise Exception(f"n8n API error: {str(e)}")
    
    async def get_execution(self, execution_id: str) -> Dict[str, Any]:
        """
        Get execution details and logs
        
        Args:
            execution_id: n8n execution ID
            
        Returns:
            Execution data with logs
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/v1/executions/{execution_id}",
                    headers=self.headers,
                    timeout=30.0
                )
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as e:
            logger.error(f"Failed to get n8n execution {execution_id}: {e}")
            raise Exception(f"n8n API error: {str(e)}")
    
    async def list_executions(self, workflow_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        """
        List workflow executions
        
        Args:
            workflow_id: Optional filter by workflow ID
            limit: Number of executions to return
            
        Returns:
            List of executions
        """
        try:
            async with httpx.AsyncClient() as client:
                params = {"limit": limit}
                if workflow_id:
                    params["workflowId"] = workflow_id
                
                response = await client.get(
                    f"{self.base_url}/api/v1/executions",
                    headers=self.headers,
                    params=params,
                    timeout=30.0
                )
                response.raise_for_status()
                result = response.json()
                return result.get("data", [])
        except httpx.HTTPError as e:
            logger.error(f"Failed to list n8n executions: {e}")
            raise Exception(f"n8n API error: {str(e)}")
    
    async def test_connection(self) -> bool:
        """
        Test n8n API connection
        
        Returns:
            True if connection successful
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/v1/workflows",
                    headers=self.headers,
                    timeout=10.0
                )
                response.raise_for_status()
                logger.info("n8n connection test successful")
                return True
        except Exception as e:
            logger.error(f"n8n connection test failed: {e}")
            return False


# Singleton instance
n8n_service = N8nService()
