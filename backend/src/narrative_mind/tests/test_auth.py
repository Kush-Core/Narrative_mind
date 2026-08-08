from uuid import uuid4

from fastapi.testclient import TestClient


def test_register_returns_user(unauthenticated_client: TestClient) -> None:
    email = f"{uuid4().hex}@example.com"
    res = unauthenticated_client.post(
        "/auth/register", json={"email": email, "password": "correct-horse-battery-staple"}
    )
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == email
    assert "password" not in body
    assert "password_hash" not in body


def test_register_duplicate_email_conflicts(unauthenticated_client: TestClient) -> None:
    email = f"{uuid4().hex}@example.com"
    payload = {"email": email, "password": "correct-horse-battery-staple"}

    first = unauthenticated_client.post("/auth/register", json=payload)
    assert first.status_code == 201

    second = unauthenticated_client.post("/auth/register", json=payload)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "conflict"


def test_login_returns_bearer_token(unauthenticated_client: TestClient) -> None:
    email = f"{uuid4().hex}@example.com"
    password = "correct-horse-battery-staple"
    unauthenticated_client.post("/auth/register", json={"email": email, "password": password})

    res = unauthenticated_client.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    body = res.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_wrong_password_rejected(unauthenticated_client: TestClient) -> None:
    email = f"{uuid4().hex}@example.com"
    unauthenticated_client.post(
        "/auth/register", json={"email": email, "password": "correct-horse-battery-staple"}
    )

    res = unauthenticated_client.post(
        "/auth/login", json={"email": email, "password": "wrong-password"}
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "authentication_error"


def test_login_unknown_email_rejected(unauthenticated_client: TestClient) -> None:
    res = unauthenticated_client.post(
        "/auth/login", json={"email": f"{uuid4().hex}@example.com", "password": "whatever"}
    )
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "authentication_error"


def test_protected_route_without_token_rejected(unauthenticated_client: TestClient) -> None:
    res = unauthenticated_client.get("/characters")
    assert res.status_code == 401


def test_protected_route_with_invalid_token_rejected(unauthenticated_client: TestClient) -> None:
    unauthenticated_client.headers["Authorization"] = "Bearer not-a-real-token"
    res = unauthenticated_client.get("/characters")
    assert res.status_code == 401


def test_protected_route_with_valid_token_allowed(client: TestClient) -> None:
    res = client.get("/characters")
    assert res.status_code == 200


def test_health_stays_public(unauthenticated_client: TestClient) -> None:
    res = unauthenticated_client.get("/health")
    assert res.status_code == 200
