from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class GraphRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def ego_network(self, character_id: str, depth: int) -> dict[str, Any] | None:
        depth = max(1, min(depth, 3))  # clamp; only a vetted int is interpolated
        return await self._session.execute_read(self._ego_tx, character_id, depth)

    @staticmethod
    async def _ego_tx(
        tx: AsyncManagedTransaction, character_id: str, depth: int
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
        MATCH (c:Character {{id: $id}})
        OPTIONAL MATCH (c)-[*1..{depth}]-(n)
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
        result = await tx.run(query, id=character_id)  # type: ignore
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

    async def shortest_path(self, source: str, target: str) -> dict[str, Any] | None:
        return await self._session.execute_read(self._sp_tx, source, target)

    @staticmethod
    async def _sp_tx(
        tx: AsyncManagedTransaction, source: str, target: str
    ) -> dict[str, Any] | None:
        query = """
        MATCH (a:Character {id:$source}), (b:Character {id:$target})
        MATCH p = shortestPath((a)-[*..6]-(b))
        RETURN [node IN nodes(p) | node {.id, .name}] AS hops, length(p) AS distance
        """
        result = await tx.run(query, source=source, target=target)
        record = await result.single()
        return dict(record) if record else None

    async def node_exists(self, node_id: str) -> bool:
        return await self._session.execute_read(self._node_exists_tx, node_id)

    @staticmethod
    async def _node_exists_tx(tx: AsyncManagedTransaction, node_id: str) -> bool:
        result = await tx.run(
            "MATCH (n {id: $id}) RETURN count(n) > 0 AS node_exists",
            id=node_id,
        )
        record = await result.single()
        return bool(record["node_exists"]) if record else False

    async def link(
        self, source_id: str, rel_type: str, target_id: str, sentiment: str | None
    ) -> dict[str, Any] | None:
        return await self._session.execute_write(
            self._link_tx, source_id, rel_type, target_id, sentiment
        )

    @staticmethod
    async def _link_tx(
        tx: AsyncManagedTransaction,
        source_id: str,
        rel_type: str,
        target_id: str,
        sentiment: str | None,
    ) -> dict[str, Any] | None:
        set_clause = "SET r.sentiment = $sentiment" if sentiment is not None else ""
        query = f"""
        MATCH (source:Character {{id: $source_id}})
        MATCH (target {{id: $target_id}})
        MERGE (source)-[r:{rel_type}]->(target)
        {set_clause}
        RETURN source.id AS source_id, target.id AS target_id,
               type(r) AS rel_type, r.sentiment AS sentiment
        """
        result = await tx.run(query, source_id=source_id, target_id=target_id, sentiment=sentiment)  # type: ignore
        record = await result.single()
        return dict(record) if record else None
