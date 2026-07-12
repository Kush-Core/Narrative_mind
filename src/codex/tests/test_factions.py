from uuid import uuid4

from fastapi.testclient import TestClient


def test_faction_missing_returns_404(client: TestClient) -> None:
    res = client.get("/factions/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_faction_crud_lifecycle(client: TestClient) -> None:
    marker = uuid4().hex
    created = client.post("/factions", json={"name": f"Iron Pact {marker}", "ideology": "Order"})
    assert created.status_code == 201
    faction_id = created.json()["id"]
    cleanup_needed = True
    try:
        fetched = client.get(f"/factions/{faction_id}")
        assert fetched.status_code == 200
        assert fetched.json()["ideology"] == "Order"

        patched = client.patch(f"/factions/{faction_id}", json={"ideology": "Chaos"})
        assert patched.status_code == 200
        assert patched.json()["ideology"] == "Chaos"

        assert client.delete(f"/factions/{faction_id}").status_code == 204
        cleanup_needed = False

        assert client.get(f"/factions/{faction_id}").status_code == 404
    finally:
        if cleanup_needed:
            client.delete(f"/factions/{faction_id}")
