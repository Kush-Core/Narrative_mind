from pydantic import BaseModel, Field


class RetrieveRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    top_k: int | None = Field(default=None, ge=1, le=20, description="Overrides rag_seed_top_k.")
    depth: int | None = Field(default=None, ge=1, le=2, description="Overrides rag_expand_depth.")


class RetrievedEntity(BaseModel):
    id: str
    label: str
    name: str
    score: float | None = Field(
        default=None,
        description="Cosine similarity to the question, for a seed. None for "
        "an entity that only entered the result through graph expansion.",
    )


class RetrievedRelationship(BaseModel):
    source: str
    target: str
    rel_type: str
    sentiment: str | None = None


class RetrievalResult(BaseModel):
    seeds: list[RetrievedEntity] = Field(
        description="The top-K vector-similarity matches for the question, before expansion."
    )
    entities: list[RetrievedEntity] = Field(
        description="Every entity in the context block — seeds plus everything "
        "graph expansion added, capped at rag_max_context_entities."
    )
    relationships: list[RetrievedRelationship] = Field(
        description="Edges from the induced subgraph whose endpoints are both in `entities`."
    )
    context: str = Field(description="The serialized, model-ready context block.")
    char_count: int


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    top_k: int | None = Field(default=None, ge=1, le=20, description="Overrides rag_seed_top_k.")
    depth: int | None = Field(default=None, ge=1, le=2, description="Overrides rag_expand_depth.")
    debug: bool = Field(default=False, description="Include the retrieval trace behind the answer.")


class AskResponse(BaseModel):
    answer: str
    citations: list[str] = Field(
        description="Entity ids the answer cites, validated against the ids "
        "actually retrieved — anything the model invented is dropped, never "
        "surfaced here."
    )
    retrieval: RetrievalResult | None = Field(
        default=None,
        description="The retrieval behind this answer. Present only when `debug=true`.",
    )
