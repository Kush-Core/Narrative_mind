"""The graph-recall evaluation dataset: `verge-starter-v1`.

Twelve hand-annotated questions over the starter world (`domain/starter_world.py`),
each with a reference subgraph derived by an explicit structural rule recorded
in its own `rule` field — so the annotation is auditable rather than an opaque
literal, and `validate_dataset` can check every slug and edge against the seed
world itself.

The relevance judgements are hand-authored, but the *structure* they select
over is the real seed world rather than an invented one. That is what keeps
this honest: a query cannot name a node or an edge that does not exist, and
`tests/test_graph_recall.py` enforces exactly that, direction-sensitively.

Importing this module touches no network and no database — `ALL_SLUGS`,
`LABEL_BY_SLUG`, and `SEED_EDGES` are derived purely from the Python literals
in `domain.starter_world`.
"""

from narrative_mind.domain.starter_world import (
    CHARACTERS,
    EVENTS,
    FACTIONS,
    KNOWS,
    LOCATED_IN,
    LOCATIONS,
    MEMBER_OF,
    PARTICIPATED_IN,
    entity_id,
)
from narrative_mind.evaluation.models import EdgeRef, EvalQuery

DATASET_NAME = "verge-starter-v1"

ALL_SLUGS: frozenset[str] = frozenset(
    row[0] for row in (*LOCATIONS, *FACTIONS, *EVENTS, *CHARACTERS)
)

LABEL_BY_SLUG: dict[str, str] = (
    {row[0]: "Location" for row in LOCATIONS}
    | {row[0]: "Faction" for row in FACTIONS}
    | {row[0]: "Event" for row in EVENTS}
    | {row[0]: "Character" for row in CHARACTERS}
)

SEED_EDGES: frozenset[EdgeRef] = frozenset(
    [(c, "LOCATED_IN", location) for c, location in LOCATED_IN]
    + [(c, "MEMBER_OF", faction) for c, faction in MEMBER_OF]
    + [(c, "PARTICIPATED_IN", event) for c, event in PARTICIPATED_IN]
    + [(a, "KNOWS", b) for a, b, _sentiment in KNOWS]
)

EVAL_QUERIES: tuple[EvalQuery, ...] = (
    EvalQuery(
        id="q01-kestrelwatch-long-winter",
        question="Who was at Kestrelwatch during the Long Winter?",
        reference_nodes=("kestrelwatch", "the-long-winter", "roderic-kell", "garen-coldwater"),
        reference_edges=(
            ("roderic-kell", "LOCATED_IN", "kestrelwatch"),
            ("garen-coldwater", "LOCATED_IN", "kestrelwatch"),
            ("roderic-kell", "PARTICIPATED_IN", "the-long-winter"),
            ("garen-coldwater", "PARTICIPATED_IN", "the-long-winter"),
        ),
        anchors=("kestrelwatch",),
        rule=(
            "Characters LOCATED_IN kestrelwatch intersected with characters "
            "PARTICIPATED_IN the-long-winter, plus both anchors."
        ),
    ),
    EvalQuery(
        id="q02-kestrel-order-members",
        question="Which characters belong to the Kestrel Order?",
        reference_nodes=("kestrel-order", "roderic-kell", "garen-coldwater"),
        reference_edges=(
            ("roderic-kell", "MEMBER_OF", "kestrel-order"),
            ("garen-coldwater", "MEMBER_OF", "kestrel-order"),
        ),
        anchors=("kestrel-order",),
        rule="1-hop MEMBER_OF in-neighbourhood of the faction.",
    ),
    EvalQuery(
        id="q03-verge-compact-signatories",
        question="Who signed the Verge Compact?",
        reference_nodes=(
            "the-verge-compact",
            "roderic-kell",
            "elin-vast",
            "mira-solenne",
            "ondine-marsh",
            "ivo-marrow",
        ),
        reference_edges=(
            ("roderic-kell", "PARTICIPATED_IN", "the-verge-compact"),
            ("elin-vast", "PARTICIPATED_IN", "the-verge-compact"),
            ("mira-solenne", "PARTICIPATED_IN", "the-verge-compact"),
            ("ondine-marsh", "PARTICIPATED_IN", "the-verge-compact"),
            ("ivo-marrow", "PARTICIPATED_IN", "the-verge-compact"),
        ),
        anchors=("the-verge-compact",),
        rule="All PARTICIPATED_IN participants of the event.",
    ),
    EvalQuery(
        id="q04-mira-solenne-knows",
        question="Who does Mira Solenne know?",
        reference_nodes=("mira-solenne", "corin-ashe", "ondine-marsh", "roderic-kell"),
        reference_edges=(
            ("mira-solenne", "KNOWS", "corin-ashe"),
            ("mira-solenne", "KNOWS", "ondine-marsh"),
            ("mira-solenne", "KNOWS", "roderic-kell"),
        ),
        anchors=("mira-solenne",),
        rule="Outgoing KNOWS edges only.",
    ),
    EvalQuery(
        id="q05-annex-fire-location",
        question="Who was involved in the Annex Fire, and where did it happen?",
        reference_nodes=(
            "the-annex-fire",
            "thea-blackwood",
            "lys-fenwick",
            "ivo-marrow",
            "ironmere",
        ),
        reference_edges=(
            ("thea-blackwood", "PARTICIPATED_IN", "the-annex-fire"),
            ("lys-fenwick", "PARTICIPATED_IN", "the-annex-fire"),
            ("ivo-marrow", "PARTICIPATED_IN", "the-annex-fire"),
            ("lys-fenwick", "LOCATED_IN", "ironmere"),
        ),
        anchors=("the-annex-fire",),
        rule="Event participants plus the location named in the event summary.",
    ),
    EvalQuery(
        id="q06-what-is-coldharrow",
        question="What is Coldharrow?",
        reference_nodes=("coldharrow",),
        reference_edges=(),
        anchors=("coldharrow",),
        rule="Single-entity lookup — no edge is required to answer.",
    ),
    EvalQuery(
        id="q07-salt-riots-factions",
        question="Which factions were involved in the Salt Riots?",
        reference_nodes=(
            "the-salt-riots",
            "ondine-marsh",
            "elin-vast",
            "osric-dane",
            "corin-ashe",
            "salt-guild",
            "tidebinders",
        ),
        reference_edges=(
            ("ondine-marsh", "PARTICIPATED_IN", "the-salt-riots"),
            ("elin-vast", "PARTICIPATED_IN", "the-salt-riots"),
            ("osric-dane", "PARTICIPATED_IN", "the-salt-riots"),
            ("corin-ashe", "PARTICIPATED_IN", "the-salt-riots"),
            ("elin-vast", "MEMBER_OF", "salt-guild"),
            ("osric-dane", "MEMBER_OF", "salt-guild"),
            ("corin-ashe", "MEMBER_OF", "tidebinders"),
        ),
        anchors=("the-salt-riots",),
        rule=(
            "Event participants, plus the factions they are MEMBER_OF "
            "(ondine-marsh has none — included as a participant, contributes no edge)."
        ),
    ),
    EvalQuery(
        id="q08-lys-fenwick-fate",
        question="What happened to Lys Fenwick?",
        reference_nodes=(
            "lys-fenwick",
            "the-annex-fire",
            "ironmere",
            "coldharrow-archive",
            "thea-blackwood",
        ),
        reference_edges=(
            ("lys-fenwick", "PARTICIPATED_IN", "the-annex-fire"),
            ("lys-fenwick", "LOCATED_IN", "ironmere"),
            ("lys-fenwick", "MEMBER_OF", "coldharrow-archive"),
            ("lys-fenwick", "KNOWS", "thea-blackwood"),
        ),
        anchors=("lys-fenwick",),
        rule="Complete 1-hop ego network of one character.",
    ),
    EvalQuery(
        id="q09-greyfen-resents-kestrelwatch",
        question="Why does Greyfen resent Kestrelwatch?",
        reference_nodes=(
            "greyfen",
            "kestrelwatch",
            "the-long-winter",
            "roderic-kell",
            "garen-coldwater",
            "ondine-marsh",
            "corin-ashe",
        ),
        reference_edges=(
            ("corin-ashe", "LOCATED_IN", "greyfen"),
            ("ondine-marsh", "LOCATED_IN", "greyfen"),
            ("roderic-kell", "LOCATED_IN", "kestrelwatch"),
            ("garen-coldwater", "LOCATED_IN", "kestrelwatch"),
            ("roderic-kell", "PARTICIPATED_IN", "the-long-winter"),
            ("garen-coldwater", "PARTICIPATED_IN", "the-long-winter"),
            ("ondine-marsh", "PARTICIPATED_IN", "the-long-winter"),
            ("corin-ashe", "PARTICIPATED_IN", "the-long-winter"),
        ),
        anchors=("greyfen", "kestrelwatch"),
        rule=(
            "Both locations, the event linking them, and the characters located in "
            "each who also participated (excludes mira-solenne, who is in Greyfen "
            "but not in the Long Winter)."
        ),
    ),
    EvalQuery(
        id="q10-quiet-hand-informant",
        question="Who is passing information to the Quiet Hand?",
        reference_nodes=("quiet-hand", "ivo-marrow", "corin-ashe", "tidebinders"),
        reference_edges=(
            ("ivo-marrow", "MEMBER_OF", "quiet-hand"),
            ("ivo-marrow", "KNOWS", "corin-ashe"),
            ("corin-ashe", "KNOWS", "ivo-marrow"),
            ("corin-ashe", "MEMBER_OF", "tidebinders"),
        ),
        anchors=("quiet-hand",),
        rule=(
            "Faction → its member → that member's KNOWS counterpart → that "
            "character's faction (3 hops)."
        ),
    ),
    EvalQuery(
        id="q11-dead-or-missing",
        question="Which characters are dead or missing?",
        reference_nodes=("osric-dane", "lys-fenwick"),
        reference_edges=(),
        anchors=(),
        rule="status in {dead, unknown} — a node-property query with no graph structure.",
    ),
    EvalQuery(
        id="q12-thea-ivo-connection",
        question="What connects Thea Blackwood to Ivo Marrow?",
        reference_nodes=("thea-blackwood", "ivo-marrow", "the-annex-fire"),
        reference_edges=(
            ("thea-blackwood", "KNOWS", "ivo-marrow"),
            ("ivo-marrow", "KNOWS", "thea-blackwood"),
            ("thea-blackwood", "PARTICIPATED_IN", "the-annex-fire"),
            ("ivo-marrow", "PARTICIPATED_IN", "the-annex-fire"),
        ),
        anchors=("thea-blackwood", "ivo-marrow"),
        rule=(
            "The two characters, their bidirectional KNOWS pair, and the one event both attended."
        ),
    ),
)


def validate_dataset(queries: tuple[EvalQuery, ...] = EVAL_QUERIES) -> None:
    """Every annotated slug and edge must exist in `domain/starter_world.py`.

    Fails loudly on an unknown slug, an edge absent from `SEED_EDGES` in the
    annotated direction, an empty reference-node set, a within-query
    duplicate, or a duplicate query id — so editing the seed world breaks
    this test rather than silently scoring against a stale reference.

    `queries` defaults to the real dataset; tests pass a hand-built tuple to
    exercise one rejection rule in isolation.
    """
    seen_ids: set[str] = set()
    for query in queries:
        if query.id in seen_ids:
            raise ValueError(f"{query.id}: duplicate query id")
        seen_ids.add(query.id)

        if not query.reference_nodes:
            raise ValueError(f"{query.id}: reference_nodes must not be empty")

        if len(query.reference_nodes) != len(set(query.reference_nodes)):
            raise ValueError(f"{query.id}: reference_nodes contains a duplicate")

        for slug in query.reference_nodes:
            if slug not in ALL_SLUGS:
                raise ValueError(f"{query.id}: unknown reference node slug {slug!r}")

        for slug in query.anchors:
            if slug not in ALL_SLUGS:
                raise ValueError(f"{query.id}: unknown anchor slug {slug!r}")

        if len(query.reference_edges) != len(set(query.reference_edges)):
            raise ValueError(f"{query.id}: reference_edges contains a duplicate")

        for edge in query.reference_edges:
            if edge not in SEED_EDGES:
                raise ValueError(
                    f"{query.id}: reference edge {edge!r} not found in the seed world "
                    "(direction-sensitive — check it wasn't annotated reversed)"
                )


def slug_index(owner_id: str) -> dict[str, str]:
    """{entity_id(owner_id, slug): slug} for every slug in the starter world.

    The single identity boundary the metric uses — do not reimplement `uuid5`
    anywhere else.
    """
    return {entity_id(owner_id, slug): slug for slug in ALL_SLUGS}
