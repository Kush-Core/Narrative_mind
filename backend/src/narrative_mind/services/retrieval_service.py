from narrative_mind.domain.rag import (
    RetrievalResult,
    RetrievedEntity,
    RetrievedRelationship,
    RetrieveRequest,
)
from narrative_mind.providers.embeddings import EmbeddingProvider
from narrative_mind.repositories.embedding_repo import EmbeddingRepository
from narrative_mind.repositories.graph_repo import GraphRepository

# A belt-and-suspenders character cap on top of rag_max_context_entities.
# Entity/relationship lines here are compact ids and names, not full
# descriptions, so this rarely binds in practice — but the plan is explicit
# that an unbounded subgraph at depth 2 on a dense node can be most of a
# world, and the entity-count cap alone doesn't bound that if names ever grow.
_MAX_CONTEXT_CHARS = 4000


class RetrievalService:
    """The seed → expand → serialize pipeline, with no LLM call in it.

    Deliberately its own service, testable and tunable without generation in
    the loop — nondeterministic model output on top of untuned retrieval is
    very hard to debug (Phase 4 of the RAG plan).
    """

    def __init__(
        self,
        embedding_repo: EmbeddingRepository,
        graph_repo: GraphRepository,
        embedder: EmbeddingProvider,
        *,
        seed_top_k: int,
        expand_depth: int,
        max_context_entities: int,
    ) -> None:
        self._embedding_repo = embedding_repo
        self._graph_repo = graph_repo
        self._embedder = embedder
        self._seed_top_k = seed_top_k
        self._expand_depth = expand_depth
        self._max_context_entities = max_context_entities

    async def retrieve(self, request: RetrieveRequest) -> RetrievalResult:
        top_k = request.top_k or self._seed_top_k
        depth = request.depth or self._expand_depth

        query_vector = await self._embedder.embed_query(request.question)
        seed_rows = await self._embedding_repo.find_similar(query_vector, top_k)
        seeds = [
            RetrievedEntity(id=row["id"], label=row["label"], name=row["name"], score=row["score"])
            for row in seed_rows
        ]

        expansion = await self._graph_repo.expand([seed.id for seed in seeds], depth)

        candidate_entities = self._order_candidates(seeds, expansion["nodes"])
        candidate_relationships = [
            RetrievedRelationship(
                source=row["source"],
                target=row["target"],
                rel_type=row["rel_type"],
                sentiment=row["sentiment"],
            )
            for row in expansion["relationships"]
        ]

        context, entities, relationships = self._serialize(
            candidate_entities[: self._max_context_entities], candidate_relationships
        )

        return RetrievalResult(
            seeds=seeds,
            entities=entities,
            relationships=relationships,
            context=context,
            char_count=len(context),
        )

    @staticmethod
    def _order_candidates(
        seeds: list[RetrievedEntity], expanded_nodes: list[dict]
    ) -> list[RetrievedEntity]:
        """Seeds first, then expansion, in the order the entity cap should
        drop them: seeds are what the question actually matched, expansion
        nodes are supplementary context and are the first to go when a dense
        neighbourhood would otherwise blow the budget.
        """
        seed_ids = {seed.id for seed in seeds}
        return list(seeds) + [
            RetrievedEntity(id=node["id"], label=node["labels"][0], name=node["name"], score=None)
            for node in expanded_nodes
            if node["id"] not in seed_ids
        ]

    @staticmethod
    def _serialize(
        entities: list[RetrievedEntity], relationships: list[RetrievedRelationship]
    ) -> tuple[str, list[RetrievedEntity], list[RetrievedRelationship]]:
        """Builds the context block under a hard character budget, and
        returns exactly the entities/relationships that made it in — so
        `RetrievalResult.entities`/`.relationships` can never claim more than
        `context` actually contains.

        A stable id on every line is what lets the model cite an entity
        later, and what lets a citation be checked against this same id set
        (Phase 5) — nothing here is decorative.
        """
        lines: list[str] = []
        kept_entities: list[RetrievedEntity] = []
        for entity in entities:
            line = f"[{entity.id}] {entity.label}: {entity.name}"
            if lines and len("\n".join(lines)) + 1 + len(line) > _MAX_CONTEXT_CHARS:
                break
            lines.append(line)
            kept_entities.append(entity)

        kept_ids = {entity.id for entity in kept_entities}
        rel_lines: list[str] = []
        kept_relationships: list[RetrievedRelationship] = []
        for rel in relationships:
            if rel.source not in kept_ids or rel.target not in kept_ids:
                continue
            suffix = f" ({rel.sentiment})" if rel.sentiment else ""
            line = f"[{rel.source}] --{rel.rel_type}--> [{rel.target}]{suffix}"
            block_so_far = "\n".join(lines) + "\n\n" + "\n".join(rel_lines)
            if rel_lines and len(block_so_far) + 1 + len(line) > _MAX_CONTEXT_CHARS:
                break
            rel_lines.append(line)
            kept_relationships.append(rel)

        context = "\n".join(lines) + "\n\n" + "\n".join(rel_lines)
        return context, kept_entities, kept_relationships
