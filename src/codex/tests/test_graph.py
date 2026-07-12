from uuid import uuid4

from fastapi.testclient import TestClient


def test_character_network_missing_returns_404(client: TestClient) -> None:
    res = client.get("/graph/characters/does-not-exist/network?depth=1")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_character_network_includes_linked_neighbor(client: TestClient) -> None:
    marker = uuid4().hex
    source = client.post("/characters", json={"name": f"A{marker}"}).json()
    target = client.post("/characters", json={"name": f"B{marker}"}).json()
    try:
        relationship = client.post(
            f"/characters/{source['id']}/relationships",
            json={"rel_type": "KNOWS", "target_id": target["id"], "sentiment": "ally"},
        )
        assert relationship.status_code == 201

        res = client.get(f"/graph/characters/{source['id']}/network?depth=1")
        assert res.status_code == 200
        body = res.json()
        assert body["center"]["id"] == source["id"]
        neighbor_ids = {neighbor["id"] for neighbor in body["neighbors"]}
        assert target["id"] in neighbor_ids
    finally:
        client.delete(f"/characters/{source['id']}")
        client.delete(f"/characters/{target['id']}")


def test_shortest_path_between_linked_characters(client: TestClient) -> None:
    marker = uuid4().hex
    source = client.post("/characters", json={"name": f"A{marker}"}).json()
    target = client.post("/characters", json={"name": f"B{marker}"}).json()
    try:
        client.post(
            f"/characters/{source['id']}/relationships",
            json={"rel_type": "KNOWS", "target_id": target["id"]},
        )

        res = client.get(f"/graph/shortest-path?source={source['id']}&target={target['id']}")
        assert res.status_code == 200
        body = res.json()
        assert body["distance"] == 1
        hop_ids = [hop["id"] for hop in body["hops"]]
        assert hop_ids[0] == source["id"]
        assert hop_ids[-1] == target["id"]
    finally:
        client.delete(f"/characters/{source['id']}")
        client.delete(f"/characters/{target['id']}")
