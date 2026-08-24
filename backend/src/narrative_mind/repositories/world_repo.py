"""Whole-world writes: give an account the starter world, or take its world away.

Separate from the four entity repositories because the unit of work is different.
Those own one label each and are constructed already scoped to a single owner;
this one operates on a whole world at once and takes the owner per call, because
its two callers do not have an authenticated owner to be scoped by. Registration
seeds a user who did not exist a moment ago, and the reset script is a terminal
holding an email address.
"""

from datetime import UTC, datetime
from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession

from narrative_mind.domain.starter_world import (
    CHARACTERS,
    EVENTS,
    FACTIONS,
    KNOWS,
    LOCATED_IN,
    LOCATIONS,
    MEMBER_OF,
    PARTICIPATED_IN,
    WORLD_LABELS,
    entity_id,
)

# Written from a Character in every case, matching the one write path the API
# exposes (`POST /characters/{id}/relationships`), so the seeded world contains
# nothing a user could not have created themselves.
_SIMPLE_EDGES: tuple[tuple[str, list[tuple[str, str]]], ...] = (
    ("LOCATED_IN", LOCATED_IN),
    ("MEMBER_OF", MEMBER_OF),
    ("PARTICIPATED_IN", PARTICIPATED_IN),
)


class WorldRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def seed_starter_world(
        self,
        owner_id: str,
        *,
        embeddings: dict[str, list[float]] | None = None,
        embedding_model: str | None = None,
    ) -> None:
        """Create this owner's copy of the starter world.

        One transaction for all twenty-seven nodes and their edges: a half-built
        world is worse than none, and on the registration path it would leave an
        account holding a fragment with no way to ask for the rest.

        `embeddings` is the precomputed starter-world vectors for the currently
        configured model (see domain/starter_world_embeddings.py) — every
        account's copy shares the same text, so the same vectors are valid for
        all of them. When absent (no file yet, or the model changed since the
        file was generated), nodes are created without an embedding and are
        picked up later exactly like any other unembedded entity.
        """
        await self._session.execute_write(self._seed_tx, owner_id, embeddings, embedding_model)

    @staticmethod
    async def _seed_tx(
        tx: AsyncManagedTransaction,
        owner_id: str,
        embeddings: dict[str, list[float]] | None,
        embedding_model: str | None,
    ) -> None:
        now = datetime.now(UTC).isoformat()
        params: dict[str, Any] = {"owner_id": owner_id, "now": now}

        def embedding_fields(slug: str) -> dict[str, Any]:
            vector = embeddings.get(slug) if embeddings else None
            if vector is None:
                return {"embedding": None, "embedding_model": None, "embedded_at": None}
            return {"embedding": vector, "embedding_model": embedding_model, "embedded_at": now}

        await tx.run(
            """
            UNWIND $rows AS row
            CREATE (l:Location {
                id: row.id, name: row.name, region: row.region,
                description: row.description, created_at: $now, owner_id: $owner_id,
                embedding: row.embedding, embedding_model: row.embedding_model,
                embedded_at: row.embedded_at
            })
            """,
            rows=[
                {
                    "id": entity_id(owner_id, slug),
                    "name": name,
                    "region": region,
                    "description": desc,
                    **embedding_fields(slug),
                }
                for slug, name, region, desc in LOCATIONS
            ],
            **params,
        )
        await tx.run(
            """
            UNWIND $rows AS row
            CREATE (f:Faction {
                id: row.id, name: row.name, ideology: row.ideology,
                description: row.description, created_at: $now, owner_id: $owner_id,
                embedding: row.embedding, embedding_model: row.embedding_model,
                embedded_at: row.embedded_at
            })
            """,
            rows=[
                {
                    "id": entity_id(owner_id, slug),
                    "name": name,
                    "ideology": ideology,
                    "description": desc,
                    **embedding_fields(slug),
                }
                for slug, name, ideology, desc in FACTIONS
            ],
            **params,
        )
        await tx.run(
            """
            UNWIND $rows AS row
            CREATE (e:Event {
                id: row.id, name: row.name, summary: row.summary,
                timeline_order: row.timeline_order, created_at: $now, owner_id: $owner_id,
                embedding: row.embedding, embedding_model: row.embedding_model,
                embedded_at: row.embedded_at
            })
            """,
            rows=[
                {
                    "id": entity_id(owner_id, slug),
                    "name": name,
                    "timeline_order": order,
                    "summary": summary,
                    **embedding_fields(slug),
                }
                for slug, name, order, summary in EVENTS
            ],
            **params,
        )
        await tx.run(
            """
            UNWIND $rows AS row
            CREATE (c:Character {
                id: row.id, name: row.name, aliases: row.aliases,
                status: row.status, description: row.description,
                created_at: $now, owner_id: $owner_id,
                embedding: row.embedding, embedding_model: row.embedding_model,
                embedded_at: row.embedded_at
            })
            """,
            rows=[
                {
                    "id": entity_id(owner_id, slug),
                    "name": name,
                    "aliases": aliases,
                    "status": status,
                    "description": desc,
                    **embedding_fields(slug),
                }
                for slug, name, aliases, status, desc in CHARACTERS
            ],
            **params,
        )

        # Both endpoints are matched on owner as well as id. The ids are already
        # owner-derived, so this cannot match across accounts anyway — it is here
        # so the constraint is visible in the query rather than resting on how
        # entity_id happens to be implemented.
        for rel_type, pairs in _SIMPLE_EDGES:
            # rel_type is a literal from _SIMPLE_EDGES, never external input.
            await tx.run(
                f"""
                UNWIND $rows AS row
                MATCH (source:Character {{id: row.source, owner_id: $owner_id}})
                MATCH (target {{id: row.target, owner_id: $owner_id}})
                MERGE (source)-[:{rel_type}]->(target)
                """,
                rows=[
                    {"source": entity_id(owner_id, s), "target": entity_id(owner_id, t)}
                    for s, t in pairs
                ],
                owner_id=owner_id,
            )

        await tx.run(
            """
            UNWIND $rows AS row
            MATCH (source:Character {id: row.source, owner_id: $owner_id})
            MATCH (target:Character {id: row.target, owner_id: $owner_id})
            MERGE (source)-[r:KNOWS]->(target)
            SET r.sentiment = row.sentiment
            """,
            rows=[
                {
                    "source": entity_id(owner_id, s),
                    "target": entity_id(owner_id, t),
                    "sentiment": sentiment,
                }
                for s, t, sentiment in KNOWS
            ],
            owner_id=owner_id,
        )

    async def wipe_world(self, owner_id: str) -> dict[str, int]:
        """Delete one owner's world, and nothing else."""
        return await self._session.execute_write(self._wipe_tx, owner_id)

    @staticmethod
    async def _wipe_tx(tx: AsyncManagedTransaction, owner_id: str) -> dict[str, int]:
        removed: dict[str, int] = {}
        for label in WORLD_LABELS:
            # label comes from WORLD_LABELS, never from input; nothing else is interpolated.
            result = await tx.run(
                f"MATCH (n:{label} {{owner_id: $owner_id}}) DETACH DELETE n "
                "RETURN count(n) AS removed",
                owner_id=owner_id,
            )
            record = await result.single()
            removed[label] = int(record["removed"]) if record else 0
        return removed

    async def counts(self, owner_id: str) -> dict[str, Any]:
        """Per-label node counts and per-type edge counts for one owner's world."""
        return await self._session.execute_read(self._counts_tx, owner_id)

    @staticmethod
    async def _counts_tx(tx: AsyncManagedTransaction, owner_id: str) -> dict[str, Any]:
        nodes: dict[str, int] = {}
        for label in WORLD_LABELS:
            # label comes from WORLD_LABELS, never from input; nothing else is interpolated.
            result = await tx.run(
                f"MATCH (n:{label} {{owner_id: $owner_id}}) RETURN count(n) AS c",
                owner_id=owner_id,
            )
            record = await result.single()
            nodes[label] = int(record["c"]) if record else 0

        edges = await tx.run(
            """
            MATCH (a {owner_id: $owner_id})-[r]->(b {owner_id: $owner_id})
            RETURN type(r) AS rel, count(*) AS c ORDER BY rel
            """,
            owner_id=owner_id,
        )
        return {"nodes": nodes, "edges": {r["rel"]: r["c"] async for r in edges}}
