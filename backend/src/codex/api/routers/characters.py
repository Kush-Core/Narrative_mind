from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Query, status

from codex.api.deps import CharacterService_Dep, GraphService_Dep, PaginationDep
from codex.domain.character import (
    Character,
    CharacterCreate,
    CharacterRelationshipCreate,
    CharacterUpdate,
)
from codex.domain.common import CharacterStatus, Page, SortOrder

router = APIRouter(prefix="/characters", tags=["characters"])


@router.post("", response_model=Character, status_code=status.HTTP_201_CREATED)
async def create_character(
    payload: CharacterCreate, svc: CharacterService_Dep, background_tasks: BackgroundTasks
) -> Character:
    character = await svc.create(payload)
    background_tasks.add_task(svc.reindex, character.id)
    return character


@router.get("", response_model=Page[Character])
async def list_characters(
    svc: CharacterService_Dep,
    page: PaginationDep,
    status_filter: Annotated[CharacterStatus | None, Query(alias="status")] = None,
    name_contains: Annotated[str | None, Query(alias="name_contains", min_length=1)] = None,
    sort_by: Annotated[str, Query(alias="sort_by")] = "name",
    order: Annotated[SortOrder, Query(alias="order")] = SortOrder.asc,
) -> Page[Character]:
    return await svc.list(
        limit=page.limit,
        offset=page.offset,
        status=status_filter.value if status_filter else None,
        name_contains=name_contains,
        sort_by=sort_by,
        order=order.value,
    )


@router.get("/{character_id}", response_model=Character)
async def get_character(character_id: str, svc: CharacterService_Dep) -> Character:
    return await svc.get(character_id)


@router.patch("/{character_id}", response_model=Character)
async def update_character(
    character_id: str, payload: CharacterUpdate, svc: CharacterService_Dep
) -> Character:
    return await svc.update(character_id, payload)


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(character_id: str, svc: CharacterService_Dep) -> None:
    await svc.delete(character_id)


@router.post("/{character_id}/relationships", status_code=status.HTTP_201_CREATED)
async def create_character_relationship(
    character_id: str, payload: CharacterRelationshipCreate, graph_svc: GraphService_Dep
) -> dict:
    return await graph_svc.link(character_id, payload)
