from typing import Annotated

from fastapi import APIRouter, Query

from narrative_mind.api.deps import CurrentUserDep, GraphService_Dep

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/characters/{character_id}/network")
async def character_network(
    character_id: str,
    svc: GraphService_Dep,
    current_user: CurrentUserDep,
    depth: Annotated[int, Query(ge=1, le=3)] = 1,
) -> dict:
    return await svc.get_network(character_id, depth)


@router.get("/shortest-path")
async def shortest_path(
    source: str, target: str, svc: GraphService_Dep, current_user: CurrentUserDep
) -> dict:
    return await svc.shortest_path(source, target)
