"""Enhanced Knowledge API with File Upload and Parsing"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from typing import Optional
import uuid
import os
from datetime import datetime, timezone
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db, User
from shared.auth import get_current_user
from ..models.chatbot import KnowledgeSource, KnowledgeSourceType
from ..services.file_parser_service import FileParserService

router = APIRouter(prefix="/chatbot-manager", tags=["Chatbot Knowledge Enhanced"])

# Storage for uploaded files
FILE_STORAGE = os.path.join(os.path.dirname(__file__), '../../../storage/chatbot_files')
os.makedirs(FILE_STORAGE, exist_ok=True)


@router.post("/bots/{bot_id}/knowledge-sources/upload-file")
async def upload_knowledge_file(
    bot_id: str,
    file: UploadFile = File(...),
    name: str = Form(None),
    current_user: User = Depends(get_current_user)
):
    """Upload and parse file as knowledge source"""
    tenant_id = current_user.tenant_id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    # Validate file type
    allowed_extensions = ['.pdf', '.docx', '.txt']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Save file
    file_id = str(uuid.uuid4())
    saved_filename = f"{file_id}{file_ext}"
    file_path = os.path.join(FILE_STORAGE, saved_filename)
    
    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)
    
    print(f"File saved to {file_path}, size: {len(content)} bytes")
    
    # Parse file content
    parsed_content = FileParserService.parse_file(file_path, file.filename)
    
    if not parsed_content:
        # File saved but parsing failed
        parsed_content = f"File uploaded: {file.filename} (Content could not be extracted)"
    
    # Create knowledge source
    source = KnowledgeSource(
        id=str(uuid.uuid4()),
        type=KnowledgeSourceType.FILE,
        name=name or file.filename,
        config={
            "filename": file.filename,
            "file_path": file_path,
            "file_id": file_id,
            "content_type": file.content_type,
            "file_size": len(content),
            "parsed_content": parsed_content,
            "char_count": len(parsed_content),
            "parsed_at": datetime.now(timezone.utc).isoformat()
        },
        index_status="indexed",
        indexed_at=datetime.now(timezone.utc),
        document_count=1
    )
    
    await db.chatbots.update_one(
        {"id": bot_id, "tenant_id": tenant_id},
        {"$push": {"knowledge_sources": source.dict()}}
    )
    
    print(f"Knowledge source created with {len(parsed_content)} characters of content")
    
    return source
