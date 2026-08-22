from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class FactionRepository:
    """Factions, scoped to one owner.

    Every query in this class filters on `owner_id`, including the reads — an
    entity belonging to another account is not hidden from the response, it is
    absent from the match, so it returns as a 404 rather than a 403. The owner
    arrives at construction time and cannot be omitted; see api/deps.py.
    """

    def __init__(self, session: AsyncSession, owner_id: str) -> None:
        self._session = session
        self._owner_id = owner_id

    async def create(self, faction_data: dict[str, Any]) -> dict[str, Any]:
        return await self._session.execute_write(
            self._create_faction_tx, {**faction_data, "owner_id": self._owner_id}
        )

    @staticmethod
    async def _create_faction_tx(
        tx: AsyncManagedTransaction, faction_data: dict[str, Any]
    ) -> dict[str, Any]:
        query = """
        CREATE (f:Faction {
            id: $id, name: $name, ideology: $ideology,
            description: $description, created_at: $created_at,
            owner_id: $owner_id
        })
        RETURN f {.id, .name, .ideology, .description, .created_at} AS faction
        """
        result = await tx.run(query, **faction_data)
        record = await result.single()
        if record is None:
            raise RuntimeError("Failed to create faction")
        return record["faction"]

    async def get(self, faction_id: str) -> dict[str, Any] | None:
        return await self._session.execute_read(self._get_faction_tx, faction_id, self._owner_id)

    @staticmethod
    async def _get_faction_tx(
        tx: AsyncManagedTransaction, faction_id: str, owner_id: str
    ) -> dict[str, Any] | None:
        query = """
        MATCH (f:Faction {id: $faction_id, owner_id: $owner_id})
        RETURN f {.id, .name, .ideology, .description, .created_at} AS faction
        """
        result = await tx.run(query, faction_id=faction_id, owner_id=owner_id)
        record = await result.single()
        return record["faction"] if record else None

    async def delete(self, faction_id: str) -> bool:
        return await self._session.execute_write(
            self._delete_faction_tx, faction_id, self._owner_id
        )

    @staticmethod
    async def _delete_faction_tx(
        tx: AsyncManagedTransaction, faction_id: str, owner_id: str
    ) -> bool:
        result = await tx.run(
            "MATCH (f:Faction {id: $id, owner_id: $owner_id}) DETACH DELETE f "
            "RETURN count(f) AS deleted",
            id=faction_id,
            owner_id=owner_id,
        )
        record = await result.single()
        if record is None:
            return False
        return bool(record["deleted"])

    _SORTABLE = {"name", "created_at", "ideology"}

    async def Faction_list(
        self,
        *,
        limit: int,
        offset: int,
        ideology: str | None,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> tuple[list[dict], int]:
        if sort_by not in self._SORTABLE:
            sort_by = "name"
        order_kw = "DESC" if order.lower() == "desc" else "ASC"
        return await self._session.execute_read(
            self._list_tx, self._owner_id, limit, offset, ideology, name_contains, sort_by, order_kw
        )

    @staticmethod
    async def _list_tx(
        tx, owner_id, limit, offset, ideology, name_contains, sort_by, order_kw
    ) -> tuple[list[dict], int]:
        # Build a WHERE clause from only the filters that were provided.
        clauses, params = (
            ["f.owner_id = $owner_id"],
            {
                "owner_id": owner_id,
                "limit": limit,
                "offset": offset,
                "ideology": ideology,
                "name_contains": name_contains,
            },
        )
        if ideology is not None:
            clauses.append("f.ideology = $ideology")
        if name_contains is not None:
            clauses.append("toLower(f.name) CONTAINS toLower($name_contains)")
        where = "WHERE " + " AND ".join(clauses)

        # sort_by/order_kw are whitelisted, so interpolation is safe here.
        query = f"""
        MATCH (f:Faction)
        {where}
        WITH collect(f) AS all_f
        WITH all_f, size(all_f) AS total
        UNWIND all_f AS f
        WITH f, total
        ORDER BY f.{sort_by} {order_kw}
        SKIP $offset LIMIT $limit
        RETURN collect(f {{.id, .name, .ideology, .description, .created_at}}) AS items, total
        """
        result = await tx.run(query, **params)
        record = await result.single()
        if record is None:
            return [], 0
        return record["items"], record["total"]

    async def update(self, faction_id: str, props: dict) -> dict | None:
        return await self._session.execute_write(self._update_tx, faction_id, props, self._owner_id)

    @staticmethod
    async def _update_tx(tx, faction_id: str, props: dict, owner_id: str) -> dict | None:
        result = await tx.run(
            "MATCH (f:Faction {id:$id, owner_id:$owner_id}) SET f += $props "
            "RETURN f {.id, .name, .ideology, .description, .created_at} AS faction",
            id=faction_id,
            props=props,
            owner_id=owner_id,
        )
        record = await result.single()
        return record["faction"] if record else None
