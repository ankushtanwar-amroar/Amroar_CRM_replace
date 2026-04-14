"""
Form Builder - CRUD Routes
Handles form Create, Read, Update, Delete, Publish, and Submission operations.
"""
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile
from datetime import datetime, timezone
import uuid
import csv
from io import StringIO
import os

# Import from parent module
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from modules.form_builder.models import (
    db, User, get_current_user, parse_from_mongo, generate_series_id,
    Form, FormCreate, FormUpdate, FormSubmission, FormField
)
from shared.services.license_enforcement import require_module_license, ModuleKey

router = APIRouter()


# ============= FORM CRUD ROUTES =============

@router.post("/forms", response_model=Form)
@require_module_license(ModuleKey.FORM_BUILDER)
async def create_form(form_data: FormCreate, current_user: User = Depends(get_current_user)):
    """Create a new form"""
    from modules.form_builder.models import FormSettings
    
    try:
        form = Form(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            title=form_data.title,
            description=form_data.description,
            fields=form_data.fields or [],
            crm_module=form_data.crm_module,
            enable_crm_mapping=form_data.enable_crm_mapping or False,
            steps=form_data.steps,
            settings=form_data.settings or FormSettings()
        )

        result = await db.forms.insert_one(form.model_dump())

        if not result.inserted_id:
            raise Exception("Form insertion failed, no ID returned from MongoDB.")

        return form

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error creating form: {str(e)}"
        )


@router.get("/forms")
@require_module_license(ModuleKey.FORM_BUILDER)
async def list_forms(
    current_user: User = Depends(get_current_user),
    page: int = 1,
    limit: int = 10,
    search: str = None,
    status: str = None
):
    """List all forms for current tenant with pagination, search, and filtering"""
    query = {"tenant_id": current_user.tenant_id}
    
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    if status == "published":
        query["is_published"] = True
    elif status == "draft":
        query["is_published"] = False
    
    total = await db.forms.count_documents(query)
    
    skip = (page - 1) * limit
    total_pages = (total + limit - 1) // limit
    
    forms = await db.forms.find(query)\
        .sort("updated_at", -1)\
        .skip(skip)\
        .limit(limit)\
        .to_list(None)
    
    forms_with_counts = []
    for form in forms:
        submission_count = await db.form_submissions.count_documents({"form_id": form["id"]})
        form_dict = parse_from_mongo(form)
        form_dict["submission_count"] = submission_count
        forms_with_counts.append(form_dict)
    
    return {
        "forms": forms_with_counts,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


@router.get("/forms/{form_id}", response_model=Form)
async def get_form(form_id: str, current_user: User = Depends(get_current_user)):
    """Get a specific form"""
    form = await db.forms.find_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    return Form(**parse_from_mongo(form))


@router.get("/forms/{form_id}/public", response_model=Form)
async def get_public_form(form_id: str):
    """Get a published form (public endpoint - no auth required)"""
    form = await db.forms.find_one({
        "id": form_id,
        "is_published": True
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or not published")
    
    return Form(**parse_from_mongo(form))


@router.put("/forms/{form_id}", response_model=Form)
async def update_form(form_id: str, form_update: FormUpdate, current_user: User = Depends(get_current_user)):
    """Update a form"""
    form = await db.forms.find_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    update_data = form_update.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.forms.update_one(
        {"id": form_id},
        {"$set": update_data}
    )
    
    updated_form = await db.forms.find_one({"id": form_id})
    return Form(**parse_from_mongo(updated_form))


@router.delete("/forms/{form_id}")
async def delete_form(form_id: str, current_user: User = Depends(get_current_user)):
    """Delete a form"""
    result = await db.forms.delete_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Form not found")
    
    await db.form_submissions.delete_many({"form_id": form_id})
    
    return {"message": "Form deleted successfully"}


@router.post("/forms/{form_id}/publish")
async def publish_form(form_id: str, current_user: User = Depends(get_current_user)):
    """Publish a form and generate public URL"""
    form = await db.forms.find_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    public_url = f"/public/forms/{form_id}"
    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
    shareable_link = f"{frontend_url}/form/{form_id}"
    
    await db.forms.update_one(
        {"id": form_id},
        {"$set": {
            "is_published": True,
            "public_url": public_url,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "message": "Form published successfully",
        "public_url": public_url,
        "shareable_link": shareable_link
    }


@router.post("/forms/{form_id}/duplicate")
async def duplicate_form(form_id: str, current_user: User = Depends(get_current_user)):
    """Duplicate an existing form"""
    form = await db.forms.find_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    duplicate = Form(**parse_from_mongo(form))
    duplicate.id = str(uuid.uuid4())
    duplicate.title = f"{duplicate.title} (Copy)"
    duplicate.is_published = False
    duplicate.public_url = None
    duplicate.submission_count = 0
    duplicate.created_at = datetime.now(timezone.utc)
    duplicate.updated_at = datetime.now(timezone.utc)
    
    await db.forms.insert_one(duplicate.model_dump())
    return duplicate


# ============= FORM SUBMISSION ROUTES =============

@router.post("/forms/{form_id}/submit")
async def submit_form(form_id: str, submission_data: dict):
    """Submit a form (public endpoint - no auth required)"""
    form = await db.forms.find_one({"id": form_id, "is_published": True})
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or not published")
    
    for field in form.get("fields", []):
        if field.get("required") and field.get("id") not in submission_data:
            raise HTTPException(
                status_code=400,
                detail=f"Required field '{field.get('label')}' is missing"
            )
    
    submission = FormSubmission(
        form_id=form_id,
        tenant_id=form["tenant_id"],
        data=submission_data
    )
    
    await db.form_submissions.insert_one(submission.model_dump())
    
    await db.forms.update_one(
        {"id": form_id},
        {"$inc": {"submission_count": 1}}
    )
    
    return {
        "message": "Form submitted successfully",
        "submission_id": submission.id
    }


@router.get("/forms/{form_id}/submissions")
async def get_form_submissions(
    form_id: str,
    current_user: User = Depends(get_current_user),
    page: int = 1,
    limit: int = 10,
    search: str = None
):
    """Get all submissions for a form with pagination and search"""
    form = await db.forms.find_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    query = {"form_id": form_id}
    
    if search:
        query["$or"] = [
            {"data": {"$regex": search, "$options": "i"}}
        ]
    
    total = await db.form_submissions.count_documents(query)
    
    skip = (page - 1) * limit
    total_pages = (total + limit - 1) // limit
    
    submissions = await db.form_submissions.find(query)\
        .sort("submitted_at", -1)\
        .skip(skip)\
        .limit(limit)\
        .to_list(None)
    
    return {
        "submissions": [FormSubmission(**parse_from_mongo(s)).model_dump() for s in submissions],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }


@router.get("/forms/{form_id}/submissions/export")
async def export_submissions(form_id: str, current_user: User = Depends(get_current_user)):
    """Export form submissions as CSV"""
    form = await db.forms.find_one({
        "id": form_id,
        "tenant_id": current_user.tenant_id
    })
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    submissions = await db.form_submissions.find({
        "form_id": form_id
    }).to_list(None)
    
    if not submissions:
        return {"message": "No submissions to export"}
    
    output = StringIO()
    
    all_keys = set()
    for sub in submissions:
        all_keys.update(sub.get("data", {}).keys())
    
    fieldnames = ["submission_id", "submitted_at"] + sorted(list(all_keys))
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for sub in submissions:
        row = {
            "submission_id": sub["id"],
            "submitted_at": sub["submitted_at"].isoformat()
        }
        row.update(sub.get("data", {}))
        writer.writerow(row)
    
    return {
        "csv_data": output.getvalue(),
        "filename": f"{form['title'].replace(' ', '_')}_submissions.csv"
    }


@router.post("/forms/{form_id}/submit-with-crm")
async def submit_form_with_crm(form_id: str, submission: dict):
    """Submit form and create/update CRM record"""
    form = await db.forms.find_one({"id": form_id})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    if not form.get("is_published"):
        raise HTTPException(status_code=404, detail="Form is not published")
    
    submission_data = {
        "id": str(uuid.uuid4()),
        "form_id": form_id,
        "tenant_id": form["tenant_id"],
        "data": submission,
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.form_submissions.insert_one(submission_data)
    
    await db.forms.update_one(
        {"id": form_id},
        {"$inc": {"submission_count": 1}}
    )
    
    if form.get("enable_crm_mapping") and form.get("crm_module"):
        try:
            crm_module = form["crm_module"]
            mapped_data = {}
            
            all_fields = []
            if form.get("steps"):
                for step in form["steps"]:
                    all_fields.extend(step.get("fields", []))
            else:
                all_fields = form.get("fields", [])
            
            for field in all_fields:
                if field.get("crm_mapping"):
                    field_id = field["id"]
                    property_id = field["crm_mapping"]["property_id"]
                    if field_id in submission:
                        mapped_data[property_id] = submission[field_id]
            
            if mapped_data:
                record_id = str(uuid.uuid4())
                series_id = await generate_series_id(form["tenant_id"], crm_module, record_id)
                
                record = {
                    "id": record_id,
                    "series_id": series_id,
                    "tenant_id": form["tenant_id"],
                    "object_name": crm_module,
                    "data": mapped_data,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "created_from_form": True,
                    "form_id": form_id,
                    "source": "form_submission"
                }
                
                await db.object_records.insert_one(record)
                
                try:
                    from modules.flow_builder.triggers.db_trigger import DbTriggerHandler
                    db_trigger_handler = DbTriggerHandler(db)
                    await db_trigger_handler.handle_entity_event(
                        entity=crm_module.capitalize(),
                        event="afterInsert",
                        record=record,
                        tenant_id=form["tenant_id"]
                    )
                except Exception as e:
                    print(f"Error triggering flow for form submission: {str(e)}")
                
                return {
                    "message": "Form submitted successfully and CRM record created",
                    "submission_id": submission_data["id"],
                    "crm_record_id": record["id"],
                    "series_id": series_id,
                    "crm_module": crm_module
                }
        
        except Exception as e:
            print(f"CRM record creation failed: {str(e)}")
            return {
                "message": "Form submitted successfully but CRM record creation failed",
                "submission_id": submission_data["id"],
                "error": str(e)
            }
    
    return {
        "message": "Form submitted successfully",
        "submission_id": submission_data["id"]
    }


# ============= FILE UPLOAD FOR FORMS =============

@router.post("/forms/upload-file")
async def upload_form_file(file: UploadFile = File(...)):
    """Upload file to S3 for form submissions (public endpoint)"""
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'modules', 'survey_builder_v2', 'services'))
        from s3_service import S3Service
        
        content = await file.read()
        if len(content) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size exceeds 25MB limit")
        
        s3_service = S3Service()
        result = await s3_service.upload_file(
            file_content=content,
            filename=file.filename,
            content_type=file.content_type
        )
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Upload failed"))
        
        return {
            "success": True,
            "file_url": result["file_url"],
            "filename": result["filename"]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
