import asyncio
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from neo4j import AsyncGraphDatabase, GraphDatabase

# Registration normally hands a new account its own copy of the starter world.
# Tests register an account each, so that would put twenty-seven entities in front
# of every test — indistinguishable from data the test created, and fatal to any
# assertion about a total. Set before Settings is first constructed, and the cache
# cleared in case another import got there first.
os.environ["SEED_NEW_USER_WORLD"] = "false"

from narrative_mind.core.config import get_settings  # noqa: E402
from narrative_mind.core.security import decode_access_token  # noqa: E402
from narrative_mind.main import create_app  # noqa: E402
from narrative_mind.providers.deps import get_embedder  # noqa: E402
from narrative_mind.providers.embeddings import FakeEmbeddingProvider  # noqa: E402
from narrative_mind.repositories.embedding_repo import EmbeddingRepository  # noqa: E402
from narrative_mind.repositories.world_repo import WorldRepository  # noqa: E402
from narrative_mind.services.embedding_service import EmbeddingService  # noqa: E402

get_settings.cache_clear()

PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(scope="session")
def teardown_driver():
    """A driver used only to clean up after tests.

    Synchronous, and separate from the one the app opens. The app's driver is
    async and bound to whichever event loop served the request; a teardown that
    borrowed it would have to run inside that loop, and `asyncio.run` builds a
    fresh loop each call. A sync driver sidesteps the question entirely and can
    be opened once for the whole session.
    """
    settings = get_settings()
    driver = GraphDatabase.driver(
        settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
    )
    try:
        yield driver
    finally:
        driver.close()


@pytest.fixture
def registered_accounts(teardown_driver) -> list[str]:
    """Ids of the accounts a test registers, deleted with their worlds afterwards.

    Tests run against a real database, so without this every run leaves its
    accounts behind — 68 of them had accumulated before this fixture existed.
    Deleting the account and everything carrying its `owner_id` is a complete
    teardown precisely because worlds are owned: all of a test's data hangs off
    an account it created, so there is nothing else to find.

    This list is populated by `register_and_token`. It is set up before `client`
    (which depends on it) and so tears down after it, once the test is done with
    the app.
    """
    accounts: list[str] = []
    yield accounts

    if not accounts:
        return
    with teardown_driver.session() as session:
        session.run(
            """
            MATCH (u:User) WHERE u.id IN $ids
            OPTIONAL MATCH (owned) WHERE owned.owner_id = u.id
            DETACH DELETE owned, u
            """,
            ids=accounts,
        ).consume()


def track_account(accounts: list[str], response) -> None:
    """Record a registration a test made itself, so teardown collects it too.

    For tests of `/auth/register` and `/auth/login`, which have to call register
    directly — the fixture below cannot stand in for the thing under test. A
    response that was not a 201 created nothing and is ignored.
    """
    if response.status_code == 201:
        accounts.append(response.json()["id"])


def register_and_token(c: TestClient, accounts: list[str]) -> str:
    """Register a throwaway account, record it for teardown, return its token."""
    email = f"{uuid4().hex}@example.com"
    created = c.post("/auth/register", json={"email": email, "password": PASSWORD})
    assert created.status_code == 201, created.text
    accounts.append(created.json()["id"])

    login = c.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


@pytest.fixture
def unauthenticated_client():
    app = create_app()
    # Every entity create/update now embeds synchronously (see
    # services/embedding_service.py), so without this override the suite
    # would make a real Ollama/Google call on every character/location/
    # faction/event test — slow, networked, and non-deterministic. The fake
    # is stable per input text, so nothing that asserts on stored vectors
    # needs a live provider either.
    app.dependency_overrides[get_embedder] = FakeEmbeddingProvider
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client(unauthenticated_client: TestClient, registered_accounts: list[str]):
    token = register_and_token(unauthenticated_client, registered_accounts)
    unauthenticated_client.headers["Authorization"] = f"Bearer {token}"
    yield unauthenticated_client


@pytest.fixture
def other_headers(client: TestClient, registered_accounts: list[str]) -> dict[str, str]:
    """Auth headers for a *second*, unrelated account on the same app.

    Returned as headers rather than a second client because both accounts must
    talk to one app instance for the isolation tests to mean anything — two
    TestClients would prove only that two apps see different data.
    """
    token = register_and_token(client, registered_accounts)
    return {"Authorization": f"Bearer {token}"}


def make_entity(client: TestClient, collection: str, name: str, **extra) -> dict:
    """POST a new entity through the API and return it. RAG tests need real
    entities — with real, synchronously-written embeddings — rather than
    Cypher fixtures, since the whole point is testing the write/retrieval
    path the API actually exercises."""
    res = client.post(f"/{collection}", json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()


@pytest.fixture
def rag_world(client: TestClient) -> dict:
    """A small, known world for one account: one location, one faction, and
    two characters — one of them linked to both, plus each other. Built
    through the API, so every entity here goes through the same synchronous
    embedding path real usage does.

    `SEED_NEW_USER_WORLD` is off for the whole suite (see the top of this
    file), so RAG tests that need more than an empty account build their own
    fixture rather than relying on the starter world.
    """
    location = make_entity(client, "locations", "Stormhaven", region="The Reach")
    faction = make_entity(client, "factions", "The Iron Vigil", ideology="Order above all.")
    character = make_entity(
        client,
        "characters",
        "Corwin Ashgrove",
        status="alive",
        description="Captain of the Iron Vigil, stationed at Stormhaven.",
    )
    other_character = make_entity(client, "characters", "Mira Wren", status="alive")

    for rel_type, target_id in (
        ("MEMBER_OF", faction["id"]),
        ("LOCATED_IN", location["id"]),
        ("KNOWS", other_character["id"]),
    ):
        res = client.post(
            f"/characters/{character['id']}/relationships",
            json={"rel_type": rel_type, "target_id": target_id},
        )
        assert res.status_code == 201, res.text

    return {
        "location": location,
        "faction": faction,
        "character": character,
        "other_character": other_character,
    }


@pytest.fixture
def client_owner_id(client: TestClient) -> str:
    """The owner_id behind `client`'s bearer token, for resolving
    entity_id(owner_id, slug) in graph-recall assertions."""
    token = client.headers["Authorization"].removeprefix("Bearer ")
    return decode_access_token(token)["sub"]


@pytest.fixture
def starter_world(client: TestClient, client_owner_id: str) -> None:
    """This account's copy of the starter world, embedded with the fake embedder.

    `SEED_NEW_USER_WORLD` is off for the whole suite (top of this file), and
    there is no precomputed embedding file for `fake-embedding-v1`, so the
    world is seeded unembedded and then backfilled through the same recovery
    path scripts/backfill_embeddings.py uses.

    A short-lived async driver is opened and closed entirely inside one
    `asyncio.run`, so nothing crosses into the TestClient's event loop — the
    hazard `teardown_driver` documents is about *sharing* the app's driver,
    which this does not do. Teardown is already covered: `registered_accounts`
    deletes everything carrying this owner_id.
    """
    settings = get_settings()

    async def _seed() -> None:
        driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
        )
        try:
            async with driver.session() as session:
                await WorldRepository(session).seed_starter_world(client_owner_id)
                embedder = FakeEmbeddingProvider()
                await EmbeddingService(
                    EmbeddingRepository(session, client_owner_id), embedder
                ).backfill()
        finally:
            await driver.close()

    asyncio.run(_seed())
