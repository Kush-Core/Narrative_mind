"""Two accounts must not be able to reach each other's world.

These run against a live Neo4j like the other integration tests. `other_headers`
is a second registered account on the same app, so every assertion here is about
one request being refused rather than about two apps holding different data.

Note the expected status throughout is **404, not 403**: an entity that is not
yours is absent from the match rather than hidden from the response, which is
both simpler to enforce and the answer that reveals least.
"""

import asyncio

from fastapi.testclient import TestClient
from neo4j import AsyncGraphDatabase

from narrative_mind.core.config import get_settings
from narrative_mind.domain.starter_world import CHARACTERS, entity_id
from narrative_mind.repositories.world_repo import WorldRepository


def _make(client: TestClient, collection: str, name: str, **extra) -> dict:
    res = client.post(f"/{collection}", json={"name": name, **extra})
    assert res.status_code == 201, res.text
    return res.json()


def test_list_shows_only_your_own_entities(client: TestClient, other_headers: dict) -> None:
    _make(client, "characters", "Owned By First")

    mine = client.get("/characters").json()
    theirs = client.get("/characters", headers=other_headers).json()

    assert mine["total"] == 1
    assert theirs["total"] == 0


def test_other_account_cannot_read_your_entity(client: TestClient, other_headers: dict) -> None:
    character = _make(client, "characters", "Private")

    assert client.get(f"/characters/{character['id']}").status_code == 200
    assert client.get(f"/characters/{character['id']}", headers=other_headers).status_code == 404


def test_other_account_cannot_edit_or_delete_your_entity(
    client: TestClient, other_headers: dict
) -> None:
    character = _make(client, "characters", "Untouchable")
    cid = character["id"]

    patched = client.patch(f"/characters/{cid}", json={"name": "Hijacked"}, headers=other_headers)
    assert patched.status_code == 404
    assert client.delete(f"/characters/{cid}", headers=other_headers).status_code == 404

    # Still there, still named what its owner called it.
    survivor = client.get(f"/characters/{cid}").json()
    assert survivor["name"] == "Untouchable"


def test_relationships_cannot_cross_accounts(client: TestClient, other_headers: dict) -> None:
    mine = _make(client, "characters", "My Character")

    theirs = client.post("/characters", json={"name": "Their Character"}, headers=other_headers)
    assert theirs.status_code == 201
    their_id = theirs.json()["id"]

    # Their character as the source: the source is not ours, so it is not found.
    assert (
        client.post(
            f"/characters/{their_id}/relationships",
            json={"rel_type": "KNOWS", "target_id": mine["id"]},
        ).status_code
        == 404
    )
    # Our character as the source, theirs as the target: the target is not found.
    assert (
        client.post(
            f"/characters/{mine['id']}/relationships",
            json={"rel_type": "KNOWS", "target_id": their_id},
        ).status_code
        == 404
    )


def test_graph_endpoints_refuse_another_accounts_character(
    client: TestClient, other_headers: dict
) -> None:
    mine = _make(client, "characters", "Centre")

    assert client.get(f"/graph/characters/{mine['id']}/network").status_code == 200
    assert (
        client.get(f"/graph/characters/{mine['id']}/network", headers=other_headers).status_code
        == 404
    )


def test_traversal_does_not_reach_another_accounts_nodes(
    client: TestClient, other_headers: dict
) -> None:
    """Identically named characters in two worlds must not appear in one network."""
    a1 = _make(client, "characters", "Shared Name")
    a2 = _make(client, "characters", "Neighbour")
    link = client.post(
        f"/characters/{a1['id']}/relationships",
        json={"rel_type": "KNOWS", "target_id": a2["id"]},
    )
    assert link.status_code == 201, link.text

    b1 = client.post("/characters", json={"name": "Shared Name"}, headers=other_headers).json()
    b2 = client.post("/characters", json={"name": "Neighbour"}, headers=other_headers).json()
    client.post(
        f"/characters/{b1['id']}/relationships",
        json={"rel_type": "KNOWS", "target_id": b2["id"]},
        headers=other_headers,
    )

    network = client.get(f"/graph/characters/{a1['id']}/network", params={"depth": 3}).json()
    reachable = {n["id"] for n in network["neighbors"]} | {network["center"]["id"]}

    assert a2["id"] in reachable
    assert b1["id"] not in reachable
    assert b2["id"] not in reachable


def test_shortest_path_across_accounts_is_not_found(
    client: TestClient, other_headers: dict
) -> None:
    mine = _make(client, "characters", "Path Start")
    theirs = client.post("/characters", json={"name": "Path End"}, headers=other_headers).json()

    res = client.get("/graph/shortest-path", params={"source": mine["id"], "target": theirs["id"]})
    assert res.status_code == 404


# --------------------------------------------------------------- starter world


def _with_world_repo(coro_factory):
    """Run a coroutine against a real session, since seeding is a repository concern."""

    async def run():
        settings = get_settings()
        driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri, auth=(settings.neo4j_username, settings.neo4j_password)
        )
        try:
            async with driver.session() as session:
                return await coro_factory(WorldRepository(session))
        finally:
            await driver.close()

    return asyncio.run(run())


def test_starter_world_is_seeded_per_owner_and_is_disjoint() -> None:
    owner_a = "test-owner-a"
    owner_b = "test-owner-b"

    async def scenario(repo: WorldRepository):
        await repo.wipe_world(owner_a)
        await repo.wipe_world(owner_b)
        await repo.seed_starter_world(owner_a)
        await repo.seed_starter_world(owner_b)
        counts_a = await repo.counts(owner_a)
        counts_b = await repo.counts(owner_b)
        removed_a = await repo.wipe_world(owner_a)
        after_b = await repo.counts(owner_b)
        await repo.wipe_world(owner_b)
        return counts_a, counts_b, removed_a, after_b

    counts_a, counts_b, removed_a, after_b = _with_world_repo(scenario)

    expected_nodes = {"Character": 10, "Location": 6, "Faction": 5, "Event": 6}
    assert counts_a["nodes"] == expected_nodes
    assert counts_b["nodes"] == expected_nodes
    assert sum(counts_a["edges"].values()) == 69

    # Same slugs, different ids, so both copies coexist under one unique-id constraint.
    slug = CHARACTERS[0][0]
    assert entity_id(owner_a, slug) != entity_id(owner_b, slug)

    # Wiping one owner's world leaves the other's whole.
    assert sum(removed_a.values()) == 27
    assert after_b["nodes"] == expected_nodes
