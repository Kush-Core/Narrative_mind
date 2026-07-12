from typing import Annotated

from fastapi import APIRouter, Query, status

from codex.api.deps import FactionService_Dep, PaginationDep
from codex.domain.common import Page, SortOrder
from codex.domain.faction import Faction, FactionCreate, FactionUpdate

router = APIRouter(prefix="/factions", tags=["factions"])


@router.post("", response_model=Faction, status_code=status.HTTP_201_CREATED)
async def create_faction(payload: FactionCreate, svc: FactionService_Dep) -> Faction:
    return await svc.create(payload)


@router.get("", response_model=Page[Faction])
async def list_factions(
    svc: FactionService_Dep,
    page: PaginationDep,
    ideology: Annotated[str | None, Query(alias="ideology", min_length=1)] = None,
    name_contains: Annotated[str | None, Query(alias="name_contains", min_length=1)] = None,
    sort_by: Annotated[str, Query(alias="sort_by")] = "name",
    order: Annotated[SortOrder, Query(alias="order")] = SortOrder.asc,
) -> Page[Faction]:
    return await svc.list(
        limit=page.limit,
        offset=page.offset,
        ideology=ideology,
        name_contains=name_contains,
        sort_by=sort_by,
        order=order.value,
    )


@router.get("/{faction_id}", response_model=Faction)
async def get_faction(faction_id: str, svc: FactionService_Dep) -> Faction:
    return await svc.get(faction_id)


@router.patch("/{faction_id}", response_model=Faction)
async def update_faction(
    faction_id: str, payload: FactionUpdate, svc: FactionService_Dep
) -> Faction:
    return await svc.update(faction_id, payload)


@router.delete("/{faction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_faction(faction_id: str, svc: FactionService_Dep) -> None:
    await svc.delete(faction_id)
