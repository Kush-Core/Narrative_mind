"""Precompute the starter world's embeddings for the currently configured model.

Usage (from backend/):
    uv run python scripts/precompute_starter_world_embeddings.py

Run this once now, and again every time EMBEDDING_PROVIDER or the configured
model changes. The vectors this writes are what `WorldRepository.
seed_starter_world` stamps onto a fresh account's 27 starter entities at
registration, instead of calling the embedding provider live — see
domain/starter_world_embeddings.py for why the file is safe to skip if you
forget to regenerate it (registration just falls back to unembedded nodes,
picked up later by scripts/backfill_embeddings.py).

Touches no database — this only calls the embedding provider and writes a
JSON file next to domain/starter_world.py.
"""

import asyncio

from narrative_mind.core.config import get_settings
from narrative_mind.domain.starter_world import CHARACTERS, EVENTS, FACTIONS, LOCATIONS
from narrative_mind.domain.starter_world_embeddings import save
from narrative_mind.providers.deps import get_embedder
from narrative_mind.services.embedding_service import canonical_text

_ENTITIES: list[tuple[str, str, dict]] = (
    [
        (slug, "Location", {"name": name, "region": region, "description": desc})
        for slug, name, region, desc in LOCATIONS
    ]
    + [
        (slug, "Faction", {"name": name, "ideology": ideology, "description": desc})
        for slug, name, ideology, desc in FACTIONS
    ]
    + [
        (slug, "Event", {"name": name, "summary": summary})
        for slug, name, _order, summary in EVENTS
    ]
    + [
        (
            slug,
            "Character",
            {"name": name, "aliases": aliases, "status": status, "description": desc},
        )
        for slug, name, aliases, status, desc in CHARACTERS
    ]
)


async def main() -> int:
    settings = get_settings()
    embedder = get_embedder(settings)

    slugs = [slug for slug, _label, _entity in _ENTITIES]
    texts = [canonical_text(label, entity) for _slug, label, entity in _ENTITIES]
    vectors = await embedder.embed_documents(texts)

    embeddings = dict(zip(slugs, vectors, strict=True))
    save(embedder.model_name, embeddings)

    print(
        f"wrote {len(embeddings)} vectors for model {embedder.model_name!r} "
        f"({embedder.dimensions} dims)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
