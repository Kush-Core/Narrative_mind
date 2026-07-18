from typing import Any

from narrative_mind.core.exceptions import NotFoundError, ValidationError
from narrative_mind.domain.character import CharacterRelationshipCreate
from narrative_mind.repositories.graph_repo import GraphRepository


class GraphService:
    _ALLOWED_REL_TYPES = {"KNOWS", "MEMBER_OF", "LOCATED_IN", "PARTICIPATED_IN"}

    def __init__(self, repo: GraphRepository) -> None:
        self._repo = repo

    async def link(self, character_id: str, payload: CharacterRelationshipCreate) -> dict[str, Any]:
        rel_type = payload.rel_type.strip().upper()
        if rel_type not in self._ALLOWED_REL_TYPES:
            raise ValidationError(f"Unsupported relationship type: {payload.rel_type}")
        if not await self._repo.node_exists(character_id):
            raise NotFoundError(f"Character with id {character_id} not found")
        if not await self._repo.node_exists(payload.target_id):
            raise NotFoundError(f"Target with id {payload.target_id} not found")
        relationship = await self._repo.link(
            character_id, rel_type, payload.target_id, payload.sentiment
        )
        if relationship is None:
            raise NotFoundError(f"Character with id {character_id} not found")
        return relationship

    async def get_network(self, character_id: str, depth: int) -> dict[str, Any]:
        network = await self._repo.ego_network(character_id, depth)
        if network is None:
            raise NotFoundError(f"Character with id {character_id} not found")
        return network

    async def shortest_path(self, source: str, target: str) -> dict[str, Any]:
        path = await self._repo.shortest_path(source, target)
        if path is None:
            raise NotFoundError(f"No path found between {source} and {target}")
        return path
