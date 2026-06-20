from fastapi import FastAPI

from codex.api.routers import api_router
from codex.core.config import get_settings


def create_app()-> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, debug=settings.debug, version="0.1.0")
    app.include_router(api_router)
    return app

app = create_app()