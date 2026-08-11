from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from narrative_mind.core.config import Settings, get_settings
from narrative_mind.providers.llm import GroqProvider, LLMProvider, OllamaProvider


@lru_cache
def _build_ollama_provider(host: str, chat: str, embed: str) -> OllamaProvider:
    return OllamaProvider(
        Settings(ollama_host=host, ollama_chat_model=chat, ollama_embed_model=embed)
    )


@lru_cache
def _build_groq_provider(api_key: str, chat: str) -> GroqProvider:
    return GroqProvider(Settings(groq_api_key=api_key, groq_chat_model=chat))


def get_llm(settings: Annotated[Settings, Depends(get_settings)]) -> LLMProvider:
    if settings.llm_provider.strip().lower() == "groq":
        return _build_groq_provider(settings.groq_api_key, settings.groq_chat_model)
    return _build_ollama_provider(
        settings.ollama_host, settings.ollama_chat_model, settings.ollama_embed_model
    )


LLMDep = Annotated[LLMProvider, Depends(get_llm)]
