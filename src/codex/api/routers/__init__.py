from fastapi import APIRouter

from codex.api.routers import systems

api_router = APIRouter()
api_router.include_router(systems.router)