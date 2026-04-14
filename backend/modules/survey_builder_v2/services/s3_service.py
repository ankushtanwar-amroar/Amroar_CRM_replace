"""
S3 Service for File Uploads
Handles file upload to AWS S3 and returns file URLs
"""
import os
import boto3
from botocore.exceptions import ClientError
from typing import Dict, Any
import secrets


class S3Service:
    def __init__(self):
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=os.environ.get('AWS_ACCESS_KEY'),
            aws_secret_access_key=os.environ.get('AWS_SECRET_KEY'),
            region_name=os.environ.get('AWS_REGION')
        )
        self.bucket_name = os.environ.get('AWS_BUCKET_NAME')

    async def upload_file(self, file_content: bytes, filename: str, content_type: str) -> Dict[str, Any]:
        """
        Upload file to S3 and return the file URL
        
        Args:
            file_content: File content in bytes
            filename: Original filename
            content_type: MIME type of the file
            
        Returns:
            Dict with success status and file_url or error message
        """
        try:
            # Extract extension
            file_extension = filename.split('.')[-1] if '.' in filename else ''

            # Create unique filename
            unique_filename = f"survey-uploads/{secrets.token_hex(16)}.{file_extension}"

            # Upload to S3 (NO ACL - required for new S3 buckets)
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=unique_filename,
                Body=file_content,
                ContentType=content_type
            )

            # Public URL (works only if bucket allows public GetObject)
            file_url = (
                f"https://{self.bucket_name}.s3."
                f"{os.environ.get('AWS_REGION')}.amazonaws.com/{unique_filename}"
            )

            return {
                "success": True,
                "file_url": file_url,
                "filename": filename
            }

        except ClientError as e:
            return {
                "success": False,
                "error": f"Failed to upload file: {str(e)}"
            }

        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {str(e)}"
            }

    def generate_presigned_url(self, file_key: str, expiration: int = 3600) -> str:
        """
        Generate a presigned URL for file access (private files)
        
        Args:
            file_key: S3 key for the file
            expiration: URL expiration time in seconds (default 1 hour)
            
        Returns:
            Presigned URL string
        """
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': file_key},
                ExpiresIn=expiration
            )
            return url

        except ClientError as e:
            raise Exception(f"Failed to generate presigned URL: {str(e)}")
