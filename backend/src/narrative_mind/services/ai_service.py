import json
from collections.abc import Iterable

from narrative_mind.domain.ai import (
    DescribeRequest,
    DescribeResponse,
    ExtractedEntity,
    ExtractedRelationship,
    ExtractResponse,
)
from narrative_mind.providers.llm import LLMProvider


class AIService:
    _ENTITY_TYPE_MAP = {
        "character": "Character",
        "location": "Location",
        "faction": "Faction",
        "event": "Event",
    }

    _RELATION_TYPE_MAP = {
        "member_of": "MEMBER_OF",
        "affiliation": "MEMBER_OF",
        "belongs_to": "MEMBER_OF",
        "part_of": "MEMBER_OF",
        "knows": "KNOWS",
        "allied_with": "ALLIED_WITH",
        "allied": "ALLIED_WITH",
        "leads": "LEADS",
        "works_at": "WORKS_AT",
        "employed_by": "WORKS_AT",
        "located_in": "LOCATED_IN",
        "met_in": "MET_IN",
        "meet_in": "MET_IN",
        "meet_at": "MET_IN",
        "met_at": "MET_IN",
        "met": "MET_IN",
        "related_to": "RELATED_TO",
    }

    _RELATION_SIGNATURES = {
        "MEMBER_OF": {("Character", "Faction")},
        "KNOWS": {("Character", "Character")},
        "ALLIED_WITH": {("Faction", "Faction")},
        "LEADS": {("Character", "Faction")},
        "WORKS_AT": {("Character", "Faction")},
        "LOCATED_IN": {("Location", "Location")},
        "MET_IN": {("Character", "Character")},
    }

    _RELATION_EVIDENCE = {
        "MEMBER_OF": ("member of", "part of", "captain of"),
        "KNOWS": (" knows ", "know each other", "knows each other"),
        "ALLIED_WITH": ("allied", "ally", "alliance"),
        "LEADS": (" leads ", "leader of", "commands"),
        "WORKS_AT": ("works at", "works for", "employed by"),
        "LOCATED_IN": ("located in", "in the city of", "in the town of", "in the village of"),
        "MET_IN": (" met ", "met with", "meet ", "meet with"),
    }

    def __init__(self, llm: LLMProvider) -> None:
        self._llm = llm

    def _extract_prompt(self, passage: str) -> str:
        return (
            "Extract worldbuilding entities and relationships from the passage below. "
            "Follow these rules exactly: "
            "(1) return only valid JSON matching the provided schema, "
            "(2) preserve the original casing of entity names, "
            "(3) use entity.type values only from Character, Location, Faction, or Event, "
            "(4) use canonical relation labels such as MEMBER_OF, LOCATED_IN, KNOWS, "
            "ALLIED_WITH, LEADS, WORKS_AT, or RELATED_TO, and similar ones, "
            "(5) do not invent new labels when one of those fits. "
            "If the passage is ambiguous, choose the most conservative relation label.\n\n"
            "PASSAGE:\n" + passage
        )

    def _normalize_entity_type(self, entity_type: str) -> str | None:
        return self._ENTITY_TYPE_MAP.get(entity_type.strip().lower())

    def _normalize_relation_type(self, rel_type: str) -> str | None:
        return self._RELATION_TYPE_MAP.get(rel_type.strip().lower())

    def _relation_supported(self, passage: str, rel_type: str) -> bool:
        passage_text = f" {passage.casefold()} "
        return any(keyword in passage_text for keyword in self._RELATION_EVIDENCE.get(rel_type, ()))

    def _entity_lookup(self, entities: Iterable[ExtractedEntity]) -> dict[str, ExtractedEntity]:
        return {entity.name.strip().casefold(): entity for entity in entities}

    def _filter_extract_response(self, passage: str, response: ExtractResponse) -> ExtractResponse:
        normalized_entities: list[ExtractedEntity] = []
        for entity in response.entities:
            normalized_type = self._normalize_entity_type(entity.type)
            if normalized_type is None:
                continue
            normalized_entities.append(
                ExtractedEntity(name=entity.name.strip(), type=normalized_type)
            )

        entity_lookup = self._entity_lookup(normalized_entities)
        filtered_relationships: list[ExtractedRelationship] = []
        seen_relationships: set[tuple[str, str, str]] = set()

        for relationship in response.relationships:
            normalized_rel_type = self._normalize_relation_type(relationship.rel_type)
            if normalized_rel_type is None:
                continue

            if normalized_rel_type in {"LEADS", "WORKS_AT", "MEMBER_OF"}:
                if self._relation_supported(passage, "MEMBER_OF") and (
                    "captain of" in passage.casefold()
                    or "member of" in passage.casefold()
                    or "part of" in passage.casefold()
                ):
                    normalized_rel_type = "MEMBER_OF"
                elif not self._relation_supported(passage, normalized_rel_type):
                    continue
            elif not self._relation_supported(passage, normalized_rel_type):
                continue

            source = entity_lookup.get(relationship.source.strip().casefold())
            target = entity_lookup.get(relationship.target.strip().casefold())
            if source is None or target is None:
                continue

            allowed_signatures = self._RELATION_SIGNATURES.get(normalized_rel_type)
            if (
                allowed_signatures is not None
                and (
                    source.type,
                    target.type,
                )
                not in allowed_signatures
            ):
                continue

            dedupe_key = (source.name, normalized_rel_type, target.name)
            if dedupe_key in seen_relationships:
                continue
            seen_relationships.add(dedupe_key)
            filtered_relationships.append(
                ExtractedRelationship(
                    source=source.name,
                    rel_type=normalized_rel_type,
                    target=target.name,
                )
            )

        return ExtractResponse(entities=normalized_entities, relationships=filtered_relationships)

    async def describe(self, req: DescribeRequest) -> DescribeResponse:
        prompt = (
            f"Write a vivid two-sentence description of a character named {req.name}. "
            f"Traits: {', '.join(req.traits) or 'unspecified'}. Tone: {req.tone}."
        )
        text = await self._llm.generate(prompt, system="You are a concise worldbuilding assistant.")
        return DescribeResponse(description=text.strip())

    async def extract(self, passage: str) -> ExtractResponse:
        schema = ExtractResponse.model_json_schema()
        raw = await self._llm.generate_structured(
            prompt=self._extract_prompt(passage),
            schema=schema,
            system="You output only JSON conforming to the provided schema.",
        )
        try:
            parsed = ExtractResponse.model_validate_json(raw)
        except ValueError:
            parsed = ExtractResponse.model_validate(json.loads(raw))
        return self._filter_extract_response(passage, parsed)
