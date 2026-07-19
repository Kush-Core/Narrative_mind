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


def test_character_network_projects_typed_relationships(client: TestClient) -> None:
    """An edge carries its direction, its type, and its sentiment."""
    marker = uuid4().hex
    source = client.post("/characters", json={"name": f"A{marker}"}).json()
    target = client.post("/characters", json={"name": f"B{marker}"}).json()
    try:
        client.post(
            f"/characters/{source['id']}/relationships",
            json={"rel_type": "KNOWS", "target_id": target["id"], "sentiment": "ally"},
        )

        body = client.get(f"/graph/characters/{source['id']}/network?depth=1").json()
        edges = body["relationships"]

        assert len(edges) == 1
        assert edges[0] == {
            "source": source["id"],
            "target": target["id"],
            "rel_type": "KNOWS",
            "sentiment": "ally",
        }
    finally:
        client.delete(f"/characters/{source['id']}")
        client.delete(f"/characters/{target['id']}")


def test_character_network_includes_edges_between_neighbors(client: TestClient) -> None:
    """The projection is the induced subgraph, not just the centre's own edges.

    B→C is two hops from A along the traversal, so a projection built from the
    outward paths would omit it even though both endpoints are reported. Missing
    it would make the client draw a star where the data holds a triangle.
    """
    marker = uuid4().hex
    a = client.post("/characters", json={"name": f"A{marker}"}).json()
    b = client.post("/characters", json={"name": f"B{marker}"}).json()
    c = client.post("/characters", json={"name": f"C{marker}"}).json()
    try:
        for src, dst in ((a, b), (a, c), (b, c)):
            client.post(
                f"/characters/{src['id']}/relationships",
                json={"rel_type": "KNOWS", "target_id": dst["id"]},
            )

        body = client.get(f"/graph/characters/{a['id']}/network?depth=1").json()
        edges = {(e["source"], e["target"]) for e in body["relationships"]}

        assert (b["id"], c["id"]) in edges
        assert edges == {(a["id"], b["id"]), (a["id"], c["id"]), (b["id"], c["id"])}
    finally:
        for entity in (a, b, c):
            client.delete(f"/characters/{entity['id']}")


def test_character_network_without_relationships_is_empty_not_null(client: TestClient) -> None:
    """An unconnected character must return empty collections, not nulls."""
    marker = uuid4().hex
    solo = client.post("/characters", json={"name": f"Solo{marker}"}).json()
    try:
        body = client.get(f"/graph/characters/{solo['id']}/network?depth=1").json()
        assert body["neighbors"] == []
        assert body["relationships"] == []
    finally:
        client.delete(f"/characters/{solo['id']}")


def test_character_network_relationships_reference_reported_nodes(client: TestClient) -> None:
    """Every edge endpoint must appear in the node set, or it cannot be drawn."""
    marker = uuid4().hex
    character = client.post("/characters", json={"name": f"A{marker}"}).json()
    faction = client.post("/factions", json={"name": f"F{marker}"}).json()
    try:
        client.post(
            f"/characters/{character['id']}/relationships",
            json={"rel_type": "MEMBER_OF", "target_id": faction["id"]},
        )

        body = client.get(f"/graph/characters/{character['id']}/network?depth=2").json()
        node_ids = {body["center"]["id"]} | {n["id"] for n in body["neighbors"]}

        assert body["relationships"], "expected at least one edge"
        for edge in body["relationships"]:
            assert edge["source"] in node_ids
            assert edge["target"] in node_ids
    finally:
        client.delete(f"/characters/{character['id']}")
        client.delete(f"/factions/{faction['id']}")


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
