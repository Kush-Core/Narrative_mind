from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from narrative_mind.main import create_app


@pytest.fixture
def unauthenticated_client():
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client(unauthenticated_client: TestClient):
    email = f"{uuid4().hex}@example.com"
    password = "correct-horse-battery-staple"

    unauthenticated_client.post("/auth/register", json={"email": email, "password": password})
    login = unauthenticated_client.post("/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    unauthenticated_client.headers["Authorization"] = f"Bearer {token}"
    yield unauthenticated_client
