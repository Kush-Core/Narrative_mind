from fastapi import FastAPI

from codex.core.config import get_settings


def create_app() -> FastAPI:
    """Application factory: build and configure the FastAPI instance."""
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        version="0.1.0",
    )

    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    return app


codex = create_app()