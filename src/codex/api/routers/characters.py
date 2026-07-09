from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from codex.api.deps import CharacterService_Dep, PaginationDep
from codex.domain.character import Character, CharacterCreate, CharacterUpdate
from codex.domain.common import CharacterStatus, Page, SortOrder

router = APIRouter(prefix="/characters", tags=["characters"])


@router.post("", response_model=Character, status_code=status.HTTP_201_CREATED)
async def create_character(payload: CharacterCreate, svc: CharacterService_Dep) -> Character:
    return await svc.create(payload)


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
        limit=page.limit, offset=page.offset,
        status=status_filter.value if status_filter else None,
        name_contains=name_contains, sort_by=sort_by, order=order.value,
    )


@router.get("/{character_id}", response_model=Character)
async def get_character(character_id: str, svc: CharacterService_Dep) -> Character:
    character = await svc.get(character_id)
    if character is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Character not found")
    return character


@router.patch("/{character_id}", response_model=Character)
async def update_character(
    character_id: str, payload: CharacterUpdate, svc: CharacterService_Dep
) -> Character:
    updated = await svc.update(character_id, payload)
    if updated is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Character not found")
    return updated


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(character_id: str, svc: CharacterService_Dep) -> None:
    if not await svc.delete(character_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Character not found")