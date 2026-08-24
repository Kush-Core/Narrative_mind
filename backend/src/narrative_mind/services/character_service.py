from narrative_mind.core.exceptions import NotFoundError
from narrative_mind.domain.character import Character, CharacterCreate, CharacterUpdate
from narrative_mind.domain.common import Page
from narrative_mind.repositories.character_repo import CharacterRepository
from narrative_mind.services.embedding_service import EmbeddingService


class CharacterService:
    def __init__(self, repo: CharacterRepository, embedding_service: EmbeddingService) -> None:
        self._repo = repo
        self._embedding_service = embedding_service

    async def create(self, payload: CharacterCreate) -> Character:
        character = Character(**payload.model_dump())
        row = await self._repo.create(character.model_dump(exclude={"display_name"}))
        created = Character.model_validate(row)
        await self._embedding_service.reindex(
            "Character", created.model_dump(exclude={"display_name"})
        )
        return created

    async def get(self, character_id: str) -> Character:
        row = await self._repo.get(character_id)
        if row is None:
            raise NotFoundError(f"Character with id {character_id} not found")
        return Character.model_validate(row)

    async def list(
        self,
        *,
        limit: int,
        offset: int,
        status: str | None,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> Page[Character]:
        rows, total = await self._repo.Character_list(
            limit=limit,
            offset=offset,
            status=status,
            name_contains=name_contains,
            sort_by=sort_by,
            order=order,
        )
        return Page[Character](
            items=[Character.model_validate(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    async def update(self, character_id: str, payload: CharacterUpdate) -> Character:
        props = payload.model_dump(exclude_none=True)
        row = await self._repo.update(character_id, props)
        if row is None:
            raise NotFoundError(f"Character with id {character_id} not found")
        updated = Character.model_validate(row)
        await self._embedding_service.reindex(
            "Character", updated.model_dump(exclude={"display_name"})
        )
        return updated

    async def delete(self, character_id: str) -> None:
        deleted = await self._repo.delete(character_id)
        if not deleted:
            raise NotFoundError(f"Character with id {character_id} not present, cannot delete")
