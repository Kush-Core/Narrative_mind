from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class LocationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, location_data: dict[str, Any]) -> dict[str, Any]:
        return await self._session.execute_write(self._create_location_tx, location_data)

    @staticmethod
    async def _create_location_tx(
        tx: AsyncManagedTransaction, location_data: dict[str, Any]
    ) -> dict[str, Any]:
        query = """
        CREATE (l:Location {
            id: $id, name: $name, region: $region,
            description: $description, created_at: $created_at
        })
        RETURN l {.*} AS location
        """
        result = await tx.run(query, **location_data)
        record = await result.single()
        if record is None:
            raise RuntimeError("Failed to create location")
        return record["location"]

    async def get(self, location_id: str) -> dict[str, Any] | None:
        return await self._session.execute_read(self._get_location_tx, location_id)

    @staticmethod
    async def _get_location_tx(
        tx: AsyncManagedTransaction, location_id: str
    ) -> dict[str, Any] | None:
        query = """
        MATCH (l:Location {id: $location_id})
        RETURN l {.*} AS location
        """
        result = await tx.run(query, location_id=location_id)
        record = await result.single()
        return record["location"] if record else None

    async def delete(self, location_id: str) -> bool:
        return await self._session.execute_write(self._delete_location_tx, location_id)

    @staticmethod
    async def _delete_location_tx(tx: AsyncManagedTransaction, location_id: str) -> bool:
        result = await tx.run(
            "MATCH (l:Location {id: $id}) DETACH DELETE l RETURN count(l) AS deleted",
            id=location_id,
        )
        record = await result.single()
        if record is None:
            return False
        return bool(record["deleted"])

    _SORTABLE = {"name", "created_at", "region"}

    async def Location_list(
        self,
        *,
        limit: int,
        offset: int,
        region: str | None,
        name_contains: str | None,
        sort_by: str,
        order: str,
    ) -> tuple[list[dict], int]:
        if sort_by not in self._SORTABLE:
            sort_by = "name"
        order_kw = "DESC" if order.lower() == "desc" else "ASC"
        return await self._session.execute_read(
            self._list_tx, limit, offset, region, name_contains, sort_by, order_kw
        )

    @staticmethod
    async def _list_tx(
        tx, limit, offset, region, name_contains, sort_by, order_kw
    ) -> tuple[list[dict], int]:
        clauses, params = (
            [],
            {
                "limit": limit,
                "offset": offset,
                "region": region,
                "name_contains": name_contains,
            },
        )
        if region is not None:
            clauses.append("l.region = $region")
        if name_contains is not None:
            clauses.append("toLower(l.name) CONTAINS toLower($name_contains)")
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

        # sort_by/order_kw are whitelisted, so interpolation is safe here.
        query = f"""
        MATCH (l:Location)
        {where}
        WITH collect(l) AS all_l
        WITH all_l, size(all_l) AS total
        UNWIND all_l AS l
        WITH l, total
        ORDER BY l.{sort_by} {order_kw}
        SKIP $offset LIMIT $limit
        RETURN collect(l {{.*}}) AS items, total
        """
        result = await tx.run(query, **params)
        record = await result.single()
        if record is None:
            return [], 0
        return record["items"], record["total"]

    async def update(self, location_id: str, props: dict) -> dict | None:
        return await self._session.execute_write(self._update_tx, location_id, props)

    @staticmethod
    async def _update_tx(tx, location_id: str, props: dict) -> dict | None:
        result = await tx.run(
            "MATCH (l:Location {id:$id}) SET l += $props RETURN l {.*} AS location",
            id=location_id,
            props=props,
        )
        record = await result.single()
        return record["location"] if record else None
