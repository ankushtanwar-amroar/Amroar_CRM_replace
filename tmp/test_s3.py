import sys
import os
import asyncio

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from modules.docflow.services.s3_service import S3Service

async def test_s3_url():
    s3_service = S3Service()
    test_key = "templates/test_tenant/test_file.pdf"
    url = s3_service.get_template_url(test_key, expiration=604800)
    print(f"Generated URL: {url}")
    if url and "amz-crm-file-bucket" in url and "X-Amz-Expires=604800" in url:
        print("SUCCESS: URL generated correctly with expiration.")
    else:
        print("FAILURE: URL generation failed or missing parameters.")

if __name__ == "__main__":
    asyncio.run(test_s3_url())
