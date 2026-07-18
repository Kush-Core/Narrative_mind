from fastapi import APIRouter

from narrative_mind.api.deps import Settings_Dep

router = APIRouter(tags=["system"])


@router.get("/health")
async def health(settings: Settings_Dep) -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
