from fastapi import APIRouter

from codex.api.deps import AIServiceDep
from codex.domain.ai import DescribeRequest, DescribeResponse, ExtractRequest, ExtractResponse

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/describe", response_model=DescribeResponse)
async def describe(req: DescribeRequest, svc: AIServiceDep) -> DescribeResponse:
    return await svc.describe(req)


@router.post("/extract", response_model=ExtractResponse)
async def extract(req: ExtractRequest, svc: AIServiceDep) -> ExtractResponse:
    return await svc.extract(req.passage)