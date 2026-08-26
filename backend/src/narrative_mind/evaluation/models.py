"""Result and dataset shapes for the graph-recall evaluation harness.

Leaf module — imports only `pydantic`, so `dataset.py`, `graph_recall.py`,
`runner.py`, and `report.py` can all type against it without a cycle.
"""

from pydantic import BaseModel, ConfigDict

EdgeRef = tuple[str, str, str]  # (source_slug, rel_type, target_slug)


class EvalQuery(BaseModel):
    """One hand-annotated question over the starter world.

    `rule` records the structural justification for `reference_nodes`/
    `reference_edges` so the annotation stays auditable rather than an opaque
    literal — see `dataset.py` for how each one was derived.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    question: str
    reference_nodes: tuple[str, ...]
    reference_edges: tuple[EdgeRef, ...] = ()
    anchors: tuple[str, ...] = ()
    rule: str


class RunConfig(BaseModel):
    dataset: str
    query_count: int
    provider: str
    model: str
    dimensions: int
    top_k: int
    depth: int
    max_context_entities: int
    account_email: str
    owner_id: str
    started_at: str
    duration_seconds: float
    world_node_counts: dict[str, int]  # from WorldRepository.counts — the precondition check
    world_edge_count: int


class QueryRecall(BaseModel):
    query_id: str
    question: str
    node_recall: float
    edge_recall: float | None  # None ⇔ |E_q| == 0
    seed_recall: float
    reference_node_count: int
    matched_node_count: int
    reference_edge_count: int
    matched_edge_count: int
    matched_nodes: list[str]  # sorted; paired with missing_nodes, drives per-label recall
    missing_nodes: list[str]
    missing_edges: list[EdgeRef]
    has_anchors: bool  # False ⇔ the query declared no anchors (e.g. q11)
    anchors_hit: bool  # vacuously True when has_anchors is False; excluded by has_anchors
    retrieved_entity_count: int
    retrieved_relationship_count: int
    context_chars: int
    entity_cap_reached: bool


class LabelRecall(BaseModel):
    label: str
    matched: int
    total: int
    recall: float


class GraphRecallReport(BaseModel):
    config: RunConfig
    queries: list[QueryRecall]
    node_recall_macro: float
    node_recall_micro: float
    edge_recall_macro: float | None
    edge_recall_micro: float | None
    edge_scored_query_count: int
    seed_recall_macro: float
    expansion_gain: float
    anchor_hit_rate: float
    per_label: list[LabelRecall]
    mean_retrieved_entities: float
    mean_retrieved_relationships: float
    mean_context_chars: float
    entity_cap_reached_count: int
