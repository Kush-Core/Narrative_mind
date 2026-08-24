"""POST /ai/ask against a stub LLM.

`get_llm` is overridden per test rather than in a fixture — each test needs
a different canned answer, and `unauthenticated_client`/`client` build a
fresh `create_app()` per test anyway, so nothing here can leak between tests.
"""

from fastapi.testclient import TestClient

from narrative_mind.providers.deps import get_llm


class _StubLLM:
    def __init__(self, answer: str) -> None:
        self._answer = answer

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        return self._answer

    async def generate_structured(
        self, prompt: str, schema: dict[str, object], *, system: str | None = None
    ) -> str:
        raise AssertionError("RagService should only ever call generate()")


class _BrokenLLM:
    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        raise ConnectionError("simulated: provider unreachable")

    async def generate_structured(
        self, prompt: str, schema: dict[str, object], *, system: str | None = None
    ) -> str:
        raise ConnectionError("simulated: provider unreachable")


def test_invented_citation_is_stripped(client: TestClient, rag_world: dict) -> None:
    character = rag_world["character"]
    real_id = character["id"]
    invented_id = "00000000-0000-0000-0000-000000000000"

    stub_answer = (
        f"{character['name']} is discussed here [{real_id}], and so is something "
        f"made up [{invented_id}]."
    )
    client.app.dependency_overrides[get_llm] = lambda: _StubLLM(stub_answer)

    res = client.post("/ai/ask", json={"question": character["name"]})
    assert res.status_code == 200
    result = res.json()

    assert real_id in result["citations"]
    assert invented_id not in result["citations"]


def test_debug_flag_controls_retrieval_trace(client: TestClient) -> None:
    # Plain `client`, deliberately no `rag_world` — an empty account, so
    # `seeds == []` is a real assertion about the field's presence rather
    # than a coincidence of what happens to score lowest.
    client.app.dependency_overrides[get_llm] = lambda: _StubLLM("An answer with no citations.")

    without_debug = client.post("/ai/ask", json={"question": "anything"}).json()
    with_debug = client.post("/ai/ask", json={"question": "anything", "debug": True}).json()

    assert without_debug["retrieval"] is None
    assert with_debug["retrieval"] is not None
    assert with_debug["retrieval"]["seeds"] == []  # empty world, nothing to seed with


def test_unreachable_provider_returns_503_not_500(client: TestClient) -> None:
    client.app.dependency_overrides[get_llm] = lambda: _BrokenLLM()

    res = client.post("/ai/ask", json={"question": "anything"})

    assert res.status_code == 503
    assert res.json()["error"]["code"] == "provider_unavailable"
