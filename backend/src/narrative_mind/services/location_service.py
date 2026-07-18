from narrative_mind.core.exceptions import NotFoundError
from narrative_mind.domain.common import Page
from narrative_mind.domain.location import Location, LocationCreate, LocationUpdate
from narrative_mind.repositories.location_repo import LocationRepository


class LocationService:
    def __init__(self, repo: LocationRepository) -> None:
        self._repo = repo

    async def create(self, payload: LocationCreate) -> Location:
        location = Location(**payload.model_dump())
        row = await self._repo.create(location.model_dump())
        return Location.model_validate(row)

    async def get(self, location_id: str) -> Location:
        row = await self._repo.get(location_id)
        if row is None:
            raise NotFoundError(f"Location with id {location_id} not found")
        return Location.model_validate(row)

    async def list(
        self,
        *,
        limit: int,
        offset: int,
        region: str | None,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> Page[Location]:
        rows, total = await self._repo.Location_list(
            limit=limit,
            offset=offset,
            region=region,
            name_contains=name_contains,
            sort_by=sort_by,
            order=order,
        )
        return Page[Location](
            items=[Location.model_validate(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def update(self, location_id: str, payload: LocationUpdate) -> Location:
        props = payload.model_dump(exclude_none=True)
        row = await self._repo.update(location_id, props)
        if row is None:
            raise NotFoundError(f"Location with id {location_id} not found")
        return Location.model_validate(row)

    async def delete(self, location_id: str) -> None:
        deleted = await self._repo.delete(location_id)
        if not deleted:
            raise NotFoundError(f"Location with id {location_id} not present, cannot delete")
