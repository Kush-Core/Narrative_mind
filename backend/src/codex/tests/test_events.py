from uuid import uuid4

from fastapi.testclient import TestClient


def test_event_missing_returns_404(client: TestClient) -> None:
    res = client.get("/events/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_event_crud_lifecycle(client: TestClient) -> None:
    marker = uuid4().hex
    created = client.post("/events", json={"name": f"The Sundering {marker}", "timeline_order": 1})
    assert created.status_code == 201
    event_id = created.json()["id"]
    assert created.json()["timeline_order"] == 1
    cleanup_needed = True
    try:
        fetched = client.get(f"/events/{event_id}")
        assert fetched.status_code == 200
        assert fetched.json()["timeline_order"] == 1

        patched = client.patch(f"/events/{event_id}", json={"timeline_order": 5})
        assert patched.status_code == 200
        assert patched.json()["timeline_order"] == 5

        assert client.delete(f"/events/{event_id}").status_code == 204
        cleanup_needed = False

        assert client.get(f"/events/{event_id}").status_code == 404
    finally:
        if cleanup_needed:
            client.delete(f"/events/{event_id}")
