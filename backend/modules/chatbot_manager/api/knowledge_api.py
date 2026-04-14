"""
Knowledge Sources API
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Body
from typing import List
import uuid
import os
from datetime import datetime, timezone

# Import from server.py
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from server import db, User
from shared.auth import get_current_user
from ..models.chatbot import KnowledgeSource, KnowledgeSourceType, KnowledgeSourceCreate
from ..services.website_scraper_service import WebsiteScraperService

router = APIRouter(prefix="/chatbot-manager", tags=["Knowledge Sources"])

# Initialize scraper service
scraper_service = WebsiteScraperService()


@router.post("/bots/{bot_id}/knowledge-sources")
async def add_knowledge_source(
    bot_id: str,
    request: KnowledgeSourceCreate,
    current_user: User = Depends(get_current_user)
):
    """Add a knowledge source to bot"""
    tenant_id = current_user.tenant_id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    # If it's a website, scrape the content
    scraped_content = None
    index_status = "pending"
    document_count = 0
    indexed_at = None
    
    if request.source_type == "website":
        url = request.config.get("url", "")
        if url:
            print(f"Scraping website: {url}")
            scrape_result = await scraper_service.scrape_website(url)
            
            if scrape_result.get("success"):
                scraped_content = scrape_result.get("content", "")
                # Store scraped content in config
                request.config["scraped_content"] = scraped_content
                request.config["title"] = scrape_result.get("title", "")
                request.config["meta_description"] = scrape_result.get("meta_description", "")
                request.config["char_count"] = scrape_result.get("char_count", 0)
                request.config["scraped_at"] = datetime.now(timezone.utc).isoformat()
                
                index_status = "indexed"
                document_count = 1
                indexed_at = datetime.now(timezone.utc)
                
                print(f"Successfully scraped {len(scraped_content)} characters from {url}")
            else:
                error = scrape_result.get("error", "Unknown error")
                print(f"Failed to scrape {url}: {error}")
                # Store error but still create the source
                request.config["scrape_error"] = error
                index_status = "failed"
    else:
        # For non-website sources, mark as indexed
        index_status = "indexed"
        indexed_at = datetime.now(timezone.utc)
        document_count = 1
    
    source = KnowledgeSource(
        id=str(uuid.uuid4()),
        type=request.source_type,
        name=request.name,
        config=request.config,
        index_status=index_status,
        indexed_at=indexed_at,
        document_count=document_count
    )
    
    await db.chatbots.update_one(
        {"id": bot_id, "tenant_id": tenant_id},
        {"$push": {"knowledge_sources": source.dict()}}
    )
    
    return source


@router.post("/bots/{bot_id}/knowledge-sources/upload")
async def upload_knowledge_file(
    bot_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a file as knowledge source with content parsing"""
    tenant_id = current_user.tenant_id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    # Import file parser
    from ..services.file_parser_service import FileParserService
    
    # Validate file type
    allowed_extensions = ['.pdf', '.docx', '.txt']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {', '.join(allowed_extensions)}"
        )
    
    # Create storage directory
    FILE_STORAGE = os.path.join(os.path.dirname(__file__), '../../../storage/chatbot_files')
    os.makedirs(FILE_STORAGE, exist_ok=True)
    
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
        parsed_content = f"File uploaded: {file.filename} (Content could not be extracted - file may be encrypted or corrupted)"
        index_status = "failed"
    else:
        index_status = "indexed"
        print(f"Successfully parsed {len(parsed_content)} characters from {file.filename}")
    
    # Create knowledge source with parsed content
    source = KnowledgeSource(
        id=str(uuid.uuid4()),
        type=KnowledgeSourceType.FILE,
        name=file.filename,
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
        index_status=index_status,
        indexed_at=datetime.now(timezone.utc) if index_status == "indexed" else None,
        document_count=1 if index_status == "indexed" else 0
    )
    
    await db.chatbots.update_one(
        {"id": bot_id, "tenant_id": tenant_id},
        {"$push": {"knowledge_sources": source.dict()}}
    )
    
    return source


@router.post("/bots/{bot_id}/knowledge-sources/{source_id}/reindex")
async def reindex_knowledge_source(
    bot_id: str,
    source_id: str,
    current_user: User = Depends(get_current_user)
):
    """Trigger reindexing of a knowledge source"""
    tenant_id = current_user.tenant_id
    
    bot = await db.chatbots.find_one({"id": bot_id, "tenant_id": tenant_id})
    if not bot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot not found"
        )
    
    # Find the knowledge source
    knowledge_sources = bot.get("knowledge_sources", [])
    source_to_reindex = None
    source_index = None
    
    for idx, source in enumerate(knowledge_sources):
        if source.get("id") == source_id:
            source_to_reindex = source
            source_index = idx
            break
    
    if not source_to_reindex:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Knowledge source not found"
        )
    
    # Rescrape if website
    if source_to_reindex.get("type") == "website":
        url = source_to_reindex.get("config", {}).get("url", "")
        if url:
            print(f"Re-scraping website: {url}")
            scrape_result = await scraper_service.scrape_website(url)
            
            update_data = {}
            
            if scrape_result.get("success"):
                scraped_content = scrape_result.get("content", "")
                update_data = {
                    "knowledge_sources.$.config.scraped_content": scraped_content,
                    "knowledge_sources.$.config.title": scrape_result.get("title", ""),
                    "knowledge_sources.$.config.meta_description": scrape_result.get("meta_description", ""),
                    "knowledge_sources.$.config.char_count": scrape_result.get("char_count", 0),
                    "knowledge_sources.$.config.scraped_at": datetime.now(timezone.utc).isoformat(),
                    "knowledge_sources.$.index_status": "indexed",
                    "knowledge_sources.$.indexed_at": datetime.now(timezone.utc),
                    "knowledge_sources.$.document_count": 1
                }
                print(f"Successfully re-scraped {len(scraped_content)} characters")
            else:
                error = scrape_result.get("error", "Unknown error")
                print(f"Failed to re-scrape: {error}")
                update_data = {
                    "knowledge_sources.$.config.scrape_error": error,
                    "knowledge_sources.$.index_status": "failed"
                }
            
            await db.chatbots.update_one(
                {"id": bot_id, "tenant_id": tenant_id, "knowledge_sources.id": source_id},
                {"$set": update_data}
            )
    else:
        # For non-website sources, just mark as indexed
        await db.chatbots.update_one(
            {"id": bot_id, "tenant_id": tenant_id, "knowledge_sources.id": source_id},
            {"$set": {
                "knowledge_sources.$.index_status": "indexed",
                "knowledge_sources.$.indexed_at": datetime.now(timezone.utc),
                "knowledge_sources.$.document_count": 1
            }}
        )
    
    return {"success": True, "message": "Knowledge source reindexed successfully"}


@router.delete("/bots/{bot_id}/knowledge-sources/{source_id}")
async def delete_knowledge_source(
    bot_id: str,
    source_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a knowledge source"""
    tenant_id = current_user.tenant_id
    
    result = await db.chatbots.update_one(
        {"id": bot_id, "tenant_id": tenant_id},
        {"$pull": {"knowledge_sources": {"id": source_id}}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chatbot or knowledge source not found"
        )
    
    return {"success": True}
