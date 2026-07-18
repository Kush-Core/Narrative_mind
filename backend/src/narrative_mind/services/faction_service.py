from narrative_mind.core.exceptions import NotFoundError
from narrative_mind.domain.common import Page
from narrative_mind.domain.faction import Faction, FactionCreate, FactionUpdate
from narrative_mind.repositories.faction_repo import FactionRepository


class FactionService:
    def __init__(self, repo: FactionRepository) -> None:
        self._repo = repo

    async def create(self, payload: FactionCreate) -> Faction:
        faction = Faction(**payload.model_dump())
        row = await self._repo.create(faction.model_dump())
        return Faction.model_validate(row)

    async def get(self, faction_id: str) -> Faction:
        row = await self._repo.get(faction_id)
        if row is None:
            raise NotFoundError(f"Faction with id {faction_id} not found")
        return Faction.model_validate(row)

    async def list(
        self,
        *,
        limit: int,
        offset: int,
        ideology: str | None,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> Page[Faction]:
        rows, total = await self._repo.Faction_list(
            limit=limit,
            offset=offset,
            ideology=ideology,
            name_contains=name_contains,
            sort_by=sort_by,
            order=order,
        )
        return Page[Faction](
            items=[Faction.model_validate(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def update(self, faction_id: str, payload: FactionUpdate) -> Faction:
        props = payload.model_dump(exclude_none=True)
        row = await self._repo.update(faction_id, props)
        if row is None:
            raise NotFoundError(f"Faction with id {faction_id} not found")
        return Faction.model_validate(row)

    async def delete(self, faction_id: str) -> None:
        deleted = await self._repo.delete(faction_id)
        if not deleted:
            raise NotFoundError(f"Faction with id {faction_id} not present, cannot delete")
