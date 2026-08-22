from typing import Protocol

from google import genai
from google.genai import types
from ollama import AsyncClient

from narrative_mind.core.config import Settings


class EmbeddingProvider(Protocol):
    """The only embedding contract the rest of the app knows about."""

    @property
    def model_name(self) -> str: ...

    @property
    def dimensions(self) -> int: ...

    async def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    async def embed_query(self, text: str) -> list[float]: ...


class OllamaEmbeddingProvider:
    """EmbeddingProvider backed by a local Ollama server."""

    def __init__(self, settings: Settings) -> None:
        self._client = AsyncClient(host=settings.ollama_host)
        self._model = settings.ollama_embed_model
        self._dimensions = settings.ollama_embed_dimensions

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        prefixed = [f"search_document: {t}" for t in texts]
        resp = await self._client.embed(model=self._model, input=prefixed)
        return [list(embedding) for embedding in resp.embeddings]

    async def embed_query(self, text: str) -> list[float]:
        resp = await self._client.embed(model=self._model, input=[f"search_query: {text}"])
        return list(resp.embeddings[0])


class GoogleEmbeddingProvider:
    """EmbeddingProvider backed by the hosted Google API."""

    def __init__(self, settings: Settings) -> None:
        self._client = genai.Client(api_key=settings.google_api_key)
        self._model = settings.google_embed_model
        self._dimensions = settings.google_embed_dimensions

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        resp = await self._client.aio.models.embed_content(
            model=self._model,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT", output_dimensionality=self._dimensions
            ),
        )
        if resp.embeddings is None or len(resp.embeddings) != len(texts):
            raise RuntimeError("Google embeddings API returned an unexpected number of embeddings")
        values = [embedding.values for embedding in resp.embeddings]
        if any(v is None for v in values):
            raise RuntimeError("Google embeddings API returned an incomplete embedding")
        return values  # type: ignore[return-value]

    async def embed_query(self, text: str) -> list[float]:
        resp = await self._client.aio.models.embed_content(
            model=self._model,
            contents=[text],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY", output_dimensionality=self._dimensions
            ),
        )
        if not resp.embeddings or resp.embeddings[0].values is None:
            raise RuntimeError("Google embeddings API returned no embedding")
        return resp.embeddings[0].values
