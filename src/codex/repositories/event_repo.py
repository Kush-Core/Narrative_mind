from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class EventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, event_data: dict[str, Any]) -> dict[str, Any]:
        return await self._session.execute_write(self._create_event_tx, event_data)

    @staticmethod
    async def _create_event_tx(
        tx: AsyncManagedTransaction, event_data: dict[str, Any]
    ) -> dict[str, Any]:
        query = """
        CREATE (e:Event {
            id: $id, name: $name, summary: $summary,
            timeline_order: $timeline_order, created_at: $created_at
        })
        RETURN e {.*} AS event
        """
        result = await tx.run(query, **event_data)
        record = await result.single()
        if record is None:
            raise RuntimeError("Failed to create event")
        return record["event"]

    async def get(self, event_id: str) -> dict[str, Any] | None:
        return await self._session.execute_read(self._get_event_tx, event_id)

    @staticmethod
    async def _get_event_tx(tx: AsyncManagedTransaction, event_id: str) -> dict[str, Any] | None:
        query = """
        MATCH (e:Event {id: $event_id})
        RETURN e {.*} AS event
        """
        result = await tx.run(query, event_id=event_id)
        record = await result.single()
        return record["event"] if record else None

    async def delete(self, event_id: str) -> bool:
        return await self._session.execute_write(self._delete_event_tx, event_id)

    @staticmethod
    async def _delete_event_tx(tx: AsyncManagedTransaction, event_id: str) -> bool:
        result = await tx.run(
            "MATCH (e:Event {id: $id}) DETACH DELETE e RETURN count(e) AS deleted",
            id=event_id,
        )
        record = await result.single()
        if record is None:
            return False
        return bool(record["deleted"])

    _SORTABLE = {"name", "created_at", "timeline_order"}

    async def Event_list(
        self,
        *,
        limit: int,
        offset: int,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> tuple[list[dict], int]:
        if sort_by not in self._SORTABLE:
            sort_by = "name"
        order_kw = "DESC" if order.lower() == "desc" else "ASC"
        return await self._session.execute_read(
            self._list_tx, limit, offset, name_contains, sort_by, order_kw
        )

    @staticmethod
    async def _list_tx(
        tx, limit, offset, name_contains, sort_by, order_kw
    ) -> tuple[list[dict], int]:
        # Build a WHERE clause from only the filters that were provided.
        clauses, params = (
            [],
            {
                "limit": limit,
                "offset": offset,
                "name_contains": name_contains,
            },
        )
        if name_contains is not None:
            clauses.append("toLower(e.name) CONTAINS toLower($name_contains)")
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        # sort_by/order_kw are whitelisted, so interpolation is safe here.
        query = f"""
        MATCH (e:Event)
        {where}
        WITH collect(e) AS all_e
        WITH all_e, size(all_e) AS total
        UNWIND all_e AS e
        WITH e, total
        ORDER BY e.{sort_by} {order_kw}
        SKIP $offset LIMIT $limit
        RETURN collect(e {{.*}}) AS items, total
        """
        result = await tx.run(query, **params)
        record = await result.single()
        if record is None:
            return [], 0
        return record["items"], record["total"]

    async def update(self, event_id: str, props: dict) -> dict | None:
        return await self._session.execute_write(self._update_tx, event_id, props)

    @staticmethod
    async def _update_tx(tx, event_id: str, props: dict) -> dict | None:
        result = await tx.run(
            "MATCH (e:Event {id:$id}) SET e += $props RETURN e {.*} AS event",
            id=event_id,
            props=props,
        )
        record = await result.single()
        return record["event"] if record else None
