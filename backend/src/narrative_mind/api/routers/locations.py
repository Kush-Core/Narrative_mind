from typing import Annotated

from fastapi import APIRouter, Query, status

from narrative_mind.api.deps import CurrentUserDep, LocationService_Dep, PaginationDep
from narrative_mind.domain.common import Page, SortOrder
from narrative_mind.domain.location import Location, LocationCreate, LocationUpdate

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("", response_model=Location, status_code=status.HTTP_201_CREATED)
async def create_location(
    payload: LocationCreate, svc: LocationService_Dep, current_user: CurrentUserDep
) -> Location:
    return await svc.create(payload)


@router.get("", response_model=Page[Location])
async def list_locations(
    svc: LocationService_Dep,
    page: PaginationDep,
    current_user: CurrentUserDep,
    region: Annotated[str | None, Query(alias="region", min_length=1)] = None,
    name_contains: Annotated[str | None, Query(alias="name_contains", min_length=1)] = None,
    sort_by: Annotated[str, Query(alias="sort_by")] = "name",
    order: Annotated[SortOrder, Query(alias="order")] = SortOrder.asc,
) -> Page[Location]:
    return await svc.list(
        limit=page.limit,
        offset=page.offset,
        region=region,
        name_contains=name_contains,
        sort_by=sort_by,
        order=order.value,
    )


@router.get("/{location_id}", response_model=Location)
async def get_location(
    location_id: str, svc: LocationService_Dep, current_user: CurrentUserDep
) -> Location:
    return await svc.get(location_id)


@router.patch("/{location_id}", response_model=Location)
async def update_location(
    location_id: str,
    payload: LocationUpdate,
    svc: LocationService_Dep,
    current_user: CurrentUserDep,
) -> Location:
    return await svc.update(location_id, payload)


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(
    location_id: str, svc: LocationService_Dep, current_user: CurrentUserDep
) -> None:
    await svc.delete(location_id)
