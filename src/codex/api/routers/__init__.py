from fastapi import APIRouter

from codex.api.routers import characters, systems

api_router = APIRouter()
api_router.include_router(systems.router)
api_router.include_router(characters.router)