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
    # See backend/README.md for how/when to switch this.
    llm_provider: str = "ollama"

    # Ollama (used from Phase 10) — local development only
    ollama_host: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.2:3b"
    ollama_embed_model: str = "nomic-embed-text-v2-moe:latest"

    # Groq — hosted provider used in deployment
    groq_api_key: str = ""
    groq_chat_model: str = "llama-3.3-70b-versatile"

    cors_origins: list[str] = []

    # Authentication / JWT
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
