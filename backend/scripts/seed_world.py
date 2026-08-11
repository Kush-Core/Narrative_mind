"""Rebuild the world as the Verge worldset.

Usage (from backend/):
    uv run python scripts/seed_world.py

Only the four world labels are replaced. User accounts share this database as
`:User` nodes and are left alone, so the script is safe to re-run against a
deployed instance without signing every registered account out of existence.

Entity ids are uuid5-derived from their slug, so re-running the script produces
the same graph rather than a new set of nodes.
"""

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid5

from neo4j import AsyncGraphDatabase, AsyncManagedTransaction

from narrative_mind.core.config import get_settings
from narrative_mind.db.migrations import run_migrations

NAMESPACE = UUID("6f9b1c1e-0f4a-5c3d-9e2b-7a1d4f8c2b60")

# Everything this script owns. Any label absent from this tuple — `:User` today —
# is outside the script's remit and is never read or written by it.
WORLD_LABELS = ("Character", "Location", "Faction", "Event")


def eid(slug: str) -> str:
    return str(uuid5(NAMESPACE, slug))


NOW = datetime.now(UTC).isoformat()

# --- Locations -------------------------------------------------------------
# Two regions split by altitude: everything below the new waterline drowned,
# everything above it inherited the survivors.
LOCATIONS = [
    (
        "ironmere",
        "Ironmere",
        "The Drowned Vale",
        "The old capital, taken by the sea in a single night. Its upper towers still "
        "break the surface at low tide, and salvage crews work them from boats.",
    ),
    (
        "greyfen",
        "Greyfen",
        "The Drowned Vale",
        "A stilt-town raised over the marsh by refugees from Ironmere. Crowded, "
        "sinking by inches, and the only lowland settlement still holding.",
    ),
    (
        "saltmarch",
        "Saltmarch",
        "The Drowned Vale",
        "Tidal flats where the Guild rakes salt from the new shallows. The Vale's "
        "one reliable export, and therefore its one reliable grievance.",
    ),
    (
        "kestrelwatch",
        "Kestrelwatch",
        "The High Verge",
        "A cliff fortress that sits four hundred feet above the waterline. It lost "
        "nothing to the flood, which is the beginning of most arguments about it.",
    ),
    (
        "coldharrow",
        "Coldharrow",
        "The High Verge",
        "A mountain cloister housing the last consolidated record of the world "
        "before the water. Cold, remote, and deliberately hard to reach.",
    ),
    (
        "duskvale",
        "Duskvale",
        "The High Verge",
        "A crossroads market where the high roads meet the salvage routes. Neutral "
        "ground by custom rather than by treaty, which has mostly held.",
    ),
]

# --- Factions --------------------------------------------------------------
FACTIONS = [
    (
        "tidebinders",
        "The Tidebinders",
        "The sea is a mechanism, and a mechanism can be governed.",
        "Engineers and sluice-workers who believe the Vale can be reclaimed with "
        "locks and pumps. Seated at Greyfen, perpetually short of materials.",
    ),
    (
        "kestrel-order",
        "Kestrel Order",
        "The flood was a judgment. The high ground was earned.",
        "A martial order holding Kestrelwatch and its granaries. Disciplined, "
        "well-provisioned, and increasingly unable to explain the Long Winter.",
    ),
    (
        "salt-guild",
        "The Salt Guild",
        "Commerce is the only party with no side to take.",
        "The cartel controlling salt, shipping, and most lowland credit. Insists on "
        "its own neutrality more often than anyone else finds convincing.",
    ),
    (
        "quiet-hand",
        "The Quiet Hand",
        "Every secret is already for sale. We only set the price.",
        "An information network operating out of Duskvale. No territory, no army, "
        "and a client list that includes everyone who publicly disavows it.",
    ),
    (
        "coldharrow-archive",
        "Coldharrow Archive",
        "What is remembered is not lost.",
        "Scholars preserving pre-Drowning record. Politically irrelevant until it "
        "became clear they hold the only proof of who owned what.",
    ),
]

# --- Events ----------------------------------------------------------------
# timeline_order is the spine: each event is a consequence of the one before it.
EVENTS = [
    (
        "the-drowning",
        "The Drowning",
        1,
        "The sea rose over a single night and took Ironmere and the low Vale with "
        "it. The survivors who reached high ground became the High Verge; the ones "
        "who did not became Greyfen.",
    ),
    (
        "the-long-winter",
        "The Long Winter",
        2,
        "The first winter after the water. Kestrelwatch closed its granaries to the "
        "lowlands and rode the season out intact. Greyfen did not, and has not "
        "agreed to forget it.",
    ),
    (
        "the-salt-riots",
        "The Salt Riots",
        3,
        "Greyfen rose against Salt Guild pricing after a third consecutive raise. "
        "Four days of burning on the Saltmarch causeway, ended by exhaustion rather "
        "than by any settlement.",
    ),
    (
        "the-verge-compact",
        "The Verge Compact",
        4,
        "A treaty signed at Duskvale binding the Order, the Guild, and the "
        "Tidebinders to shared grain and shared water rights. Brokered by parties "
        "the signatories declined to name in the text.",
    ),
    (
        "the-annex-fire",
        "The Annex Fire",
        5,
        "The Archive's lowland annex at Ironmere burned to the waterline, taking the "
        "pre-Drowning deeds with it. Ruled accidental. The ruling convinced almost "
        "no one.",
    ),
    (
        "the-reckoning",
        "The Reckoning",
        6,
        "The present crisis. With the deeds gone, every Compact claim rests on "
        "testimony, and the Compact is coming apart along the seams the fire left.",
    ),
]

# --- Characters ------------------------------------------------------------
CHARACTERS = [
    (
        "mira-solenne",
        "Mira Solenne",
        ["The Lockkeeper"],
        "alive",
        "Chief engineer of the Tidebinders. Has spent eleven years arguing that the "
        "Vale is recoverable, and is running out of people willing to fund the "
        "argument.",
    ),
    (
        "roderic-kell",
        "Roderic Kell",
        ["Grandmaster Kell"],
        "alive",
        "Grandmaster of the Kestrel Order. Gave the order to close the granaries "
        "during the Long Winter and has never publicly called it anything but "
        "necessary.",
    ),
    (
        "elin-vast",
        "Elin Vast",
        ["Factor Vast"],
        "alive",
        "Senior factor of the Salt Guild. Set the pricing that triggered the Salt "
        "Riots, and negotiated the Compact that followed, without conceding that the "
        "two were connected.",
    ),
    (
        "ivo-marrow",
        "Ivo Marrow",
        ["The Broker"],
        "alive",
        "The Quiet Hand's principal broker at Duskvale. Sold the survey that located "
        "the Archive annex, and maintains this was a cartographic transaction.",
    ),
    (
        "thea-blackwood",
        "Thea Blackwood",
        ["Archivist Blackwood"],
        "alive",
        "Senior archivist at Coldharrow. Lost thirty years of deed reconstruction in "
        "the Annex Fire and has been trying to prove it was set ever since.",
    ),
    (
        "corin-ashe",
        "Corin Ashe",
        [],
        "alive",
        "Mira Solenne's apprentice and the Tidebinders' best surveyor. Has been "
        "passing lock schedules to the Quiet Hand since the Long Winter, for reasons "
        "he no longer finds sufficient.",
    ),
    (
        "garen-coldwater",
        "Garen Coldwater",
        [],
        "alive",
        "A Kestrel Order knight who stood the granary line during the Long Winter "
        "and has been quietly unfit for the Order ever since.",
    ),
    (
        "ondine-marsh",
        "Ondine Marsh",
        ["The Causeway Voice"],
        "alive",
        "Led the Salt Riots from the Greyfen causeway and now sits at the Compact "
        "table as the lowlands' delegate. Left the Tidebinders to do it, and holds "
        "no faction seat by choice.",
    ),
    (
        "osric-dane",
        "Osric Dane",
        [],
        "dead",
        "Salt Guild enforcer, killed on the fourth day of the Salt Riots holding the "
        "Saltmarch causeway. The Guild calls him a casualty; Greyfen calls him the "
        "reason the riots ended.",
    ),
    (
        "lys-fenwick",
        "Lys Fenwick",
        [],
        "unknown",
        "Junior archivist sent to Ironmere to establish how the annex burned. Sent "
        "back two reports, then nothing. The salvage crews have not found the boat.",
    ),
]

# --- Relationships ---------------------------------------------------------
# The API only permits Character-sourced edges of these four types, so the seed
# stays inside that envelope.
LOCATED_IN = [
    ("mira-solenne", "greyfen"),
    ("corin-ashe", "greyfen"),
    ("ondine-marsh", "greyfen"),
    ("roderic-kell", "kestrelwatch"),
    ("garen-coldwater", "kestrelwatch"),
    ("elin-vast", "saltmarch"),
    ("osric-dane", "saltmarch"),
    ("ivo-marrow", "duskvale"),
    ("thea-blackwood", "coldharrow"),
    ("lys-fenwick", "ironmere"),
]

# Ondine Marsh is deliberately unaffiliated — she resigned to take the delegate seat.
MEMBER_OF = [
    ("mira-solenne", "tidebinders"),
    ("corin-ashe", "tidebinders"),
    ("roderic-kell", "kestrel-order"),
    ("garen-coldwater", "kestrel-order"),
    ("elin-vast", "salt-guild"),
    ("osric-dane", "salt-guild"),
    ("ivo-marrow", "quiet-hand"),
    ("thea-blackwood", "coldharrow-archive"),
    ("lys-fenwick", "coldharrow-archive"),
]

PARTICIPATED_IN = [
    ("mira-solenne", "the-drowning"),
    ("roderic-kell", "the-drowning"),
    ("thea-blackwood", "the-drowning"),
    ("roderic-kell", "the-long-winter"),
    ("garen-coldwater", "the-long-winter"),
    ("ondine-marsh", "the-long-winter"),
    ("corin-ashe", "the-long-winter"),
    ("ondine-marsh", "the-salt-riots"),
    ("elin-vast", "the-salt-riots"),
    ("osric-dane", "the-salt-riots"),
    ("corin-ashe", "the-salt-riots"),
    ("roderic-kell", "the-verge-compact"),
    ("elin-vast", "the-verge-compact"),
    ("mira-solenne", "the-verge-compact"),
    ("ondine-marsh", "the-verge-compact"),
    ("ivo-marrow", "the-verge-compact"),
    ("thea-blackwood", "the-annex-fire"),
    ("lys-fenwick", "the-annex-fire"),
    ("ivo-marrow", "the-annex-fire"),
    ("mira-solenne", "the-reckoning"),
    ("roderic-kell", "the-reckoning"),
    ("ondine-marsh", "the-reckoning"),
    ("garen-coldwater", "the-reckoning"),
    ("ivo-marrow", "the-reckoning"),
    ("thea-blackwood", "the-reckoning"),
]

# KNOWS is directed: each side of a pairing carries its own reading of the other.
KNOWS = [
    ("mira-solenne", "corin-ashe", "trusting"),
    ("corin-ashe", "mira-solenne", "guilty"),
    ("mira-solenne", "ondine-marsh", "estranged"),
    ("ondine-marsh", "mira-solenne", "respectful"),
    ("mira-solenne", "roderic-kell", "hostile"),
    ("roderic-kell", "mira-solenne", "dismissive"),
    ("roderic-kell", "garen-coldwater", "suspicious"),
    ("garen-coldwater", "roderic-kell", "disillusioned"),
    ("ondine-marsh", "elin-vast", "hostile"),
    ("elin-vast", "ondine-marsh", "wary"),
    ("osric-dane", "elin-vast", "loyal"),
    ("elin-vast", "osric-dane", "mourning"),
    ("ivo-marrow", "corin-ashe", "transactional"),
    ("corin-ashe", "ivo-marrow", "fearful"),
    ("ivo-marrow", "elin-vast", "cordial"),
    ("elin-vast", "ivo-marrow", "useful"),
    ("thea-blackwood", "lys-fenwick", "worried"),
    ("lys-fenwick", "thea-blackwood", "devoted"),
    ("thea-blackwood", "ivo-marrow", "accusing"),
    ("ivo-marrow", "thea-blackwood", "evasive"),
    ("garen-coldwater", "ondine-marsh", "sympathetic"),
    ("ondine-marsh", "garen-coldwater", "cautious"),
    ("roderic-kell", "elin-vast", "allied"),
    ("elin-vast", "roderic-kell", "allied"),
    ("ivo-marrow", "roderic-kell", "watchful"),
]


async def _wipe_world(tx: AsyncManagedTransaction) -> dict[str, int]:
    """Delete the world, and only the world.

    One statement per label rather than `MATCH (n) DETACH DELETE n`, for two
    reasons. Accounts are `:User` nodes in this same database, so the unscoped
    form deletes every registered login along with the world — recoverable
    locally, not recoverable on a deployed instance. And each statement here is
    served by that label's index instead of scanning the whole node store, so
    the delete stays quick however much unrelated data accumulates.
    """
    removed: dict[str, int] = {}
    for label in WORLD_LABELS:
        # label comes from WORLD_LABELS, never from input; nothing else is interpolated.
        result = await tx.run(f"MATCH (n:{label}) DETACH DELETE n RETURN count(n) AS removed")
        record = await result.single()
        removed[label] = int(record["removed"]) if record else 0
    return removed


async def _seed_nodes(tx: AsyncManagedTransaction) -> None:
    await tx.run(
        """
        UNWIND $rows AS row
        CREATE (l:Location {
            id: row.id, name: row.name, region: row.region,
            description: row.description, created_at: $now
        })
        """,
        rows=[
            {"id": eid(slug), "name": name, "region": region, "description": desc}
            for slug, name, region, desc in LOCATIONS
        ],
        now=NOW,
    )
    await tx.run(
        """
        UNWIND $rows AS row
        CREATE (f:Faction {
            id: row.id, name: row.name, ideology: row.ideology,
            description: row.description, created_at: $now
        })
        """,
        rows=[
            {"id": eid(slug), "name": name, "ideology": ideology, "description": desc}
            for slug, name, ideology, desc in FACTIONS
        ],
        now=NOW,
    )
    await tx.run(
        """
        UNWIND $rows AS row
        CREATE (e:Event {
            id: row.id, name: row.name, summary: row.summary,
            timeline_order: row.timeline_order, created_at: $now
        })
        """,
        rows=[
            {"id": eid(slug), "name": name, "timeline_order": order, "summary": summary}
            for slug, name, order, summary in EVENTS
        ],
        now=NOW,
    )
    await tx.run(
        """
        UNWIND $rows AS row
        CREATE (c:Character {
            id: row.id, name: row.name, aliases: row.aliases,
            status: row.status, description: row.description, created_at: $now
        })
        """,
        rows=[
            {
                "id": eid(slug),
                "name": name,
                "aliases": aliases,
                "status": status,
                "description": desc,
            }
            for slug, name, aliases, status, desc in CHARACTERS
        ],
        now=NOW,
    )


async def _seed_edges(tx: AsyncManagedTransaction) -> None:
    simple: list[tuple[str, list[tuple[str, str]]]] = [
        ("LOCATED_IN", LOCATED_IN),
        ("MEMBER_OF", MEMBER_OF),
        ("PARTICIPATED_IN", PARTICIPATED_IN),
    ]
    for rel_type, pairs in simple:
        # rel_type is a literal from the list above, never external input.
        await tx.run(
            f"""
            UNWIND $rows AS row
            MATCH (source:Character {{id: row.source}})
            MATCH (target {{id: row.target}})
            MERGE (source)-[:{rel_type}]->(target)
            """,
            rows=[{"source": eid(s), "target": eid(t)} for s, t in pairs],
        )

    await tx.run(
        """
        UNWIND $rows AS row
        MATCH (source:Character {id: row.source})
        MATCH (target:Character {id: row.target})
        MERGE (source)-[r:KNOWS]->(target)
        SET r.sentiment = row.sentiment
        """,
        rows=[
            {"source": eid(s), "target": eid(t), "sentiment": sentiment}
            for s, t, sentiment in KNOWS
        ],
    )


async def _summary(tx: AsyncManagedTransaction) -> dict[str, Any]:
    nodes: dict[str, int] = {}
    for label in WORLD_LABELS:
        # label comes from WORLD_LABELS, never from input; nothing else is interpolated.
        result = await tx.run(f"MATCH (n:{label}) RETURN count(n) AS c")
        record = await result.single()
        nodes[label] = int(record["c"]) if record else 0

    edges = await tx.run("MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS c ORDER BY rel")
    edge_counts = {r["rel"]: r["c"] async for r in edges}

    # Reported so a run against a deployed instance visibly confirms it left the
    # logins alone, rather than the operator having to go and check.
    accounts = await tx.run("MATCH (u:User) RETURN count(u) AS c")
    account_record = await accounts.single()

    return {
        "nodes": nodes,
        "edges": edge_counts,
        "accounts": int(account_record["c"]) if account_record else 0,
    }


async def main() -> None:
    settings = get_settings()
    driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
    )
    try:
        await run_migrations(driver)
        async with driver.session() as session:
            removed = await session.execute_write(_wipe_world)
            print(f"removed {sum(removed.values())} existing world nodes:", removed)
            await session.execute_write(_seed_nodes)
            await session.execute_write(_seed_edges)
            stats = await session.execute_read(_summary)
        print("nodes:", stats["nodes"])
        print("edges:", stats["edges"])
        print(f"user accounts left untouched: {stats['accounts']}")
    finally:
        await driver.close()


if __name__ == "__main__":
    asyncio.run(main())
