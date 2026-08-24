from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class GraphRepository:
    """Traversal and relationship writes, scoped to one owner.

    Scoping a traversal is not the same as scoping a lookup. A `MATCH` by id
    either finds the owner's node or finds nothing, but a variable-length pattern
    could in principle walk out of one account's world and into another's, and
    would then report a neighbour the caller is not entitled to see.

    Two things prevent that. Every write here requires both endpoints to belong
    to the caller, so no edge ever crosses between two owners' worlds and the
    graph is partitioned by construction. And every read filters on `owner_id`
    anyway, so a crossing edge introduced by some future path — a migration, a
    fixture, a hand-written query — still could not leak a node through this
    class. The invariant is enforced, not assumed.
    """

    def __init__(self, session: AsyncSession, owner_id: str) -> None:
        self._session = session
        self._owner_id = owner_id

    async def ego_network(self, character_id: str, depth: int) -> dict[str, Any] | None:
        depth = max(1, min(depth, 3))  # clamp; only a vetted int is interpolated
        return await self._session.execute_read(self._ego_tx, character_id, depth, self._owner_id)

    @staticmethod
    async def _ego_tx(
        tx: AsyncManagedTransaction, character_id: str, depth: int, owner_id: str
    ) -> dict[str, Any] | None:
        """Return the reachable nodes *and* the relationships among them.

        The relationship pass is deliberately a second step over the resolved
        node set rather than a projection of the traversal's paths. Collecting
        `relationships(path)` would only report edges that happen to lie on a
        path outward from the centre, which omits edges *between* neighbours —
        at depth 1 it would return no neighbour-to-neighbour edge at all.

        Matching every edge whose endpoints are both in scope returns the
        **induced subgraph**, so the edge set is complete for the nodes reported
        and a client can draw it without inferring adjacency. That is what lets
        the frontend stop guessing at depth > 1.
        """
        query = f"""
        MATCH (c:Character {{id: $id, owner_id: $owner_id}})
        OPTIONAL MATCH (c)-[*1..{depth}]-(n)
        WHERE n.owner_id = $owner_id
        WITH c, collect(DISTINCT n) AS neighbors
        WITH c, neighbors, neighbors + [c] AS scope
        UNWIND scope AS source
        OPTIONAL MATCH (source)-[r]->(target)
        WHERE target IN scope
        WITH c, neighbors, collect(DISTINCT r) AS rels
        RETURN c {{.id, .name}} AS center,
               [x IN neighbors | x {{.id, .name, labels: labels(x)}}] AS neighbors,
               [r IN rels | {{
                   source: startNode(r).id,
                   target: endNode(r).id,
                   rel_type: type(r),
                   sentiment: r.sentiment
               }}] AS relationships
        """
        result = await tx.run(query, id=character_id, owner_id=owner_id)  # type: ignore
        record = await result.single()
        if record is None or record["center"] is None:
            return None
        neighbors = [n for n in record["neighbors"] if n.get("id") is not None]
        # An edge whose endpoints did not both resolve cannot be drawn, and a
        # half-anchored edge is worse than a missing one.
        known_ids = {n["id"] for n in neighbors} | {record["center"]["id"]}
        relationships = [
            r
            for r in record["relationships"]
            if r["source"] in known_ids and r["target"] in known_ids
        ]
        return {
            "center": record["center"],
            "neighbors": neighbors,
            "relationships": relationships,
        }

    async def expand(self, seed_ids: list[str], depth: int) -> dict[str, Any]:
        """The induced subgraph within `depth` hops of any of `seed_ids`.

        Multi-seed, any-label generalisation of `ego_network`'s key move:
        collect the full node set first — every seed plus everything within
        `depth` hops of any of them — then match every edge whose *both*
        endpoints are in that set. An edge collected only from the paths a
        traversal happened to walk outward on would miss edges *between*
        neighbours; the induced subgraph is what a client can draw without
        inferring adjacency, and it is the reason a graph beats a flat top-K
        entity list here at all — the answer to "who would object" lives in
        the edges around a seed, not in any one seed's own text.
        """
        depth = max(1, min(depth, 2))  # RAG expansion, capped tighter than ego_network's UI depth
        if not seed_ids:
            return {"nodes": [], "relationships": []}
        return await self._session.execute_read(self._expand_tx, seed_ids, depth, self._owner_id)

    @staticmethod
    async def _expand_tx(
        tx: AsyncManagedTransaction, seed_ids: list[str], depth: int, owner_id: str
    ) -> dict[str, Any]:
        query = f"""
        MATCH (s {{owner_id: $owner_id}})
        WHERE s.id IN $seed_ids
        WITH collect(DISTINCT s) AS seeds
        UNWIND seeds AS seed
        OPTIONAL MATCH (seed)-[*1..{depth}]-(n)
        WHERE n.owner_id = $owner_id
        WITH seeds, collect(DISTINCT n) AS neighbors
        UNWIND seeds + neighbors AS x
        WITH collect(DISTINCT x) AS scope
        UNWIND scope AS source
        OPTIONAL MATCH (source)-[r]->(target)
        WHERE target IN scope
        WITH scope, collect(DISTINCT r) AS rels
        RETURN [x IN scope | x {{.id, .name, labels: labels(x)}}] AS nodes,
               [r IN rels | {{
                   source: startNode(r).id,
                   target: endNode(r).id,
                   rel_type: type(r),
                   sentiment: r.sentiment
               }}] AS relationships
        """
        result = await tx.run(query, seed_ids=seed_ids, owner_id=owner_id)  # type: ignore
        record = await result.single()
        if record is None:
            return {"nodes": [], "relationships": []}
        return {"nodes": record["nodes"], "relationships": record["relationships"]}

    async def shortest_path(self, source: str, target: str) -> dict[str, Any] | None:
        return await self._session.execute_read(self._sp_tx, source, target, self._owner_id)

    @staticmethod
    async def _sp_tx(
        tx: AsyncManagedTransaction, source: str, target: str, owner_id: str
    ) -> dict[str, Any] | None:
        # Both endpoints must be the caller's, and so must every hop in between:
        # a path is only an answer if the whole of it is theirs to see.
        query = """
        MATCH (a:Character {id:$source, owner_id:$owner_id}),
              (b:Character {id:$target, owner_id:$owner_id})
        MATCH p = shortestPath((a)-[*..6]-(b))
        WHERE all(hop IN nodes(p) WHERE hop.owner_id = $owner_id)
        RETURN [node IN nodes(p) | node {.id, .name}] AS hops, length(p) AS distance
        """
        result = await tx.run(query, source=source, target=target, owner_id=owner_id)
        record = await result.single()
        return dict(record) if record else None

    async def node_exists(self, node_id: str) -> bool:
        return await self._session.execute_read(self._node_exists_tx, node_id, self._owner_id)

    @staticmethod
    async def _node_exists_tx(tx: AsyncManagedTransaction, node_id: str, owner_id: str) -> bool:
        # "Exists" means "exists for this caller". Another account's node reads as
        # absent, so linking to one raises the same 404 as an id that never was —
        # which is the answer that reveals least.
        result = await tx.run(
            "MATCH (n {id: $id, owner_id: $owner_id}) RETURN count(n) > 0 AS node_exists",
            id=node_id,
            owner_id=owner_id,
        )
        record = await result.single()
        return bool(record["node_exists"]) if record else False

    async def link(
        self, source_id: str, rel_type: str, target_id: str, sentiment: str | None
    ) -> dict[str, Any] | None:
        return await self._session.execute_write(
            self._link_tx, source_id, rel_type, target_id, sentiment, self._owner_id
        )

    @staticmethod
    async def _link_tx(
        tx: AsyncManagedTransaction,
        source_id: str,
        rel_type: str,
        target_id: str,
        sentiment: str | None,
        owner_id: str,
    ) -> dict[str, Any] | None:
        set_clause = "SET r.sentiment = $sentiment" if sentiment is not None else ""
        # Requiring both endpoints to be the caller's is what keeps the graph
        # partitioned: no edge can ever join two accounts' worlds, which is the
        # invariant the traversals above rely on.
        query = f"""
        MATCH (source:Character {{id: $source_id, owner_id: $owner_id}})
        MATCH (target {{id: $target_id, owner_id: $owner_id}})
        MERGE (source)-[r:{rel_type}]->(target)
        {set_clause}
        RETURN source.id AS source_id, target.id AS target_id,
               type(r) AS rel_type, r.sentiment AS sentiment
        """
        result = await tx.run(  # type: ignore
            query,
            source_id=source_id,
            target_id=target_id,
            sentiment=sentiment,
            owner_id=owner_id,
        )
        record = await result.single()
        return dict(record) if record else None
