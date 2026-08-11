from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from narrative_mind.api.deps import Settings_Dep

router = APIRouter(tags=["system"])


@router.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    """Send the bare domain to the API docs.

    Without this, anyone who opens the deployed API root — following a link that
    names it, rather than calling an endpoint — gets a bare JSON 404, which reads
    as a broken deployment. There is nothing to serve at `/` on an API, so the
    docs are the useful answer.
    """
    return RedirectResponse("/docs")


@router.get("/health")
async def health(settings: Settings_Dep) -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
