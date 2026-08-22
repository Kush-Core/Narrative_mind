from typing import Any, Protocol

from groq import AsyncGroq
from ollama import AsyncClient

from narrative_mind.core.config import Settings


class LLMProvider(Protocol):
    """The only LLM contract the rest of the app knows about."""

    async def generate(self, prompt: str, *, system: str | None = None) -> str: ...

    async def generate_structured(
        self, prompt: str, schema: dict[str, Any], *, system: str | None = None
    ) -> str: ...


class OllamaProvider:
    """LLMProvider backed by a local Ollama server."""

    def __init__(self, settings: Settings) -> None:
        self._client = AsyncClient(host=settings.ollama_host)
        self._chat_model = settings.ollama_chat_model

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


class GroqProvider:
    """LLMProvider backed by the hosted Groq API.

    Used in deployment (Vercel functions have no local model to talk to);
    local development uses OllamaProvider instead. See backend/README.md.
    """

    def __init__(self, settings: Settings) -> None:
        self._client = AsyncGroq(api_key=settings.groq_api_key)
        self._chat_model = settings.groq_chat_model

    async def generate(self, prompt: str, *, system: str | None = None) -> str:
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ]
        resp = await self._client.chat.completions.create(model=self._chat_model, messages=messages)
        return resp.choices[0].message.content or ""

    async def generate_structured(
        self, prompt: str, schema: dict[str, Any], *, system: str | None = None
    ) -> str:
        # json_schema (best-effort mode) is only supported by the openai/gpt-oss-*
        # models — see GROQ_CHAT_MODEL in config.py. strict mode is not used here
        # since it requires every field marked "required" and additionalProperties:
        # false recursively, which Pydantic's auto-generated schema doesn't set;
        # ai_service.py re-validates the result through Pydantic regardless.
        messages = ([{"role": "system", "content": system}] if system else []) + [
            {"role": "user", "content": prompt}
        ]
        resp = await self._client.chat.completions.create(
            model=self._chat_model,
            messages=messages,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": schema.get("title", "structured_response"),
                    "schema": schema,
                },
            },
        )
        return resp.choices[0].message.content or ""
