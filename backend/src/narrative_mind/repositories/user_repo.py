from typing import Any

from neo4j import AsyncManagedTransaction, AsyncSession


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, user_data: dict[str, Any]) -> dict[str, Any]:
        return await self._session.execute_write(
            self._create_user_tx,
            user_data,
        )

    @staticmethod
    async def _create_user_tx(
        tx: AsyncManagedTransaction,
        user_data: dict[str, Any],
    ) -> dict[str, Any]:
        query = """
        CREATE (u:User {
            id: $id,
            email: $email,
            password_hash: $password_hash,
            created_at: $created_at
        })
        RETURN u {.*} AS user
        """

        result = await tx.run(query, **user_data)
        record = await result.single()

        if record is None:
            raise RuntimeError("Failed to create user")

        return record["user"]

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        return await self._session.execute_read(
            self._get_by_email_tx,
            email,
        )

    @staticmethod
    async def _get_by_email_tx(
        tx: AsyncManagedTransaction,
        email: str,
    ) -> dict[str, Any] | None:
        query = """
        MATCH (u:User {email: $email})
        RETURN u {.*} AS user
        """

        result = await tx.run(query, email=email)
        record = await result.single()

        return record["user"] if record else None

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        return await self._session.execute_read(
            self._get_by_id_tx,
            user_id,
        )

    @staticmethod
    async def _get_by_id_tx(
        tx: AsyncManagedTransaction,
        user_id: str,
    ) -> dict[str, Any] | None:
        query = """
        MATCH (u:User {id: $user_id})
        RETURN u {.*} AS user
        """

        result = await tx.run(query, user_id=user_id)
        record = await result.single()

        return record["user"] if record else None
