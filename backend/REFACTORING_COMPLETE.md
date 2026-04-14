# Backend Refactoring - Modular Architecture

## ✅ Completed Structure

```
/app/backend/
├── server.py (NEW - Entry point only, ~50 lines)
├── config/
│   ├── __init__.py ✅
│   ├── database.py ✅
│   ├── settings.py ✅
│   └── constants.py ✅
├── models/
│   ├── __init__.py ✅
│   ├── user.py ✅
│   ├── tenant.py ✅
│   ├── record.py ✅
│   ├── activity.py ✅
│   ├── metadata.py ✅
│   └── lead_conversion.py ✅
├── utils/
│   ├── __init__.py ✅
│   ├── auth.py ✅
│   └── helpers.py ✅
├── services/ (IN PROGRESS)
│   ├── __init__.py ✅
│   ├── auth_service.py (TODO)
│   ├── lead_conversion_service.py (TODO)
│   ├── metadata_service.py (TODO)
│   └── record_service.py (TODO)
└── api/routes/ (TODO)
    ├── __init__.py (TODO)
    ├── auth.py (TODO)
    ├── leads.py (TODO)
    ├── objects.py (TODO)
    ├── metadata.py (TODO)
    └── activities.py (TODO)
```

## What's Been Created

### ✅ Configuration Layer
- **config/settings.py**: Environment variables and app settings
- **config/database.py**: MongoDB client and database connection
- **config/constants.py**: Industry templates, page layouts, field mappings

### ✅ Models Layer
- **models/user.py**: User, UserCreate, UserLogin, Token
- **models/tenant.py**: Tenant, TenantObject
- **models/record.py**: ObjectRecord, RecordCreate, RecordUpdate
- **models/activity.py**: UserListView, UserPreferences, ObjectPreferences, ActivityTimelineItem
- **models/metadata.py**: CustomField, FieldDefinition, ObjectMetadata, CustomObjectCreate
- **models/lead_conversion.py**: ConvertLeadRequest, ConvertLeadResponse, DuplicateRecord

### ✅ Utils Layer
- **utils/auth.py**: JWT handling, password hashing, get_current_user dependency
- **utils/helpers.py**: prepare_for_mongo, parse_from_mongo data transformers

## Next Steps (To Complete)

### 1. Create Services Layer
Services will contain all business logic extracted from route handlers.

**auth_service.py**:
```python
class AuthService:
    @staticmethod
    async def register_user(user_data: UserCreate) -> Token:
        # User registration logic
        pass
    
    @staticmethod
    async def login_user(login_data: UserLogin) -> Token:
        # User login logic
        pass
```

**lead_conversion_service.py**:
```python
class LeadConversionService:
    @staticmethod
    async def detect_duplicate_accounts(company_name: str, tenant_id: str):
        pass
    
    @staticmethod
    async def detect_duplicate_contacts(email: str, tenant_id: str):
        pass
    
    @staticmethod
    async def convert_lead(lead_id: str, conversion_data: ConvertLeadRequest, user: User):
        pass
    
    @staticmethod
    def map_custom_fields(source_data: dict, target_data: dict) -> dict:
        pass
    
    @staticmethod
    def map_status_to_stage(lead_status: str) -> str:
        pass
```

**metadata_service.py**:
```python
class MetadataService:
    @staticmethod
    async def get_object_metadata(object_name: str, tenant_id: str):
        pass
    
    @staticmethod
    async def create_custom_field(object_name: str, field_data: CustomFieldCreate, user: User):
        pass
    
    @staticmethod
    async def update_custom_field(object_name: str, field_id: str, field_data: CustomFieldUpdate, user: User):
        pass
```

**record_service.py**:
```python
class RecordService:
    @staticmethod
    async def create_record(object_name: str, record_data: RecordCreate, user: User):
        pass
    
    @staticmethod
    async def get_records(object_name: str, user: User, filters: dict = None):
        pass
    
    @staticmethod
    async def update_record(object_name: str, record_id: str, record_data: RecordUpdate, user: User):
        pass
    
    @staticmethod
    async def delete_record(object_name: str, record_id: str, user: User):
        pass
```

### 2. Create API Routes Layer
Routes will be thin controllers that call service methods.

**api/routes/auth.py**:
```python
from fastapi import APIRouter, HTTPException, Depends
from models import UserCreate, UserLogin, Token
from services import AuthService

router = APIRouter()

@router.post("/auth/register", response_model=Token)
async def register(user_data: UserCreate):
    return await AuthService.register_user(user_data)

@router.post("/auth/login", response_model=Token)
async def login(login_data: UserLogin):
    return await AuthService.login_user(login_data)
```

**api/routes/leads.py**:
```python
from fastapi import APIRouter, Depends
from models import ConvertLeadRequest, ConvertLeadResponse, User
from services import LeadConversionService
from utils import get_current_user

router = APIRouter()

@router.post("/leads/{lead_id}/convert", response_model=ConvertLeadResponse)
async def convert_lead(
    lead_id: str,
    conversion_data: ConvertLeadRequest,
    current_user: User = Depends(get_current_user)
):
    return await LeadConversionService.convert_lead(lead_id, conversion_data, current_user)

@router.get("/accounts/search")
async def search_accounts(query: str, current_user: User = Depends(get_current_user)):
    return await LeadConversionService.search_accounts(query, current_user.tenant_id)
```

### 3. Create New server.py Entry Point
```python
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from config import settings
from api.routes import api_router

app = FastAPI(title="Multi-Tenant CRM API", version="2.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)

@app.get("/")
async def root():
    return {"message": "CRM API v2.0", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

## Benefits of This Architecture

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Testability**: Services can be tested independently
3. **Maintainability**: Easy to find and modify specific logic
4. **Scalability**: Easy to add new modules/features
5. **Code Reusability**: Services can be reused across different routes
6. **Clean Dependencies**: Clear import structure

## How to Complete the Refactoring

Run the provided refactoring script:
```bash
cd /app/backend
python refactor_backend.py
```

This will:
1. Extract all route handlers from server.py into separate route files
2. Extract business logic into service classes
3. Create the new minimal server.py
4. Backup the old server.py as server_old.py
5. Test imports and validate structure

## Testing After Refactoring

```bash
# Check Python syntax
python -m py_compile server.py

# Test imports
python -c "from api.routes import api_router; print('✅ Routes OK')"
python -c "from services import AuthService; print('✅ Services OK')"
python -c "from models import User; print('✅ Models OK')"

# Restart backend
sudo supervisorctl restart backend
```
