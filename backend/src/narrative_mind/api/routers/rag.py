from fastapi import APIRouter

from narrative_mind.api.deps import CurrentUserDep, RetrievalService_Dep
from narrative_mind.domain.rag import RetrievalResult, RetrieveRequest

router = APIRouter(prefix="/ai", tags=["rag"])


@router.post("/retrieve", response_model=RetrievalResult)
async def retrieve(
    req: RetrieveRequest, svc: RetrievalService_Dep, current_user: CurrentUserDep
) -> RetrievalResult:
    return await svc.retrieve(req)
