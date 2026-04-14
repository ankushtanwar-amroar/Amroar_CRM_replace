from fastapi import APIRouter

from .import_api import router as import_router
from .export_api import router as export_router
from .metadata_api import router as metadata_router

router = APIRouter()

router.include_router(import_router)
router.include_router(export_router)
router.include_router(metadata_router)
