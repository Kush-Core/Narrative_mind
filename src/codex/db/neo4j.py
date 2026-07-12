from collections.abc import AsyncGenerator

from neo4j import AsyncDriver, AsyncGraphDatabase, AsyncSession

from codex.core.config import Settings

_driver: AsyncDriver | None = None


async def connect(settings: Settings) -> AsyncDriver:
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
        await _driver.verify_connectivity()
    return _driver


async def close() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


def get_driver() -> AsyncDriver:
    if _driver is None:
        raise RuntimeError("Neo4j driver is not connected. Call connect() first.")
    return _driver


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_driver().session() as session:
        yield session
