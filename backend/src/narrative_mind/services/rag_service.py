import re

from narrative_mind.core.exceptions import ProviderUnavailableError
from narrative_mind.domain.rag import AskRequest, AskResponse, RetrieveRequest
from narrative_mind.providers.llm import LLMProvider
from narrative_mind.services.retrieval_service import RetrievalService

# Entity ids are UUIDs (see domain/*.py's default_factory and
# starter_world.entity_id) and RetrievalService stamps every context line
# with one in brackets — "[id] Label: Name". This just finds bracketed
# candidates; membership in the retrieved id set is what actually validates
# a citation, not the shape of the token itself.
_CITATION_PATTERN = re.compile(r"\[([0-9a-fA-F-]{36})\]")

_SYSTEM_PROMPT = (
    "You are a narrative-world assistant. Answer only using the CONTEXT below, "
    'which lists entities as "[id] Label: Name" and relationships as '
    '"[id] --REL_TYPE--> [id]". Cite every entity your answer relies on by its '
    "bracketed id, exactly as it appears in the context. Never invent an id "
    "and never cite one that is not in the context. If the context does not "
    "cover the question, say plainly that this world does not cover it "
    "instead of guessing."
)


class RagService:
    """Composes RetrievalService's context with a generated answer, then
    distrusts the result: every citation the model returns is checked against
    the ids actually retrieved, and anything invented is dropped before the
    response goes out. Same posture `AIService._filter_extract_response`
    already takes toward model output elsewhere in this codebase — never
    trust it outright, re-check it in Python against real evidence.
    """

    def __init__(self, retrieval: RetrievalService, llm: LLMProvider) -> None:
        self._retrieval = retrieval
        self._llm = llm

    async def ask(self, request: AskRequest) -> AskResponse:
        retrieval = await self._retrieval.retrieve(
            RetrieveRequest(question=request.question, top_k=request.top_k, depth=request.depth)
        )

        prompt = f"CONTEXT:\n{retrieval.context}\n\nQUESTION:\n{request.question}"
        try:
            raw_answer = await self._llm.generate(prompt, system=_SYSTEM_PROMPT)
        except Exception as exc:
            raise ProviderUnavailableError(
                "The language model is unreachable right now — try again shortly."
            ) from exc

        retrieved_ids = {entity.id for entity in retrieval.entities}
        cited = dict.fromkeys(
            _CITATION_PATTERN.findall(raw_answer)
        )  # dedupe, keep first-seen order
        citations = [entity_id for entity_id in cited if entity_id in retrieved_ids]

        return AskResponse(
            answer=raw_answer.strip(),
            citations=citations,
            retrieval=retrieval if request.debug else None,
        )
