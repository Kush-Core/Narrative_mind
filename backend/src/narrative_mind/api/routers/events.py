from typing import Annotated

from fastapi import APIRouter, Query, status

from narrative_mind.api.deps import EventService_Dep, PaginationDep
from narrative_mind.domain.common import Page, SortOrder
from narrative_mind.domain.event import Event, EventCreate, EventUpdate

router = APIRouter(prefix="/events", tags=["events"])


@router.post("", response_model=Event, status_code=status.HTTP_201_CREATED)
async def create_event(payload: EventCreate, svc: EventService_Dep) -> Event:
    return await svc.create(payload)


@router.get("", response_model=Page[Event])
async def list_events(
    svc: EventService_Dep,
    page: PaginationDep,
    name_contains: Annotated[str | None, Query(alias="name_contains", min_length=1)] = None,
    sort_by: Annotated[str, Query(alias="sort_by")] = "name",
    order: Annotated[SortOrder, Query(alias="order")] = SortOrder.asc,
) -> Page[Event]:
    return await svc.list(
        limit=page.limit,
        offset=page.offset,
        name_contains=name_contains,
        sort_by=sort_by,
        order=order.value,
    )


@router.get("/{event_id}", response_model=Event)
async def get_event(event_id: str, svc: EventService_Dep) -> Event:
    return await svc.get(event_id)


@router.patch("/{event_id}", response_model=Event)
async def update_event(event_id: str, payload: EventUpdate, svc: EventService_Dep) -> Event:
    return await svc.update(event_id, payload)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: str, svc: EventService_Dep) -> None:
    await svc.delete(event_id)
