from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    app_name: str = "Narrative Mind"
    environment: str = "development"
    debug: bool = True

    # Neo4j Configuration
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_username: str = "neo4j"
    neo4j_password: str = ""

    # LLM provider selection: "ollama" (local dev, default) or "groq" (deployment).
    # Chat only — independent of embedding_provider below. See backend/README.md.
    llm_provider: str = "ollama"

    # Embedding provider selection: "ollama" (local dev, default) or "google"
    # (deployment). Independent of llm_provider — Groq has no embeddings endpoint,
    # so embeddings are a separate provider axis entirely. See backend/README.md.
    embedding_provider: str = "ollama"

    # Ollama (used from Phase 10) — local development only
    ollama_host: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.2:3b"
    ollama_embed_model: str = "nomic-embed-text-v2-moe:latest"
    ollama_embed_dimensions: int = 768

    # Groq — hosted chat provider used in deployment
    groq_api_key: str = ""
    groq_chat_model: str = "openai/gpt-oss-120b"

    # Google — hosted embedding provider used in deployment (embedding only, not chat)
    google_api_key: str = ""
    google_embed_model: str = ""
    google_embed_dimensions: int = 768

    cors_origins: list[str] = []

    # Authentication / JWT
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # Give each new account its own copy of the starter world at registration, so
    # a first login opens onto a populated graph instead of an empty one. Turn it
    # off to have accounts start empty — the test suite does, since a world that
    # arrives unasked would be indistinguishable from data a test created.
    seed_new_user_world: bool = True

    # Graph RAG retrieval (Phase 4): how many entities the vector search seeds
    # with, how many hops the graph expansion walks out from those seeds, and
    # how many entities the serialized context block is capped at. Deliberately
    # no minimum-similarity-score setting — cosine score distributions differ
    # per embedding model, so a threshold tuned against one model is meaningless
    # against another's; rank by top-K instead (see §2.2 of the RAG plan).
    rag_seed_top_k: int = 8
    rag_expand_depth: int = 1
    rag_max_context_entities: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
