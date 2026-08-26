"""The retrieval and generation surfaces must never let one account's
question reach another account's entities — including when the other
account's world contains a *byte-identical* entity that would tie (or,
depending on ordering, outrank) the caller's own match on raw cosine
similarity.

This is the test that would catch a regression to
`db.index.vector.queryNodes()`: that index returns the global top-K across the
*entire* database with no owner pre-filter, so an identical-text entity sitting
in a different account's world would be indistinguishable from the caller's own
— and could easily win the ranking, or simply crowd the caller's real match out
of a small top-K. The backend README covers the trade in full, under "The two
Graph RAG decisions worth knowing before you change anything".
"""

from fastapi.testclient import TestClient

from narrative_mind.providers.deps import get_llm
from narrative_mind.tests.conftest import make_entity


class _StubLLM:
    def __init__(self, answer: str) -> None:
        self._answer = answer

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        return self._answer

    async def generate_structured(
        self, prompt: str, schema: dict[str, object], *, system: str | None = None
    ) -> str:
        raise AssertionError("not used")


def test_retrieve_never_returns_another_accounts_entity(
    client: TestClient, other_headers: dict
) -> None:
    mine = make_entity(client, "characters", "Shared Name", description="Byte-identical text.")
    theirs = client.post(
        "/characters",
        json={"name": "Shared Name", "description": "Byte-identical text."},
        headers=other_headers,
    ).json()
    # Same name, same description -> same canonical text -> same fake vector.
    # A global, unscoped search would see these as indistinguishable.

    result = client.post("/ai/retrieve", json={"question": "Shared Name", "top_k": 5}).json()

    seed_ids = {s["id"] for s in result["seeds"]}
    entity_ids = {e["id"] for e in result["entities"]}

    assert mine["id"] in seed_ids
    assert theirs["id"] not in seed_ids
    assert theirs["id"] not in entity_ids


def test_expansion_never_walks_into_another_accounts_world(
    client: TestClient, other_headers: dict
) -> None:
    """Even a relationship-shaped coincidence must not bridge two accounts.

    Both accounts build an identical two-character KNOWS pair with the same
    names; `GraphRepository.expand` is owner-scoped at the seed-resolution
    MATCH, so the second account's characters should never enter the first
    account's expansion no matter how the fake embeddings happen to rank.
    """
    mine_a = make_entity(client, "characters", "Shared Name")
    mine_b = make_entity(client, "characters", "Shared Neighbour")
    client.post(
        f"/characters/{mine_a['id']}/relationships",
        json={"rel_type": "KNOWS", "target_id": mine_b["id"]},
    )

    theirs_a = client.post(
        "/characters", json={"name": "Shared Name"}, headers=other_headers
    ).json()
    theirs_b = client.post(
        "/characters", json={"name": "Shared Neighbour"}, headers=other_headers
    ).json()
    client.post(
        f"/characters/{theirs_a['id']}/relationships",
        json={"rel_type": "KNOWS", "target_id": theirs_b["id"]},
        headers=other_headers,
    )

    result = client.post(
        "/ai/retrieve", json={"question": "Shared Name", "top_k": 5, "depth": 1}
    ).json()
    entity_ids = {e["id"] for e in result["entities"]}

    assert mine_a["id"] in entity_ids
    assert mine_b["id"] in entity_ids
    assert theirs_a["id"] not in entity_ids
    assert theirs_b["id"] not in entity_ids


def test_ask_never_cites_another_accounts_entity_even_if_the_model_tries(
    client: TestClient, other_headers: dict
) -> None:
    """A stub standing in for a model that has somehow produced the *other*
    account's real id — the only way to test this deterministically, since a
    real model has no way to know an id it was never shown in its context."""
    mine = make_entity(client, "characters", "Shared Name")
    theirs = client.post("/characters", json={"name": "Shared Name"}, headers=other_headers).json()

    stub_answer = f"Discusses [{mine['id']}] and, adversarially, [{theirs['id']}]."
    client.app.dependency_overrides[get_llm] = lambda: _StubLLM(stub_answer)

    result = client.post("/ai/ask", json={"question": "Shared Name"}).json()

    assert mine["id"] in result["citations"]
    assert theirs["id"] not in result["citations"]
