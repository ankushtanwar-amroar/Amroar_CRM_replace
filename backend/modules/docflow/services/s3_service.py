"""
AWS S3 Service for DocFlow
Handles all file uploads and downloads to S3
"""
import os
import boto3
from botocore.exceptions import ClientError
from typing import Optional
import logging
import uuid
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# AWS S3 Configuration from environment variables
AWS_ACCESS_KEY = os.environ.get("AWS_ACCESS_KEY")
AWS_SECRET_KEY = os.environ.get("AWS_SECRET_KEY")
AWS_BUCKET_NAME = os.environ.get("AWS_BUCKET_NAME")
AWS_REGION = os.environ.get("AWS_REGION")


class S3Service:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY,
            aws_secret_access_key=AWS_SECRET_KEY,
            region_name=AWS_REGION
        )
        self.bucket_name = AWS_BUCKET_NAME
        self.region = AWS_REGION
    
    def upload_file(self, file_bytes: bytes, filename: str, folder: str = "documents") -> Optional[str]:
        """
        Upload file to S3 and return the S3 key
        
        Args:
            file_bytes: File content as bytes
            filename: Name for the file
            folder: Folder in S3 (documents, templates, etc.)
        
        Returns:
            S3 key (path) of uploaded file
        """
        try:
            s3_key = f"{folder}/{filename}"
            
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=file_bytes,
                ContentType=self._get_content_type(filename)
            )
            
            logger.info(f"Uploaded file to S3: {s3_key}")
            return s3_key
            
        except ClientError as e:
            logger.error(f"Error uploading to S3: {e}")
            return None
    
    def download_file(self, s3_key: str) -> Optional[bytes]:
        """
        Download file from S3
        
        Args:
            s3_key: S3 key (path) of the file
        
        Returns:
            File content as bytes
        """
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            file_bytes = response['Body'].read()
            logger.info(f"Downloaded file from S3: {s3_key} ({len(file_bytes)} bytes)")
            return file_bytes
            
        except ClientError as e:
            logger.error(f"Error downloading from S3: {e}")
            return None
    
    def get_file_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generate a presigned URL for file access
        
        Args:
            s3_key: S3 key (path) of the file
            expiration: URL expiration time in seconds (default 1 hour)
        
        Returns:
            Presigned URL
        """
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': s3_key
                },
                ExpiresIn=expiration
            )
            
            logger.info(f"Generated presigned URL for: {s3_key}")
            return url
            
        except ClientError as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None
    
    def delete_file(self, s3_key: str) -> bool:
        """
        Delete file from S3
        
        Args:
            s3_key: S3 key (path) of the file
        
        Returns:
            True if successful, False otherwise
        """
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            logger.info(f"Deleted file from S3: {s3_key}")
            return True
            
        except ClientError as e:
            logger.error(f"Error deleting from S3: {e}")
            return False
    
    def file_exists(self, s3_key: str) -> bool:
        """
        Check if file exists in S3
        
        Args:
            s3_key: S3 key (path) of the file
        
        Returns:
            True if file exists, False otherwise
        """
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            return True
            
        except ClientError:
            return False
    
    def _get_content_type(self, filename: str) -> str:
        """Get content type based on file extension"""
        ext = os.path.splitext(filename)[1].lower()
        
        content_types = {
            '.pdf': 'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.txt': 'text/plain',
        }
        
        return content_types.get(ext, 'application/octet-stream')
    
    # Helper methods for DocFlow specific use cases
    
    def upload_template(self, file_bytes: bytes, tenant_id: str, template_id: str, file_extension: str) -> Optional[str]:
        """
        Upload template file to S3
        Path: templates/{tenant_id}/{template_id}/template.{ext}
        """
        filename = f"template.{file_extension}"
        s3_key = f"templates/{tenant_id}/{template_id}/{filename}"

        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=file_bytes,
                ContentType=self._get_content_type(filename)
            )
            logger.info(f"Uploaded template to S3: {s3_key}")
            return s3_key
        except ClientError as e:
            logger.error(f"Error uploading template to S3: {e}")
            return None

    def upload_template_file(self, file_bytes: bytes, tenant_id: str, filename: str) -> Optional[str]:
        """
        Upload template file to S3 (for uploaded templates)
        Path: templates/{tenant_id}/{filename}
        """
        s3_key = f"templates/{tenant_id}/{filename}"

        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=file_bytes,
                ContentType=self._get_content_type(filename)
            )
            logger.info(f"Uploaded template file to S3: {s3_key}")
            return s3_key
        except ClientError as e:
            logger.error(f"Error uploading template file to S3: {e}")
            return None
    
    def upload_document(self, file_bytes: bytes, tenant_id: str, document_id: str, 
                       filename: str, is_signed: bool = False) -> Optional[str]:
        """
        Upload document file to S3
        Path: documents/{tenant_id}/{document_id}/unsigned.pdf or signed.pdf
        """
        doc_type = "signed" if is_signed else "unsigned"
        file_ext = os.path.splitext(filename)[1] or '.pdf'
        s3_key = f"documents/{tenant_id}/{document_id}/{doc_type}{file_ext}"
        
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=file_bytes,
                ContentType=self._get_content_type(filename)
            )
            logger.info(f"Uploaded document to S3: {s3_key}")
            return s3_key
        except ClientError as e:
            logger.error(f"Error uploading document to S3: {e}")
            return None
    
    def get_template_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """Get presigned URL for template download"""
        return self.get_file_url(s3_key, expiration)
    
    def get_document_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """Get presigned URL for document download"""
        return self.get_file_url(s3_key, expiration)
