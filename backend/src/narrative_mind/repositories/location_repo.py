from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class LocationRepository:
    """Locations, scoped to one owner.

    Every query in this class filters on `owner_id`, including the reads — an
    entity belonging to another account is not hidden from the response, it is
    absent from the match, so it returns as a 404 rather than a 403. The owner
    arrives at construction time and cannot be omitted; see api/deps.py.
    """

    def __init__(self, session: AsyncSession, owner_id: str) -> None:
        self._session = session
        self._owner_id = owner_id

    async def create(self, location_data: dict[str, Any]) -> dict[str, Any]:
        return await self._session.execute_write(
            self._create_location_tx, {**location_data, "owner_id": self._owner_id}
        )

    @staticmethod
    async def _create_location_tx(
        tx: AsyncManagedTransaction, location_data: dict[str, Any]
    ) -> dict[str, Any]:
        query = """
        CREATE (l:Location {
            id: $id, name: $name, region: $region,
            description: $description, created_at: $created_at,
            owner_id: $owner_id
        })
        RETURN l {.id, .name, .region, .description, .created_at} AS location
        """
        result = await tx.run(query, **location_data)
        record = await result.single()
        if record is None:
            raise RuntimeError("Failed to create location")
        return record["location"]

    async def get(self, location_id: str) -> dict[str, Any] | None:
        return await self._session.execute_read(self._get_location_tx, location_id, self._owner_id)

    @staticmethod
    async def _get_location_tx(
        tx: AsyncManagedTransaction, location_id: str, owner_id: str
    ) -> dict[str, Any] | None:
        query = """
        MATCH (l:Location {id: $location_id, owner_id: $owner_id})
        RETURN l {.id, .name, .region, .description, .created_at} AS location
        """
        result = await tx.run(query, location_id=location_id, owner_id=owner_id)
        record = await result.single()
        return record["location"] if record else None

    async def delete(self, location_id: str) -> bool:
        return await self._session.execute_write(
            self._delete_location_tx, location_id, self._owner_id
        )

    @staticmethod
    async def _delete_location_tx(
        tx: AsyncManagedTransaction, location_id: str, owner_id: str
    ) -> bool:
        result = await tx.run(
            "MATCH (l:Location {id: $id, owner_id: $owner_id}) DETACH DELETE l "
            "RETURN count(l) AS deleted",
            id=location_id,
            owner_id=owner_id,
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
            self._list_tx, self._owner_id, limit, offset, region, name_contains, sort_by, order_kw
        )

    @staticmethod
    async def _list_tx(
        tx, owner_id, limit, offset, region, name_contains, sort_by, order_kw
    ) -> tuple[list[dict], int]:
        clauses, params = (
            ["l.owner_id = $owner_id"],
            {
                "owner_id": owner_id,
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
        where = "WHERE " + " AND ".join(clauses)

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
        RETURN collect(l {{.id, .name, .region, .description, .created_at}}) AS items, total
        """
        result = await tx.run(query, **params)
        record = await result.single()
        if record is None:
            return [], 0
        return record["items"], record["total"]

    async def update(self, location_id: str, props: dict) -> dict | None:
        return await self._session.execute_write(
            self._update_tx, location_id, props, self._owner_id
        )

    @staticmethod
    async def _update_tx(tx, location_id: str, props: dict, owner_id: str) -> dict | None:
        result = await tx.run(
            "MATCH (l:Location {id:$id, owner_id:$owner_id}) SET l += $props "
            "RETURN l {.id, .name, .region, .description, .created_at} AS location",
            id=location_id,
            props=props,
            owner_id=owner_id,
        )
        record = await result.single()
        return record["location"] if record else None
