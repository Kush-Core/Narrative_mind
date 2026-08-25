"""Orchestrates one graph-recall evaluation run: preconditions, the real
`RetrievalService` pipeline, scoring, aggregation.

In-process rather than over HTTP — this builds the exact same `RetrievalService`
object `api/deps.py:278`'s `get_retrieval_service` builds, so it evaluates the
real pipeline without a running server, a login, or token handling, matching
every existing script under `scripts/`.
"""

from datetime import UTC, datetime
from time import perf_counter

from neo4j import AsyncSession

from narrative_mind.domain.rag import RetrieveRequest
from narrative_mind.evaluation.dataset import (
    DATASET_NAME,
    EVAL_QUERIES,
    slug_index,
    validate_dataset,
)
from narrative_mind.evaluation.graph_recall import aggregate, score_query
from narrative_mind.evaluation.models import EvalQuery, GraphRecallReport, RunConfig
from narrative_mind.providers.embeddings import EmbeddingProvider
from narrative_mind.repositories.embedding_repo import EmbeddingRepository
from narrative_mind.repositories.graph_repo import GraphRepository
from narrative_mind.repositories.world_repo import WorldRepository
from narrative_mind.services.retrieval_service import RetrievalService

_EXPECTED_NODE_COUNTS = {"Character": 10, "Location": 6, "Faction": 5, "Event": 6}
_EXPECTED_EDGE_TOTAL = 69


class PreconditionError(RuntimeError):
    """Raised when the world or its embeddings aren't in a scoreable state.

    Never caught and silently downgraded to a low score — an empty world or
    stale embeddings would otherwise be misread as a retrieval-quality
    regression rather than what they are: the run wasn't valid to begin with.
    """


async def run_graph_recall(
    session: AsyncSession,
    *,
    owner_id: str,
    account_email: str,
    embedder: EmbeddingProvider,
    top_k: int,
    depth: int,
    max_context_entities: int,
    queries: tuple[EvalQuery, ...] = EVAL_QUERIES,
) -> GraphRecallReport:
    validate_dataset(queries)

    world_repo = WorldRepository(session)
    counts = await world_repo.counts(owner_id)
    for label in _EXPECTED_NODE_COUNTS:
        if counts["nodes"].get(label, 0) == 0:
            raise PreconditionError(
                f"account {account_email!r} has no {label} entities — the evaluation "
                "needs a populated world. Run `uv run python scripts/seed_world.py "
                f"{account_email}` to give it the starter world."
            )
    if (
        counts["nodes"] != _EXPECTED_NODE_COUNTS
        or sum(counts["edges"].values()) != _EXPECTED_EDGE_TOTAL
    ):
        print(
            f"warning: {account_email}'s world does not match the starter world's shape "
            f"(expected {_EXPECTED_NODE_COUNTS} / {_EXPECTED_EDGE_TOTAL} edges, "
            f"got {counts['nodes']} / {sum(counts['edges'].values())} edges) — recall "
            "numbers reflect a world that may have been edited."
        )

    embedding_repo = EmbeddingRepository(session, owner_id)
    stale = await embedding_repo.find_stale(embedder.model_name)
    if stale:
        raise PreconditionError(
            f"{len(stale)} entities are unembedded or embedded under a different model "
            f"than {embedder.model_name!r}. Run "
            "`uv run python scripts/precompute_starter_world_embeddings.py`, then "
            f"`uv run python scripts/backfill_embeddings.py {account_email}`."
        )

    graph_repo = GraphRepository(session, owner_id)
    service = RetrievalService(
        embedding_repo,
        graph_repo,
        embedder,
        seed_top_k=top_k,
        expand_depth=depth,
        max_context_entities=max_context_entities,
    )
    slug_by_id = slug_index(owner_id)

    started_at = datetime.now(UTC).isoformat()
    t0 = perf_counter()

    rows = []
    for query in queries:
        result = await service.retrieve(
            RetrieveRequest(question=query.question, top_k=top_k, depth=depth)
        )
        rows.append(
            score_query(query, result, slug_by_id, max_context_entities=max_context_entities)
        )

    duration_seconds = perf_counter() - t0

    config = RunConfig(
        dataset=DATASET_NAME,
        query_count=len(queries),
        provider=type(embedder).__name__,
        model=embedder.model_name,
        dimensions=embedder.dimensions,
        top_k=top_k,
        depth=depth,
        max_context_entities=max_context_entities,
        account_email=account_email,
        owner_id=owner_id,
        started_at=started_at,
        duration_seconds=duration_seconds,
        world_node_counts=counts["nodes"],
        world_edge_count=sum(counts["edges"].values()),
    )
    return aggregate(rows, config)
