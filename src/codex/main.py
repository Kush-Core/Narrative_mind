from contextlib import asynccontextmanager

from fastapi import FastAPI

from codex.api.routers import api_router
from codex.core.config import get_settings
from codex.db.neo4j import close, connect


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect(get_settings())
    try:
        yield
    finally:
        await close()


def create_app()-> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(api_router)
    return app

app = create_app()