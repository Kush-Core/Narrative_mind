from typing import Any

from narrative_mind.providers.embeddings import EmbeddingProvider
from narrative_mind.repositories.embedding_repo import EmbeddingRepository

# Which property holds each label's one distinguishing attribute line, beyond
# name and description. Event has none — a timeline position isn't semantic
# text, so it's left out of the embedding on purpose.
_ATTRIBUTE_FIELDS = {
    "Character": "status",
    "Location": "region",
    "Faction": "ideology",
}


def canonical_text(label: str, entity: dict[str, Any]) -> str:
    """The one deterministic string a label+entity always embeds to.

    Module-level rather than a method so every caller builds the exact same
    string for the exact same entity: the per-entity reindex hooks, the bulk
    backfill script, and `scripts/precompute_starter_world_embeddings.py`
    alike. If this logic were duplicated across them, the copies would drift.
    """
    name = entity.get("name") or ""
    aliases = entity.get("aliases") or []
    header = f"{name} ({', '.join(aliases)})." if aliases else f"{name}."

    lines = [header]

    attribute_field = _ATTRIBUTE_FIELDS.get(label)
    if attribute_field:
        value = entity.get(attribute_field)
        if value:
            lines.append(f"{attribute_field.capitalize()}: {value}.")

    body = entity.get("description") or entity.get("summary")
    if body:
        lines.append(body)

    return " ".join(lines)


class EmbeddingService:
    """Turns an entity's own fields into a vector and persists it."""

    def __init__(self, repo: EmbeddingRepository, provider: EmbeddingProvider) -> None:
        self._repo = repo
        self._provider = provider

    async def reindex(self, label: str, entity: dict[str, Any]) -> None:
        """Embed and persist a single entity. Called synchronously from the
        create/update path — see the Phase 3 plan on why this can't be a
        background task."""
        text = canonical_text(label, entity)
        [vector] = await self._provider.embed_documents([text])
        await self._repo.write_embedding(entity["id"], vector, self._provider.model_name)

    async def backfill(self) -> int:
        """Embed every entity for this owner that is missing a vector or was
        embedded under a different model. Returns how many were written."""
        stale = await self._repo.find_stale(self._provider.model_name)
        if not stale:
            return 0

        texts = [canonical_text(entity["label"], entity) for entity in stale]
        vectors = await self._provider.embed_documents(texts)

        for entity, vector in zip(stale, vectors, strict=True):
            await self._repo.write_embedding(entity["id"], vector, self._provider.model_name)

        return len(stale)
