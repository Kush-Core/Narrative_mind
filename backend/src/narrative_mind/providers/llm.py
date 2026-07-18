from typing import Any, Protocol

from ollama import AsyncClient

from narrative_mind.core.config import Settings


class LLMProvider(Protocol):
    """The only LLM contract the rest of the app knows about."""

    async def generate(self, prompt: str, *, system: str | None = None) -> str: ...

    async def generate_structured(
        self, prompt: str, schema: dict[str, Any], *, system: str | None = None
    ) -> str: ...

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class OllamaProvider:
    """LLMProvider backed by a local Ollama server."""

    def __init__(self, settings: Settings) -> None:
        self._client = AsyncClient(host=settings.ollama_host)
        self._chat_model = settings.ollama_chat_model
        self._embed_model = settings.ollama_embed_model

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ]
        resp = await self._client.chat(model=self._chat_model, messages=messages)
        return resp.message.content or ""

    async def generate_structured(
        self, prompt: str, schema: dict[str, Any], *, system: str | None = None
    ) -> str:
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ]
        resp = await self._client.chat(model=self._chat_model, messages=messages, format=schema)
        return resp.message.content or ""

    async def embed(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.embed(model=self._embed_model, input=texts)
        return [list(embedding) for embedding in resp.embeddings]
