from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class CharacterRepository:
    """Characters, scoped to one owner.

    Every query in this class filters on `owner_id`, including the reads — an
    entity belonging to another account is not hidden from the response, it is
    absent from the match, so it returns as a 404 rather than a 403. The owner
    arrives at construction time and cannot be omitted; see api/deps.py.
    """

    def __init__(self, session: AsyncSession, owner_id: str) -> None:
        self._session = session
        self._owner_id = owner_id

    async def create(self, character_data: dict[str, Any]) -> dict[str, Any]:
        return await self._session.execute_write(
            self._create_character_tx, {**character_data, "owner_id": self._owner_id}
        )

    @staticmethod
    async def _create_character_tx(
        tx: AsyncManagedTransaction, character_data: dict[str, Any]
    ) -> dict[str, Any]:  # noqa: E501
        query = """
        CREATE (c:Character {
            id: $id, name: $name, aliases: $aliases,
            status: $status, description: $description, created_at: $created_at,
            owner_id: $owner_id
        })
        RETURN c {.*} AS character
        """
        result = await tx.run(query, **character_data)
        record = await result.single()
        if record is None:
            raise RuntimeError("Failed to create character")
        return record["character"]

    async def get(self, character_id: str) -> dict[str, Any] | None:
        return await self._session.execute_read(
            self._get_character_tx, character_id, self._owner_id
        )

    @staticmethod
    async def _get_character_tx(
        tx: AsyncManagedTransaction, character_id: str, owner_id: str
    ) -> dict[str, Any] | None:
        query = """
        MATCH (c:Character {id: $character_id, owner_id: $owner_id})
        RETURN c {.*} AS character
        """
        result = await tx.run(query, character_id=character_id, owner_id=owner_id)
        record = await result.single()
        return record["character"] if record else None

    async def delete(self, character_id: str) -> bool:
        return await self._session.execute_write(
            self._delete_character_tx, character_id, self._owner_id
        )

    @staticmethod
    async def _delete_character_tx(
        tx: AsyncManagedTransaction, character_id: str, owner_id: str
    ) -> bool:
        result = await tx.run(
            "MATCH (c:Character {id: $id, owner_id: $owner_id}) DETACH DELETE c "
            "RETURN count(c) AS deleted",
            id=character_id,
            owner_id=owner_id,
        )
        record = await result.single()
        if record is None:
            return False
        return bool(record["deleted"])

    _SORTABLE = {"name", "created_at", "status"}

    async def Character_list(
        self,
        *,
        limit: int,
        offset: int,
        status: str | None,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> tuple[list[dict], int]:
        if sort_by not in self._SORTABLE:
            sort_by = "name"
        order_kw = "DESC" if order.lower() == "desc" else "ASC"
        return await self._session.execute_read(
            self._list_tx, self._owner_id, limit, offset, status, name_contains, sort_by, order_kw
        )

    @staticmethod
    async def _list_tx(
        tx, owner_id, limit, offset, status, name_contains, sort_by, order_kw
    ) -> tuple[list[dict], int]:
        # Build a WHERE clause from only the filters that were provided.
        clauses, params = (
            ["c.owner_id = $owner_id"],
            {
                "owner_id": owner_id,
                "limit": limit,
                "offset": offset,
                "status": status,
                "name_contains": name_contains,
            },
        )
        if status is not None:
            clauses.append("c.status = $status")
        if name_contains is not None:
            clauses.append("toLower(c.name) CONTAINS toLower($name_contains)")
        where = "WHERE " + " AND ".join(clauses)

        # sort_by/order_kw are whitelisted, so interpolation is safe here.
        query = f"""
        MATCH (c:Character)
        {where}
        WITH collect(c) AS all_c
        WITH all_c, size(all_c) AS total
        UNWIND all_c AS c
        WITH c, total
        ORDER BY c.{sort_by} {order_kw}
        SKIP $offset LIMIT $limit
        RETURN collect(c {{.*}}) AS items, total
        """
        result = await tx.run(query, **params)
        record = await result.single()
        if record is None:
            return [], 0
        return record["items"], record["total"]

    async def update(self, character_id: str, props: dict) -> dict | None:
        return await self._session.execute_write(
            self._update_tx, character_id, props, self._owner_id
        )

    @staticmethod
    async def _update_tx(tx, character_id: str, props: dict, owner_id: str) -> dict | None:
        result = await tx.run(
            "MATCH (c:Character {id:$id, owner_id:$owner_id}) SET c += $props "
            "RETURN c {.*} AS character",
            id=character_id,
            props=props,
            owner_id=owner_id,
        )
        record = await result.single()
        return record["character"] if record else None

    async def touch_indexed_at(self, character_id: str) -> None:
        await self._session.execute_write(self._touch_tx, character_id, self._owner_id)

    @staticmethod
    async def _touch_tx(tx, character_id: str, owner_id: str) -> None:
        from datetime import UTC, datetime

        # Scoped like every other write, even though this only ever runs as the
        # background task queued by the create that just made this character:
        # an unscoped write here would be a way to stamp another account's node.
        await tx.run(
            "MATCH (c:Character {id:$id, owner_id:$owner_id}) SET c.last_indexed_at = $ts",
            id=character_id,
            owner_id=owner_id,
            ts=datetime.now(UTC).isoformat(),
        )
