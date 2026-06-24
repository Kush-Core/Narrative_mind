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