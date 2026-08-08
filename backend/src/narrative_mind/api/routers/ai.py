from fastapi import APIRouter

from narrative_mind.api.deps import AIServiceDep, CurrentUserDep
from narrative_mind.domain.ai import (
    DescribeRequest,
    DescribeResponse,
    ExtractRequest,
    ExtractResponse,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/describe", response_model=DescribeResponse)
async def describe(
    req: DescribeRequest, svc: AIServiceDep, current_user: CurrentUserDep
) -> DescribeResponse:
    return await svc.describe(req)


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    req: ExtractRequest, svc: AIServiceDep, current_user: CurrentUserDep
) -> ExtractResponse:
    return await svc.extract(req.passage)
