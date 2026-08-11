import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

# Registration normally hands a new account its own copy of the starter world.
# Tests register an account each, so that would put twenty-seven entities in front
# of every test — indistinguishable from data the test created, and fatal to any
# assertion about a total. Set before Settings is first constructed, and the cache
# cleared in case another import got there first.
os.environ["SEED_NEW_USER_WORLD"] = "false"

from narrative_mind.core.config import get_settings  # noqa: E402
from narrative_mind.main import create_app  # noqa: E402

get_settings.cache_clear()


@pytest.fixture
def unauthenticated_client():
    app = create_app()
    with TestClient(app) as c:
        yield c


PASSWORD = "correct-horse-battery-staple"


def register_and_token(c: TestClient) -> str:
    """Register a throwaway account and return its bearer token."""
    email = f"{uuid4().hex}@example.com"
    c.post("/auth/register", json={"email": email, "password": PASSWORD})
    login = c.post("/auth/login", json={"email": email, "password": PASSWORD})
    return login.json()["access_token"]


@pytest.fixture
def client(unauthenticated_client: TestClient):
    token = register_and_token(unauthenticated_client)
    unauthenticated_client.headers["Authorization"] = f"Bearer {token}"
    yield unauthenticated_client


@pytest.fixture
def other_headers(client: TestClient) -> dict[str, str]:
    """Auth headers for a *second*, unrelated account on the same app.

    Returned as headers rather than a second client because both accounts must
    talk to one app instance for the isolation tests to mean anything — two
    TestClients would prove only that two apps see different data.
    """
    token = register_and_token(client)
    return {"Authorization": f"Bearer {token}"}
