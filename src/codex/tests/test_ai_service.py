import asyncio

from codex.services.ai_service import AIService


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
