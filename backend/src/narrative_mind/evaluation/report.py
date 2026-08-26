"""Renders a `GraphRecallReport` as the fixed-format text the CLI prints.

Presentation only — no computation happens here. Rules that matter: `---`
(never `0.000`) marks an undefined edge recall, the primary metric is
visually flagged, and the cost axis is always printed beside the recall
block. That last one exists because the metric is recall-only by design: with
no precision term, a recall gain bought purely with context bloat would
otherwise look like an improvement.
"""

from narrative_mind.evaluation.models import GraphRecallReport, QueryRecall

_RULE = "\N{BOX DRAWINGS LIGHT HORIZONTAL}" * 67


def _fmt(value: float | None) -> str:
    return f"{value:.3f}" if value is not None else "---"


def _query_row(row: QueryRecall) -> str:
    return (
        f"{row.query_id:<36} {row.node_recall:>6.3f} {_fmt(row.edge_recall):>7} "
        f"{row.seed_recall:>6.3f} {row.retrieved_entity_count:>5} "
        f"{row.retrieved_relationship_count:>6} {row.context_chars:>6}"
    )


def render_text(report: GraphRecallReport) -> str:
    config = report.config
    lines: list[str] = []

    lines.append("Graph Recall Evaluation")
    lines.append(_RULE)
    lines.append(f"Provider      {config.provider}")
    lines.append(f"Model         {config.model} ({config.dimensions}d)")
    lines.append(f"Account       {config.account_email}")
    world_str = " / ".join(f"{label} {count}" for label, count in config.world_node_counts.items())
    lines.append(f"World         starter-world · {world_str} · {config.world_edge_count} edges")
    lines.append(f"Dataset       {config.dataset}")
    lines.append(f"Examples      {config.query_count} queries")
    lines.append(f"Top-K         {config.top_k}")
    lines.append(f"Depth         {config.depth}")
    lines.append(f"Max context   {config.max_context_entities} entities")
    lines.append(f"Started       {config.started_at}")
    lines.append(f"Duration      {config.duration_seconds:.2f}s")
    lines.append("")

    lines.append(
        f"{'query':<36} {'node':>6} {'edge':>7} {'seed':>6} {'ents':>5} {'edges':>6} {'chars':>6}"
    )
    for row in report.queries:
        lines.append(_query_row(row))
    lines.append("")

    lines.append(
        f"Graph Recall (node, macro)          {report.node_recall_macro:.3f}        <-- PRIMARY"
    )
    lines.append(f"Graph Recall (node, micro)          {report.node_recall_micro:.3f}")
    edge_macro_str = _fmt(report.edge_recall_macro)
    lines.append(
        f"Edge recall (macro)                 {edge_macro_str}        "
        f"({report.edge_scored_query_count} of {len(report.queries)} queries scored)"
    )
    lines.append(f"Edge recall (micro)                 {_fmt(report.edge_recall_micro)}")
    lines.append(f"Seed recall (macro)                 {report.seed_recall_macro:.3f}")
    lines.append(
        f"Expansion gain                      {report.expansion_gain:+.3f}        "
        "graph expansion over vector search alone"
    )
    lines.append(f"Anchor hit rate                     {report.anchor_hit_rate:.3f}")
    lines.append("")

    per_label_str = " | ".join(
        f"{label.label} {label.matched} {label.recall:.3f}" for label in report.per_label
    )
    lines.append(f"Per label (micro)   {per_label_str}")
    lines.append("")

    lines.append(
        f"Context cost        {report.mean_retrieved_entities:.1f} entities / "
        f"{report.mean_retrieved_relationships:.1f} edges / "
        f"{report.mean_context_chars:.0f} chars per query"
    )
    lines.append(
        f"                    entity cap reached on {report.entity_cap_reached_count} "
        f"of {len(report.queries)} queries"
    )
    lines.append("")

    failing = [row for row in report.queries if row.missing_nodes or row.missing_edges]
    if failing:
        lines.append("Missing")
        for row in failing:
            if row.missing_nodes:
                lines.append(f"  {row.query_id}  nodes: {', '.join(row.missing_nodes)}")
            if row.missing_edges:
                prefix = "       edges: " if row.missing_nodes else f"  {row.query_id}  edges: "
                edge_lines = [f"{s} -{t}-> {o}" for s, t, o in row.missing_edges]
                lines.append(prefix + edge_lines[0])
                for edge_line in edge_lines[1:]:
                    lines.append(" " * len(prefix) + edge_line)

    return "\n".join(lines)
