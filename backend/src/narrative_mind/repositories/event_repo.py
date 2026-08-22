from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class EventRepository:
    """Events, scoped to one owner.

    Every query in this class filters on `owner_id`, including the reads — an
    entity belonging to another account is not hidden from the response, it is
    absent from the match, so it returns as a 404 rather than a 403. The owner
    arrives at construction time and cannot be omitted; see api/deps.py.
    """

    def __init__(self, session: AsyncSession, owner_id: str) -> None:
        self._session = session
        self._owner_id = owner_id

    async def create(self, event_data: dict[str, Any]) -> dict[str, Any]:
        return await self._session.execute_write(
            self._create_event_tx, {**event_data, "owner_id": self._owner_id}
        )

    @staticmethod
    async def _create_event_tx(
        tx: AsyncManagedTransaction, event_data: dict[str, Any]
    ) -> dict[str, Any]:
        query = """
        CREATE (e:Event {
            id: $id, name: $name, summary: $summary,
            timeline_order: $timeline_order, created_at: $created_at,
            owner_id: $owner_id
        })
        RETURN e {.id, .name, .summary, .timeline_order, .created_at} AS event
        """
        result = await tx.run(query, **event_data)
        record = await result.single()
        if record is None:
            raise RuntimeError("Failed to create event")
        return record["event"]

    async def get(self, event_id: str) -> dict[str, Any] | None:
        return await self._session.execute_read(self._get_event_tx, event_id, self._owner_id)

    @staticmethod
    async def _get_event_tx(
        tx: AsyncManagedTransaction, event_id: str, owner_id: str
    ) -> dict[str, Any] | None:
        query = """
        MATCH (e:Event {id: $event_id, owner_id: $owner_id})
        RETURN e {.id, .name, .summary, .timeline_order, .created_at} AS event
        """
        result = await tx.run(query, event_id=event_id, owner_id=owner_id)
        record = await result.single()
        return record["event"] if record else None

    async def delete(self, event_id: str) -> bool:
        return await self._session.execute_write(self._delete_event_tx, event_id, self._owner_id)

    @staticmethod
    async def _delete_event_tx(tx: AsyncManagedTransaction, event_id: str, owner_id: str) -> bool:
        result = await tx.run(
            "MATCH (e:Event {id: $id, owner_id: $owner_id}) DETACH DELETE e "
            "RETURN count(e) AS deleted",
            id=event_id,
            owner_id=owner_id,
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
            self._list_tx, self._owner_id, limit, offset, name_contains, sort_by, order_kw
        )

    @staticmethod
    async def _list_tx(
        tx, owner_id, limit, offset, name_contains, sort_by, order_kw
    ) -> tuple[list[dict], int]:
        # Build a WHERE clause from only the filters that were provided.
        clauses, params = (
            ["e.owner_id = $owner_id"],
            {
                "owner_id": owner_id,
                "limit": limit,
                "offset": offset,
                "name_contains": name_contains,
            },
        )
        if name_contains is not None:
            clauses.append("toLower(e.name) CONTAINS toLower($name_contains)")
        where = "WHERE " + " AND ".join(clauses)

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
        RETURN collect(e {{.id, .name, .summary, .timeline_order, .created_at}}) AS items, total
        """
        result = await tx.run(query, **params)
        record = await result.single()
        if record is None:
            return [], 0
        return record["items"], record["total"]

    async def update(self, event_id: str, props: dict) -> dict | None:
        return await self._session.execute_write(self._update_tx, event_id, props, self._owner_id)

    @staticmethod
    async def _update_tx(tx, event_id: str, props: dict, owner_id: str) -> dict | None:
        result = await tx.run(
            "MATCH (e:Event {id:$id, owner_id:$owner_id}) SET e += $props "
            "RETURN e {.id, .name, .summary, .timeline_order, .created_at} AS event",
            id=event_id,
            props=props,
            owner_id=owner_id,
        )
        record = await result.single()
        return record["event"] if record else None
