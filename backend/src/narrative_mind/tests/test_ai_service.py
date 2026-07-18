import asyncio

from fastapi.testclient import TestClient

from narrative_mind.main import create_app
from narrative_mind.providers.deps import get_llm
from narrative_mind.services.ai_service import AIService


class _FakeLLM:
    def __init__(self, payload: str) -> None:
        self.payload = payload

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        raise AssertionError("generate should not be called in this test")

    async def generate_structured(
        self, prompt: str, schema: dict[str, object], *, system: str | None = None
    ) -> str:
        return self.payload

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise AssertionError("embed should not be called in this test")


class _StubLLM:
    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        return "stub description"

    async def generate_structured(
        self, prompt: str, schema: dict[str, object], *, system: str | None = None
    ) -> str:
        return '{"entities":[],"relationships":[]}'

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 768 for _ in texts]


def test_extract_filters_invalid_relationships() -> None:
    payload = (
        '{"entities":['
        '{"name":"Aria Vane","type":"character"},'
        '{"name":"Borin","type":"character"},'
        '{"name":"Iron Pact","type":"faction"},'
        '{"name":"Dunhollow","type":"location"}],'
        '"relationships":['
        '{"source":"Aria Vane","rel_type":"MEET_AT","target":"Borin"},'
        '{"source":"Dunhollow","rel_type":"LOCATED_IN","target":"Aria Vane"},'
        '{"source":"Aria Vane","rel_type":"LEADS","target":"Iron Pact"},'
        '{"source":"Aria Vane","rel_type":"WORKS_AT","target":"Iron Pact"},'
        '{"source":"Aria Vane","rel_type":"MEET_AT","target":"Dunhollow"}]}'
    )

    service = AIService(_FakeLLM(payload))
    result = asyncio.run(
        service.extract(
            "Aria Vane, a captain of the Iron Pact, met Borin in the city of Dunhollow."
        )
    )

    assert [(entity.name, entity.type) for entity in result.entities] == [
        ("Aria Vane", "Character"),
        ("Borin", "Character"),
        ("Iron Pact", "Faction"),
        ("Dunhollow", "Location"),
    ]
    assert [
        (relationship.source, relationship.rel_type, relationship.target)
        for relationship in result.relationships
    ] == [
        ("Aria Vane", "MET_IN", "Borin"),
        ("Aria Vane", "MEMBER_OF", "Iron Pact"),
    ]


def test_describe_endpoint_uses_stub_provider() -> None:
    # Overriding get_llm proves the /ai endpoint runs without a real Ollama server.
    # The TestClient is used without a context manager so app lifespan (and the
    # Neo4j connection it opens) is skipped; /ai/describe touches only the provider.
    app = create_app()
    app.dependency_overrides[get_llm] = lambda: _StubLLM()
    client = TestClient(app)
    try:
        res = client.post("/ai/describe", json={"name": "Aria Vane"})
        assert res.status_code == 200
        assert res.json()["description"] == "stub description"
    finally:
        app.dependency_overrides.clear()
