"""The graph-recall evaluation harness: pure-function metric tests and dataset
validation. No database, no network, no event loop — runs standalone like
`test_pydantic_models.py`.
"""

import pytest

from narrative_mind.domain.rag import RetrievalResult, RetrievedEntity, RetrievedRelationship
from narrative_mind.domain.starter_world import CHARACTERS, EVENTS, FACTIONS, LOCATIONS, entity_id
from narrative_mind.evaluation.dataset import (
    ALL_SLUGS,
    EVAL_QUERIES,
    SEED_EDGES,
    slug_index,
    validate_dataset,
)
from narrative_mind.evaluation.graph_recall import aggregate, score_query
from narrative_mind.evaluation.models import EvalQuery, RunConfig

# --- dataset integrity -------------------------------------------------------


def test_dataset_validates() -> None:
    validate_dataset()


def test_every_reference_node_exists_in_the_starter_world() -> None:
    for query in EVAL_QUERIES:
        for slug in query.reference_nodes:
            assert slug in ALL_SLUGS, f"{query.id}: unknown slug {slug!r}"


def test_every_reference_edge_exists_in_the_starter_world() -> None:
    for query in EVAL_QUERIES:
        for edge in query.reference_edges:
            assert edge in SEED_EDGES, f"{query.id}: edge {edge!r} not in the seed world"


def test_no_query_has_an_empty_reference_node_set() -> None:
    for query in EVAL_QUERIES:
        assert len(query.reference_nodes) >= 1, f"{query.id} has an empty reference node set"


def test_query_ids_are_unique() -> None:
    ids = [query.id for query in EVAL_QUERIES]
    assert len(ids) == len(set(ids)) == 12


def test_validator_rejects_an_unknown_slug() -> None:
    bad = (
        EvalQuery(
            id="bad-unknown-slug",
            question="?",
            reference_nodes=("not-a-real-slug",),
            rule="test",
        ),
    )
    with pytest.raises(ValueError, match="unknown reference node slug"):
        validate_dataset(bad)


def test_validator_rejects_a_reversed_edge() -> None:
    bad = (
        EvalQuery(
            id="bad-reversed-edge",
            question="?",
            reference_nodes=("kestrel-order", "roderic-kell"),
            reference_edges=(("kestrel-order", "MEMBER_OF", "roderic-kell"),),
            rule="test",
        ),
    )
    with pytest.raises(ValueError, match="not found in the seed world"):
        validate_dataset(bad)


def test_validator_rejects_an_empty_reference_node_set() -> None:
    bad = (EvalQuery(id="bad-empty-nodes", question="?", reference_nodes=(), rule="test"),)
    with pytest.raises(ValueError, match="must not be empty"):
        validate_dataset(bad)


def test_slug_index_is_stable_across_calls() -> None:
    owner_id = "some-owner-id"
    assert slug_index(owner_id) == slug_index(owner_id)
    assert slug_index(owner_id)[entity_id(owner_id, "mira-solenne")] == "mira-solenne"


def test_starter_world_shape_is_unchanged() -> None:
    assert len(LOCATIONS) == 6
    assert len(FACTIONS) == 5
    assert len(EVENTS) == 6
    assert len(CHARACTERS) == 10
    assert len(ALL_SLUGS) == 27
    assert len(SEED_EDGES) == 69


# --- unit tests: the pure metric -------------------------------------------
#
# Hand-built RetrievalResult / EvalQuery objects. Slugs here are arbitrary
# test identifiers, not real starter-world slugs — score_query and aggregate
# never check membership in ALL_SLUGS (only validate_dataset does), so
# nothing here touches the seed data.


def _entity(id_: str, label: str = "Character", score: float | None = None) -> RetrievedEntity:
    return RetrievedEntity(id=id_, label=label, name=id_, score=score)


def _rel(
    source: str, rel_type: str, target: str, sentiment: str | None = None
) -> RetrievedRelationship:
    return RetrievedRelationship(
        source=source, target=target, rel_type=rel_type, sentiment=sentiment
    )


def _result(
    *,
    seeds: list[RetrievedEntity],
    entities: list[RetrievedEntity],
    relationships: list[RetrievedRelationship],
) -> RetrievalResult:
    return RetrievalResult(
        seeds=seeds, entities=entities, relationships=relationships, context="", char_count=0
    )


def _config(query_count: int = 1) -> RunConfig:
    return RunConfig(
        dataset="test-dataset",
        query_count=query_count,
        provider="fake",
        model="fake-embedding-v1",
        dimensions=1,
        top_k=1,
        depth=1,
        max_context_entities=30,
        account_email="test@example.com",
        owner_id="owner-id",
        started_at="2026-01-01T00:00:00+00:00",
        duration_seconds=0.0,
        world_node_counts={"Character": 10, "Location": 6, "Faction": 5, "Event": 6},
        world_edge_count=69,
    )


def test_perfect_recall_scores_one() -> None:
    query = EvalQuery(
        id="q-perfect",
        question="?",
        reference_nodes=("kestrel-order", "roderic-kell", "garen-coldwater"),
        reference_edges=(
            ("roderic-kell", "MEMBER_OF", "kestrel-order"),
            ("garen-coldwater", "MEMBER_OF", "kestrel-order"),
        ),
        rule="test",
    )
    slug_by_id = {
        "id-order": "kestrel-order",
        "id-rod": "roderic-kell",
        "id-garen": "garen-coldwater",
    }
    result = _result(
        seeds=[_entity("id-order", "Faction", score=0.9)],
        entities=[_entity("id-order", "Faction"), _entity("id-rod"), _entity("id-garen")],
        relationships=[
            _rel("id-rod", "MEMBER_OF", "id-order"),
            _rel("id-garen", "MEMBER_OF", "id-order"),
        ],
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.node_recall == 1.0
    assert row.edge_recall == 1.0


def test_partial_node_recall() -> None:
    query = EvalQuery(
        id="q-partial", question="?", reference_nodes=("a", "b", "c", "d"), rule="test"
    )
    slug_by_id = {"id-a": "a", "id-b": "b", "id-c": "c", "id-d": "d"}
    result = _result(
        seeds=[], entities=[_entity("id-a"), _entity("id-b"), _entity("id-c")], relationships=[]
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.node_recall == 0.75
    assert row.missing_nodes == ["d"]


def test_missing_relationship_lowers_edge_recall_only() -> None:
    query = EvalQuery(
        id="q-missing-edge",
        question="?",
        reference_nodes=("a", "b"),
        reference_edges=(("a", "KNOWS", "b"), ("b", "KNOWS", "a")),
        rule="test",
    )
    slug_by_id = {"id-a": "a", "id-b": "b"}
    result = _result(
        seeds=[],
        entities=[_entity("id-a"), _entity("id-b")],
        relationships=[_rel("id-a", "KNOWS", "id-b")],
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.node_recall == 1.0
    assert row.edge_recall == 0.5


def test_edge_direction_is_significant() -> None:
    query = EvalQuery(
        id="q-direction",
        question="?",
        reference_nodes=("a", "b"),
        reference_edges=(("a", "KNOWS", "b"),),
        rule="test",
    )
    slug_by_id = {"id-a": "a", "id-b": "b"}
    result = _result(
        seeds=[],
        entities=[_entity("id-a"), _entity("id-b")],
        relationships=[_rel("id-b", "KNOWS", "id-a")],
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.edge_recall == 0.0


def test_sentiment_is_not_part_of_edge_identity() -> None:
    query = EvalQuery(
        id="q-sentiment",
        question="?",
        reference_nodes=("a", "b"),
        reference_edges=(("a", "KNOWS", "b"),),
        rule="test",
    )
    slug_by_id = {"id-a": "a", "id-b": "b"}
    result = _result(
        seeds=[],
        entities=[_entity("id-a"), _entity("id-b")],
        relationships=[_rel("id-a", "KNOWS", "id-b", sentiment="hostile")],
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.edge_recall == 1.0


def test_empty_reference_edges_yields_none_not_zero() -> None:
    query = EvalQuery(id="q-no-edges", question="?", reference_nodes=("a",), rule="test")
    slug_by_id = {"id-a": "a"}
    result = _result(seeds=[], entities=[_entity("id-a")], relationships=[])
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.edge_recall is None

    report = aggregate([row], _config())
    assert report.edge_recall_macro is None
    assert report.edge_recall_micro is None
    assert report.edge_scored_query_count == 0


def test_empty_retrieved_graph_scores_zero() -> None:
    query = EvalQuery(
        id="q-empty",
        question="?",
        reference_nodes=("a", "b"),
        reference_edges=(("a", "KNOWS", "b"),),
        rule="test",
    )
    slug_by_id = {"id-a": "a", "id-b": "b"}
    result = _result(seeds=[], entities=[], relationships=[])
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.node_recall == 0.0
    assert row.edge_recall == 0.0


def test_duplicate_retrieved_entities_are_idempotent() -> None:
    query = EvalQuery(id="q-dup", question="?", reference_nodes=("a", "b"), rule="test")
    slug_by_id = {"id-a": "a", "id-b": "b"}
    once = _result(seeds=[], entities=[_entity("id-a")], relationships=[])
    twice = _result(seeds=[], entities=[_entity("id-a"), _entity("id-a")], relationships=[])
    row_once = score_query(query, once, slug_by_id, max_context_entities=30)
    row_twice = score_query(query, twice, slug_by_id, max_context_entities=30)
    assert row_once.node_recall == row_twice.node_recall
    assert row_twice.retrieved_entity_count == 2  # cost axis counts what was actually serialized


def test_unknown_ids_are_ignored() -> None:
    query = EvalQuery(id="q-unknown", question="?", reference_nodes=("a",), rule="test")
    slug_by_id = {"id-a": "a"}
    result = _result(
        seeds=[], entities=[_entity("id-a"), _entity("id-outside-world")], relationships=[]
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.node_recall == 1.0


def test_macro_and_micro_differ_on_uneven_reference_sizes() -> None:
    small = EvalQuery(id="q-small", question="?", reference_nodes=("a",), rule="test")
    big = EvalQuery(
        id="q-big", question="?", reference_nodes=tuple(f"n{i}" for i in range(7)), rule="test"
    )
    small_slug_by_id = {"id-a": "a"}
    big_slug_by_id = {f"id-n{i}": f"n{i}" for i in range(7)}

    row_small = score_query(
        small,
        _result(seeds=[], entities=[], relationships=[]),
        small_slug_by_id,
        max_context_entities=30,
    )
    row_big = score_query(
        big,
        _result(seeds=[], entities=[_entity(f"id-n{i}") for i in range(6)], relationships=[]),
        big_slug_by_id,
        max_context_entities=30,
    )

    report = aggregate([row_small, row_big], _config(query_count=2))
    assert report.node_recall_macro == pytest.approx((0.0 + 6 / 7) / 2)
    assert report.node_recall_micro == pytest.approx((0 + 6) / (1 + 7))
    assert report.node_recall_macro != report.node_recall_micro


def test_edge_aggregate_excludes_unscored_queries() -> None:
    with_edges = EvalQuery(
        id="q-with-edges",
        question="?",
        reference_nodes=("a", "b"),
        reference_edges=(("a", "KNOWS", "b"),),
        rule="test",
    )
    without_edges = EvalQuery(
        id="q-without-edges", question="?", reference_nodes=("c",), rule="test"
    )
    slug_by_id = {"id-a": "a", "id-b": "b", "id-c": "c"}

    row_with = score_query(
        with_edges,
        _result(
            seeds=[],
            entities=[_entity("id-a"), _entity("id-b")],
            relationships=[_rel("id-a", "KNOWS", "id-b")],
        ),
        slug_by_id,
        max_context_entities=30,
    )
    row_without = score_query(
        without_edges,
        _result(seeds=[], entities=[_entity("id-c")], relationships=[]),
        slug_by_id,
        max_context_entities=30,
    )

    report = aggregate([row_with, row_without], _config(query_count=2))
    assert report.edge_scored_query_count == 1
    assert report.edge_recall_macro == 1.0


def test_edge_aggregate_is_none_when_no_query_has_edges() -> None:
    q1 = EvalQuery(id="q1", question="?", reference_nodes=("a",), rule="test")
    q2 = EvalQuery(id="q2", question="?", reference_nodes=("b",), rule="test")
    slug_by_id = {"id-a": "a", "id-b": "b"}

    row1 = score_query(
        q1,
        _result(seeds=[], entities=[_entity("id-a")], relationships=[]),
        slug_by_id,
        max_context_entities=30,
    )
    row2 = score_query(
        q2,
        _result(seeds=[], entities=[_entity("id-b")], relationships=[]),
        slug_by_id,
        max_context_entities=30,
    )

    report = aggregate([row1, row2], _config(query_count=2))
    assert report.edge_recall_macro is None
    assert report.edge_recall_micro is None


def test_expansion_gain_is_non_negative() -> None:
    query = EvalQuery(id="q-expand", question="?", reference_nodes=("a", "b"), rule="test")
    slug_by_id = {"id-a": "a", "id-b": "b"}
    result = _result(
        seeds=[_entity("id-a", score=0.9)],
        entities=[_entity("id-a"), _entity("id-b")],
        relationships=[],
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    report = aggregate([row], _config())
    assert report.expansion_gain >= 0.0
    assert report.expansion_gain == pytest.approx(
        report.node_recall_macro - report.seed_recall_macro
    )


def test_seed_recall_uses_seeds_not_entities() -> None:
    query = EvalQuery(
        id="q-seed-vs-entities", question="?", reference_nodes=("a", "b"), rule="test"
    )
    slug_by_id = {"id-a": "a", "id-b": "b"}
    result = _result(
        seeds=[_entity("id-a", score=0.9)],
        entities=[_entity("id-a"), _entity("id-b")],
        relationships=[],
    )
    row = score_query(query, result, slug_by_id, max_context_entities=30)
    assert row.node_recall == 1.0
    assert row.seed_recall == 0.5


def test_entity_cap_reached_flag() -> None:
    query = EvalQuery(id="q-cap", question="?", reference_nodes=("a",), rule="test")
    slug_by_id = {"id-a": "a", "id-b": "b", "id-c": "c"}

    over = _result(
        seeds=[], entities=[_entity("id-a"), _entity("id-b"), _entity("id-c")], relationships=[]
    )
    row_over = score_query(query, over, slug_by_id, max_context_entities=3)
    assert row_over.entity_cap_reached is True

    under = _result(seeds=[], entities=[_entity("id-a")], relationships=[])
    row_under = score_query(query, under, slug_by_id, max_context_entities=3)
    assert row_under.entity_cap_reached is False
