"""Graph-recall evaluation against a real Neo4j and the real `RetrievalService`.

`FakeEmbeddingProvider` throughout — no network. The determinism technique
(from `tests/test_retrieval.py`): querying with an entity's own canonical text
reproduces its exact stored vector under the fake embedder (cosine 1.0), so
`top_k=1` makes that entity the *only* seed. That is the "oracle anchor": with
the vector step pinned to a known single seed, whatever reaches the context
block is purely the work of graph expansion, so the expected recall is
derivable by hand from `domain/starter_world.py`. This proves the metric agrees
with the real pipeline; it says nothing about semantic retrieval quality, which
only `scripts/evaluate_graph_recall.py` against a real provider can.
"""

import asyncio

import pytest
from neo4j import AsyncGraphDatabase

from narrative_mind.core.config import get_settings
from narrative_mind.domain.rag import RetrievalResult
from narrative_mind.domain.starter_world import EVENTS
from narrative_mind.evaluation.dataset import EVAL_QUERIES, slug_index
from narrative_mind.evaluation.graph_recall import score_query
from narrative_mind.evaluation.runner import PreconditionError, run_graph_recall
from narrative_mind.providers.embeddings import FakeEmbeddingProvider
from narrative_mind.repositories.world_repo import WorldRepository
from narrative_mind.services.embedding_service import canonical_text


def _event_canonical_text(slug: str) -> str:
    for event_slug, name, _timeline_order, summary in EVENTS:
        if event_slug == slug:
            return canonical_text("Event", {"name": name, "summary": summary})
    raise KeyError(slug)


def _query(query_id: str):
    return next(q for q in EVAL_QUERIES if q.id == query_id)


async def _with_session(fn, *args, **kwargs):
    settings = get_settings()
    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
    )
    try:
        async with driver.session() as session:
            return await fn(session, *args, **kwargs)
    finally:
        await driver.close()


async def _seed_world_unembedded(session, owner_id: str) -> None:
    """Seed the starter world without embedding it — for the stale-embedding test."""
    await WorldRepository(session).seed_starter_world(owner_id)


def test_salt_riots_depth_1_structural_recall(client, client_owner_id, starter_world) -> None:
    query = _query("q07-salt-riots-factions")
    text = _event_canonical_text("the-salt-riots")

    response = client.post("/ai/retrieve", json={"question": text, "top_k": 1, "depth": 1})
    assert response.status_code == 200, response.text
    result = RetrievalResult(**response.json())

    row = score_query(query, result, slug_index(client_owner_id), max_context_entities=30)
    assert row.node_recall == pytest.approx(5 / 7)
    assert row.edge_recall == pytest.approx(4 / 7)


def test_salt_riots_depth_2_recovers_the_factions(client, client_owner_id, starter_world) -> None:
    query = _query("q07-salt-riots-factions")
    text = _event_canonical_text("the-salt-riots")

    response = client.post("/ai/retrieve", json={"question": text, "top_k": 1, "depth": 2})
    assert response.status_code == 200, response.text
    result = RetrievalResult(**response.json())

    row = score_query(query, result, slug_index(client_owner_id), max_context_entities=30)
    assert row.node_recall == 1.0
    assert row.missing_nodes == []
    # Edge recall is deliberately not asserted here: at depth 2 the 4000-char
    # budget in retrieval_service.py truncates the induced edge set in Cypher's
    # collect(DISTINCT r) order, which carries no stability guarantee. Exact
    # edge-recall assertions are therefore only sound at depth 1.


def test_verge_compact_depth_1_is_perfect(client, client_owner_id, starter_world) -> None:
    query = _query("q03-verge-compact-signatories")
    text = _event_canonical_text("the-verge-compact")

    response = client.post("/ai/retrieve", json={"question": text, "top_k": 1, "depth": 1})
    assert response.status_code == 200, response.text
    result = RetrievalResult(**response.json())

    row = score_query(query, result, slug_index(client_owner_id), max_context_entities=30)
    assert row.node_recall == 1.0
    assert row.edge_recall == 1.0


def test_runner_produces_a_report_over_the_whole_dataset(
    client, client_owner_id, starter_world
) -> None:
    report = asyncio.run(
        _with_session(
            run_graph_recall,
            owner_id=client_owner_id,
            account_email="runner-report@example.com",
            embedder=FakeEmbeddingProvider(),
            top_k=8,
            depth=1,
            max_context_entities=30,
        )
    )

    assert len(report.queries) == 12
    assert report.config.query_count == 12
    assert report.config.model == "fake-embedding-v1"
    assert 0.0 <= report.node_recall_macro <= 1.0
    assert 0.0 <= report.seed_recall_macro <= 1.0
    assert report.expansion_gain >= 0.0
    # The fake embedder has no semantics, so no assertion is made on the
    # actual value — this test proves the wiring, not retrieval quality.


def test_runner_refuses_an_empty_world(client, client_owner_id) -> None:
    with pytest.raises(PreconditionError):
        asyncio.run(
            _with_session(
                run_graph_recall,
                owner_id=client_owner_id,
                account_email="empty-world@example.com",
                embedder=FakeEmbeddingProvider(),
                top_k=8,
                depth=1,
                max_context_entities=30,
            )
        )


def test_runner_refuses_stale_embeddings(client, client_owner_id) -> None:
    asyncio.run(_with_session(_seed_world_unembedded, client_owner_id))

    with pytest.raises(PreconditionError, match="unembedded|different model"):
        asyncio.run(
            _with_session(
                run_graph_recall,
                owner_id=client_owner_id,
                account_email="stale-embeddings@example.com",
                embedder=FakeEmbeddingProvider(),
                top_k=8,
                depth=1,
                max_context_entities=30,
            )
        )


def test_slug_index_resolves_to_real_nodes(client_owner_id, starter_world, teardown_driver) -> None:
    index = slug_index(client_owner_id)
    assert len(index) == 27

    with teardown_driver.session() as session:
        for node_id, slug in index.items():
            record = session.run(
                "MATCH (n {id: $id, owner_id: $owner_id}) RETURN n.id AS id",
                id=node_id,
                owner_id=client_owner_id,
            ).single()
            assert record is not None, f"{slug} ({node_id}) has no matching node"
