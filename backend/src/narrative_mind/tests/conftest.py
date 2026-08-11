import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from neo4j import GraphDatabase

# Registration normally hands a new account its own copy of the starter world.
# Tests register an account each, so that would put twenty-seven entities in front
# of every test — indistinguishable from data the test created, and fatal to any
# assertion about a total. Set before Settings is first constructed, and the cache
# cleared in case another import got there first.
os.environ["SEED_NEW_USER_WORLD"] = "false"

from narrative_mind.core.config import get_settings  # noqa: E402
from narrative_mind.main import create_app  # noqa: E402

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
