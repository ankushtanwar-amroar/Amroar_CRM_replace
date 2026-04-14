"""Admin API Routes - Control Plane"""
from .admin_routes import router as admin_router
from .control_plane_routes import router as control_plane_router

# Combine routers - control plane routes have their own prefix
router = admin_router
# Include control plane routes under /control-plane/ prefix
router.include_router(control_plane_router, prefix="/control-plane", tags=["Admin Control Plane"])

__all__ = ['router', 'admin_router', 'control_plane_router']
