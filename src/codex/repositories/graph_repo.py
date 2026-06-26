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
        query = f"""
        MATCH (c:Character {{id: $id}})
        OPTIONAL MATCH (c)-[*1..{depth}]-(n)
        RETURN c {{.id, .name}} AS center,
               collect(DISTINCT n {{.id, .name, labels: labels(n)}}) AS neighbors
        """
        result = await tx.run(query, id=character_id) # type: ignore
        record = await result.single()
        if record is None or record["center"] is None:
            return None
        neighbors = [n for n in record["neighbors"] if n.get("id") is not None]
        return {"center": record["center"], "neighbors": neighbors}

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