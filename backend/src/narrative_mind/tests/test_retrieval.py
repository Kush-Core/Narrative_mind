"""RetrievalService's seed → expand → serialize pipeline.

The seed-ranking tests run against `FakeEmbeddingProvider`, which hashes text
directly with no query/document prefix asymmetry (unlike the real Ollama/
Google providers) — so "ranks sensibly" here means exact-match determinism:
querying with an entity's own canonical text reproduces its exact embedding,
giving cosine similarity 1.0. That is a property of the fake, not a claim
about real semantic search, which this suite deliberately never needs to
exercise online.

The context-cap test needs a world bigger than the small `rag_world` fixture
to actually bind, so it runs `RetrievalService` directly against fakes
instead of the live API — no database, no embedder, fast and exact.
"""

import asyncio

from fastapi.testclient import TestClient

from narrative_mind.domain.rag import RetrieveRequest
from narrative_mind.services.embedding_service import canonical_text
from narrative_mind.services.retrieval_service import RetrievalService


def _own_text(character: dict) -> str:
    """The exact canonical text a character's own embedding was built from.

    `FakeEmbeddingProvider` hashes text with no query/document prefix
    asymmetry, so feeding this back as the *question* reproduces the
    character's exact stored vector (cosine 1.0) — the only way to make a
    seed's rank deterministic against a fake that has no real semantics.
    Just the character's name, by contrast, hashes to an unrelated vector.
    """
    return canonical_text(
        "Character",
        {
            "name": character["name"],
            "aliases": character["aliases"],
            "status": character["status"],
            "description": character["description"],
        },
    )


def test_seed_ranks_the_exact_text_match_first(client: TestClient, rag_world: dict) -> None:
    character = rag_world["character"]
    result = client.post("/ai/retrieve", json={"question": _own_text(character), "top_k": 3}).json()

    assert result["seeds"][0]["id"] == character["id"]
    assert result["seeds"][0]["score"] > 0.999


def test_expansion_returns_the_induced_edge_set(client: TestClient, rag_world: dict) -> None:
    character = rag_world["character"]
    result = client.post(
        "/ai/retrieve", json={"question": _own_text(character), "top_k": 1, "depth": 1}
    ).json()

    entity_ids = {e["id"] for e in result["entities"]}
    assert rag_world["faction"]["id"] in entity_ids
    assert rag_world["location"]["id"] in entity_ids
    assert rag_world["other_character"]["id"] in entity_ids

    rel_types = {r["rel_type"] for r in result["relationships"]}
    assert {"MEMBER_OF", "LOCATED_IN", "KNOWS"} <= rel_types

    # Induced subgraph: every edge's endpoints must both be in `entities`.
    for rel in result["relationships"]:
        assert rel["source"] in entity_ids
        assert rel["target"] in entity_ids


def test_context_char_count_matches_context_length(client: TestClient, rag_world: dict) -> None:
    character = rag_world["character"]
    result = client.post("/ai/retrieve", json={"question": character["name"]}).json()
    assert result["char_count"] == len(result["context"])


class _FakeEmbedder:
    async def embed_query(self, text: str) -> list[float]:
        return [0.0]


class _FakeEmbeddingRepo:
    async def find_similar(self, query_vector: list[float], top_k: int) -> list[dict]:
        return [{"id": "seed-1", "label": "Character", "name": "Seed", "score": 1.0}][:top_k]


class _FakeGraphRepo:
    """A dense one-hop neighbourhood: 1 seed plus 10 expansion nodes, enough
    to blow past a small entity cap."""

    async def expand(self, seed_ids: list[str], depth: int) -> dict:
        nodes = [{"id": "seed-1", "name": "Seed", "labels": ["Character"]}] + [
            {"id": f"extra-{i}", "name": f"Extra {i}", "labels": ["Location"]} for i in range(10)
        ]
        return {"nodes": nodes, "relationships": []}


def test_context_entity_cap_holds() -> None:
    service = RetrievalService(
        _FakeEmbeddingRepo(),  # type: ignore[arg-type]
        _FakeGraphRepo(),  # type: ignore[arg-type]
        _FakeEmbedder(),  # type: ignore[arg-type]
        seed_top_k=1,
        expand_depth=1,
        max_context_entities=3,
    )

    result = asyncio.run(service.retrieve(RetrieveRequest(question="anything")))

    assert len(result.entities) == 3
    assert result.entities[0].id == "seed-1"  # the seed always survives the cap
    assert result.char_count == len(result.context)
