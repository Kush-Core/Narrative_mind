from uuid import uuid4

from fastapi.testclient import TestClient


def test_location_missing_returns_404(client: TestClient) -> None:
    res = client.get("/locations/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_location_crud_lifecycle(client: TestClient) -> None:
    marker = uuid4().hex
    created = client.post("/locations", json={"name": f"Dunhollow {marker}", "region": "North"})
    assert created.status_code == 201
    location_id = created.json()["id"]
    cleanup_needed = True
    try:
        fetched = client.get(f"/locations/{location_id}")
        assert fetched.status_code == 200
        assert fetched.json()["region"] == "North"

        patched = client.patch(f"/locations/{location_id}", json={"region": "South"})
        assert patched.status_code == 200
        assert patched.json()["region"] == "South"

        assert client.delete(f"/locations/{location_id}").status_code == 204
        cleanup_needed = False

        assert client.get(f"/locations/{location_id}").status_code == 404
    finally:
        if cleanup_needed:
            client.delete(f"/locations/{location_id}")
