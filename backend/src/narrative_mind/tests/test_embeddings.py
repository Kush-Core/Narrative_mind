"""The embedding write path: canonical text construction, and that create
and update actually persist a vector stamped with the model that produced it.

Canonical-text assertions are pure-function tests — no database. The
create/update assertions run against a live account, reading the raw node
back through `teardown_driver`: `embedding`/`embedding_model`/`embedded_at`
are never part of any JSON response (see the `{.*}` note in CLAUDE.md), so a
real Cypher read is the only way to see them.
"""

from fastapi.testclient import TestClient
from neo4j import Driver

from narrative_mind.providers.embeddings import FakeEmbeddingProvider
from narrative_mind.services.embedding_service import canonical_text


def test_canonical_text_covers_each_labels_fields() -> None:
    character = canonical_text(
        "Character",
        {
            "name": "Aria Vane",
            "aliases": ["The Vane"],
            "status": "alive",
            "description": "A captain.",
        },
    )
    assert character == "Aria Vane (The Vane). Status: alive. A captain."

    location = canonical_text(
        "Location",
        {"name": "Dunhollow", "region": "The Reach", "description": "A crossroads town."},
    )
    assert location == "Dunhollow. Region: The Reach. A crossroads town."

    faction = canonical_text(
        "Faction",
        {"name": "Iron Pact", "ideology": "Order above all", "description": "A martial order."},
    )
    assert faction == "Iron Pact. Ideology: Order above all. A martial order."


def test_canonical_text_does_not_double_a_terminal_period() -> None:
    # Real starter-world ideologies are often full sentences already ending
    # in punctuation (Kestrel Order's is "...The high ground was earned.") —
    # a naive f"{value}." would produce a double period.
    faction = canonical_text(
        "Faction",
        {"name": "Kestrel Order", "ideology": "The high ground was earned."},
    )
    assert faction == "Kestrel Order. Ideology: The high ground was earned."
    assert ".." not in faction

    event = canonical_text("Event", {"name": "The Sundering", "summary": "The world broke in two."})
    assert event == "The Sundering. The world broke in two."


def test_canonical_text_omits_absent_fields() -> None:
    # No aliases, no attribute for this label, no description/summary — the
    # header still forms, nothing else does.
    bare = canonical_text("Location", {"name": "Nowhere"})
    assert bare == "Nowhere."


def test_canonical_text_is_deterministic() -> None:
    entity = {"name": "Aria Vane", "status": "alive", "description": "A captain."}
    assert canonical_text("Character", entity) == canonical_text("Character", entity)


def _raw_character(driver: Driver, character_id: str) -> dict:
    with driver.session() as session:
        record = session.run(
            "MATCH (c:Character {id: $id}) "
            "RETURN c.embedding AS embedding, c.embedding_model AS embedding_model, "
            "c.embedded_at AS embedded_at",
            id=character_id,
        ).single()
        return dict(record) if record else {}


def test_create_persists_a_vector_under_the_current_model(
    client: TestClient, teardown_driver: Driver
) -> None:
    created = client.post("/characters", json={"name": "Vector Test"}).json()

    row = _raw_character(teardown_driver, created["id"])
    fake = FakeEmbeddingProvider()

    assert row["embedding"] is not None
    assert len(row["embedding"]) == fake.dimensions
    assert row["embedding_model"] == fake.model_name
    assert row["embedded_at"] is not None


def test_update_re_embeds_and_moves_embedded_at(
    client: TestClient, teardown_driver: Driver
) -> None:
    created = client.post(
        "/characters", json={"name": "Vector Test", "description": "before"}
    ).json()
    before = _raw_character(teardown_driver, created["id"])

    updated = client.patch(f"/characters/{created['id']}", json={"description": "after"})
    assert updated.status_code == 200

    after = _raw_character(teardown_driver, created["id"])

    assert after["embedded_at"] != before["embedded_at"]
    assert after["embedding"] != before["embedding"]
