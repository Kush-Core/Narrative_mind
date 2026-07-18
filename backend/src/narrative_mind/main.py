import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from narrative_mind.api.routers import api_router
from narrative_mind.core.config import get_settings
from narrative_mind.core.error_handlers import register_error_handlers
from narrative_mind.core.logging import configure_logging
from narrative_mind.db import neo4j
from narrative_mind.db.migrations import run_migrations

logger = logging.getLogger("narrative_mind")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.debug)
    driver = await neo4j.connect(settings)
    await run_migrations(driver)
    logger.info("Neo4j connected and migrations applied")
    yield
    await neo4j.close()
    logger.info("Neo4j driver closed")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def add_timing(request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Process-Time-ms"] = f"{elapsed_ms:.1f}"
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response

    register_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
