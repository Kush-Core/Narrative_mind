from uuid import uuid4

from fastapi.testclient import TestClient


def test_get_missing_returns_404(client: TestClient) -> None:
    res = client.get("/characters/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_character_crud_lifecycle(client: TestClient) -> None:
    marker = uuid4().hex
    created = client.post("/characters", json={"name": f"Aria {marker}"})
    assert created.status_code == 201
    character_id = created.json()["id"]
    cleanup_needed = True
    try:
        fetched = client.get(f"/characters/{character_id}")
        assert fetched.status_code == 200
        assert fetched.json()["name"] == f"Aria {marker}"

        patched = client.patch(f"/characters/{character_id}", json={"status": "dead"})
        assert patched.status_code == 200
        assert patched.json()["status"] == "dead"

        assert client.delete(f"/characters/{character_id}").status_code == 204
        cleanup_needed = False

        assert client.get(f"/characters/{character_id}").status_code == 404
    finally:
        if cleanup_needed:
            client.delete(f"/characters/{character_id}")


def test_character_pagination_boundaries(client: TestClient) -> None:
    marker = uuid4().hex
    character_ids = []
    for index in range(3):
        created = client.post("/characters", json={"name": f"P{marker} {index}"})
        assert created.status_code == 201
        character_ids.append(created.json()["id"])
    try:
        first = client.get(f"/characters?name_contains={marker}&limit=2&offset=0")
        assert first.status_code == 200
        first_body = first.json()
        assert first_body["total"] == 3
        assert len(first_body["items"]) == 2
        assert first_body["limit"] == 2
        assert first_body["offset"] == 0

        second = client.get(f"/characters?name_contains={marker}&limit=2&offset=2")
        second_body = second.json()
        assert second_body["total"] == 3
        assert len(second_body["items"]) == 1
    finally:
        for character_id in character_ids:
            client.delete(f"/characters/{character_id}")


def test_character_relationship_member_of(client: TestClient) -> None:
    marker = uuid4().hex
    character = client.post("/characters", json={"name": f"C{marker}"}).json()
    faction = client.post("/factions", json={"name": f"F{marker}"}).json()
    try:
        relationship = client.post(
            f"/characters/{character['id']}/relationships",
            json={"rel_type": "MEMBER_OF", "target_id": faction["id"]},
        )
        assert relationship.status_code == 201
        body = relationship.json()
        assert body["rel_type"] == "MEMBER_OF"
        assert body["source_id"] == character["id"]
        assert body["target_id"] == faction["id"]
    finally:
        client.delete(f"/characters/{character['id']}")
        client.delete(f"/factions/{faction['id']}")


def test_character_relationship_target_not_found(client: TestClient) -> None:
    marker = uuid4().hex
    character = client.post("/characters", json={"name": f"C{marker}"}).json()
    try:
        relationship = client.post(
            f"/characters/{character['id']}/relationships",
            json={"rel_type": "MEMBER_OF", "target_id": "does-not-exist"},
        )
        assert relationship.status_code == 404
        assert relationship.json()["error"]["code"] == "not_found"
    finally:
        client.delete(f"/characters/{character['id']}")


def test_character_relationship_invalid_type(client: TestClient) -> None:
    marker = uuid4().hex
    character = client.post("/characters", json={"name": f"C{marker}"}).json()
    try:
        relationship = client.post(
            f"/characters/{character['id']}/relationships",
            json={"rel_type": "BEFRIENDS", "target_id": character["id"]},
        )
        assert relationship.status_code == 422
        assert relationship.json()["error"]["code"] == "domain_validation"
    finally:
        client.delete(f"/characters/{character['id']}")
