from fastapi import APIRouter

from narrative_mind.api.deps import CurrentUserDep, RagService_Dep, RetrievalService_Dep
from narrative_mind.domain.rag import AskRequest, AskResponse, RetrievalResult, RetrieveRequest

router = APIRouter(prefix="/ai", tags=["rag"])


@router.post("/retrieve", response_model=RetrievalResult)
async def retrieve(
    req: RetrieveRequest, svc: RetrievalService_Dep, current_user: CurrentUserDep
) -> RetrievalResult:
    return await svc.retrieve(req)


@router.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, svc: RagService_Dep, current_user: CurrentUserDep) -> AskResponse:
    return await svc.ask(req)
