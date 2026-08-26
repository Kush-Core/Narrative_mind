"""The graph-recall metric: node recall, edge recall, seed recall, aggregation.

Pure functions only — no I/O, no Neo4j, no provider. Same inputs always give
the same outputs. This is the module that must be provable, so it is kept
free of anything that would make it hard to test in isolation.

The metric definitions, their aggregation rules, and the decided behaviour for
every empty-set case are tabulated in the backend README under "Real Embedding
Evaluation"; `tests/test_graph_recall.py` pins each of them.

Node identity is exact-id matching through `slug_by_id` (`entity_id(owner_id,
slug)` — see `dataset.slug_index`); nothing here does name, alias, or fuzzy
matching. `RetrievalResult.entities`/`.relationships` are trusted as a
faithful proxy for the serialized context block — a guarantee `_serialize`
makes explicit in its own docstring (`services/retrieval_service.py`).
"""

from narrative_mind.domain.rag import RetrievalResult, RetrievedEntity, RetrievedRelationship
from narrative_mind.evaluation.dataset import LABEL_BY_SLUG
from narrative_mind.evaluation.models import (
    EdgeRef,
    EvalQuery,
    GraphRecallReport,
    LabelRecall,
    QueryRecall,
    RunConfig,
)

_LABELS = ("Character", "Location", "Faction", "Event")


def retrieved_slugs(entities: list[RetrievedEntity], slug_by_id: dict[str, str]) -> set[str]:
    return {slug_by_id[e.id] for e in entities if e.id in slug_by_id}


def retrieved_edges(
    relationships: list[RetrievedRelationship], slug_by_id: dict[str, str]
) -> set[EdgeRef]:
    return {
        (slug_by_id[r.source], r.rel_type, slug_by_id[r.target])
        for r in relationships
        if r.source in slug_by_id and r.target in slug_by_id
    }


def score_query(
    query: EvalQuery,
    result: RetrievalResult,
    slug_by_id: dict[str, str],
    *,
    max_context_entities: int,
) -> QueryRecall:
    ref_nodes = set(query.reference_nodes)
    ref_edges = set(query.reference_edges)

    got_entities = retrieved_slugs(result.entities, slug_by_id)
    got_seeds = retrieved_slugs(result.seeds, slug_by_id)
    got_edges = retrieved_edges(result.relationships, slug_by_id)

    matched_nodes = ref_nodes & got_entities
    matched_edges = ref_edges & got_edges

    node_recall = len(matched_nodes) / len(ref_nodes)
    seed_recall = len(ref_nodes & got_seeds) / len(ref_nodes)
    edge_recall = (len(matched_edges) / len(ref_edges)) if ref_edges else None

    return QueryRecall(
        query_id=query.id,
        question=query.question,
        node_recall=node_recall,
        edge_recall=edge_recall,
        seed_recall=seed_recall,
        reference_node_count=len(ref_nodes),
        matched_node_count=len(matched_nodes),
        reference_edge_count=len(ref_edges),
        matched_edge_count=len(matched_edges),
        matched_nodes=sorted(matched_nodes),
        missing_nodes=sorted(ref_nodes - got_entities),
        missing_edges=sorted(ref_edges - got_edges),
        has_anchors=bool(query.anchors),
        anchors_hit=set(query.anchors) <= got_seeds,
        retrieved_entity_count=len(result.entities),
        retrieved_relationship_count=len(result.relationships),
        context_chars=result.char_count,
        entity_cap_reached=len(result.entities) >= max_context_entities,
    )


def _per_label_recall(rows: list[QueryRecall]) -> list[LabelRecall]:
    """Micro node recall restricted to reference nodes of each label.

    Pools `matched_nodes` and `missing_nodes` by label via `LABEL_BY_SLUG`
    (every reference slug is one or the other, never both), so a systematic
    per-label bias — e.g. Event, which embeds no attribute line
    (`services/embedding_service.py:9-13`) — is visible rather than buried in
    the aggregate macro number. Labels with no reference nodes are omitted.
    """
    matched_by_label: dict[str, int] = dict.fromkeys(_LABELS, 0)
    total_by_label: dict[str, int] = dict.fromkeys(_LABELS, 0)

    for row in rows:
        for slug in row.matched_nodes:
            label = LABEL_BY_SLUG.get(slug)
            if label is not None:
                matched_by_label[label] += 1
                total_by_label[label] += 1
        for slug in row.missing_nodes:
            label = LABEL_BY_SLUG.get(slug)
            if label is not None:
                total_by_label[label] += 1

    return [
        LabelRecall(
            label=label,
            matched=matched_by_label[label],
            total=total_by_label[label],
            recall=matched_by_label[label] / total_by_label[label],
        )
        for label in _LABELS
        if total_by_label[label] > 0
    ]


def aggregate(rows: list[QueryRecall], config: RunConfig) -> GraphRecallReport:
    node_recall_macro = sum(r.node_recall for r in rows) / len(rows)
    node_recall_micro = sum(r.matched_node_count for r in rows) / sum(
        r.reference_node_count for r in rows
    )

    edge_scored = [r for r in rows if r.edge_recall is not None]
    if edge_scored:
        edge_recall_macro = sum(r.edge_recall for r in edge_scored) / len(edge_scored)  # type: ignore[operator]
        edge_recall_micro = sum(r.matched_edge_count for r in edge_scored) / sum(
            r.reference_edge_count for r in edge_scored
        )
    else:
        edge_recall_macro = None
        edge_recall_micro = None

    seed_recall_macro = sum(r.seed_recall for r in rows) / len(rows)
    expansion_gain = node_recall_macro - seed_recall_macro

    anchored_rows = [r for r in rows if r.has_anchors]
    anchor_hit_rate = (
        sum(1 for r in anchored_rows if r.anchors_hit) / len(anchored_rows)
        if anchored_rows
        else 0.0
    )

    mean_retrieved_entities = sum(r.retrieved_entity_count for r in rows) / len(rows)
    mean_retrieved_relationships = sum(r.retrieved_relationship_count for r in rows) / len(rows)
    mean_context_chars = sum(r.context_chars for r in rows) / len(rows)
    entity_cap_reached_count = sum(1 for r in rows if r.entity_cap_reached)

    return GraphRecallReport(
        config=config,
        queries=rows,
        node_recall_macro=node_recall_macro,
        node_recall_micro=node_recall_micro,
        edge_recall_macro=edge_recall_macro,
        edge_recall_micro=edge_recall_micro,
        edge_scored_query_count=len(edge_scored),
        seed_recall_macro=seed_recall_macro,
        expansion_gain=expansion_gain,
        anchor_hit_rate=anchor_hit_rate,
        per_label=_per_label_recall(rows),
        mean_retrieved_entities=mean_retrieved_entities,
        mean_retrieved_relationships=mean_retrieved_relationships,
        mean_context_chars=mean_context_chars,
        entity_cap_reached_count=entity_cap_reached_count,
    )
