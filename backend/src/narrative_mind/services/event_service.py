from narrative_mind.core.exceptions import NotFoundError
from narrative_mind.domain.common import Page
from narrative_mind.domain.event import Event, EventCreate, EventUpdate
from narrative_mind.repositories.event_repo import EventRepository
from narrative_mind.services.embedding_service import EmbeddingService


class EventService:
    def __init__(self, repo: EventRepository, embedding_service: EmbeddingService) -> None:
        self._repo = repo
        self._embedding_service = embedding_service

    async def create(self, payload: EventCreate) -> Event:
        event = Event(**payload.model_dump())
        row = await self._repo.create(event.model_dump())
        created = Event.model_validate(row)
        await self._embedding_service.reindex("Event", created.model_dump())
        return created

    async def get(self, event_id: str) -> Event:
        row = await self._repo.get(event_id)
        if row is None:
            raise NotFoundError(f"Event with id {event_id} not found")
        return Event.model_validate(row)

    async def list(
        self,
        *,
        limit: int,
        offset: int,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> Page[Event]:
        rows, total = await self._repo.Event_list(
            limit=limit,
            offset=offset,
            name_contains=name_contains,
            sort_by=sort_by,
            order=order,
        )
        return Page[Event](
            items=[Event.model_validate(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def update(self, event_id: str, payload: EventUpdate) -> Event:
        props = payload.model_dump(exclude_none=True)
        row = await self._repo.update(event_id, props)
        if row is None:
            raise NotFoundError(f"Event with id {event_id} not found")
        updated = Event.model_validate(row)
        await self._embedding_service.reindex("Event", updated.model_dump())
        return updated

    async def delete(self, event_id: str) -> None:
        deleted = await self._repo.delete(event_id)
        if not deleted:
            raise NotFoundError(f"Event with id {event_id} not present, cannot delete")
