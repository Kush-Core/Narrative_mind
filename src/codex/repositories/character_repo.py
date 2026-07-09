from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class CharacterRepository:
    def __init__(self, session: AsyncSession)->None:
        self._session = session

    async def create(self, character_data: dict[str, Any])->dict[str, Any]:
        return await self._session.execute_write(self._create_character_tx, character_data)
    
    @staticmethod
    async def _create_character_tx(tx: AsyncManagedTransaction, character_data: dict[str, Any])->dict[str, Any]:  # noqa: E501
        query = """
        CREATE (c:Character {
            id: $id, name: $name, aliases: $aliases,
            status: $status, description: $description, created_at: $created_at
        })
        RETURN c {.*} AS character
        """
        result = await tx.run(query, **character_data)
        record = await result.single()
        if record is None:
            raise RuntimeError("Failed to create character")
        return record["character"]
    
    async def get(self, character_id:str)->dict[str, Any]|None:
        return await self._session.execute_read(self._get_character_tx, character_id)
    
    @staticmethod
    async def _get_character_tx(tx: AsyncManagedTransaction, character_id:str)->dict[str, Any]|None:
        query = """
        MATCH (c:Character {id: $character_id})
        RETURN c {.*} AS character
        """
        result = await tx.run(query, character_id=character_id)
        record = await result.single()
        return record["character"] if record else None
    
    async def delete(self, character_id:str)->bool:
        return await self._session.execute_write(self._delete_character_tx, character_id)
    
    @staticmethod
    async def _delete_character_tx(tx: AsyncManagedTransaction, character_id: str) -> bool:
        result = await tx.run(
            "MATCH (c:Character {id: $id}) DETACH DELETE c RETURN count(c) AS deleted",
            id=character_id,
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
            self._list_tx, limit, offset, status, name_contains, sort_by, order_kw
        )

    @staticmethod
    async def _list_tx(
        tx, limit, offset, status, name_contains, sort_by, order_kw
    ) -> tuple[list[dict], int]:
        # Build a WHERE clause from only the filters that were provided.
        clauses, params = [], {
            "limit": limit, "offset": offset,
            "status": status, "name_contains": name_contains,
        }
        if status is not None:
            clauses.append("c.status = $status")
        if name_contains is not None:
            clauses.append("toLower(c.name) CONTAINS toLower($name_contains)")
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

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
        return await self._session.execute_write(self._update_tx, character_id, props)

    @staticmethod
    async def _update_tx(tx, character_id: str, props: dict) -> dict | None:
        result = await tx.run(
            "MATCH (c:Character {id:$id}) SET c += $props RETURN c {.*} AS character",
            id=character_id, props=props,
        )
        record = await result.single()
        return record["character"] if record else None

