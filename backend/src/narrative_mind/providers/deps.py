from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from narrative_mind.core.config import Settings, get_settings
from narrative_mind.providers.llm import LLMProvider, OllamaProvider


@lru_cache
def _build_provider(host: str, chat: str, embed: str) -> OllamaProvider:
    return OllamaProvider(
        Settings(ollama_host=host, ollama_chat_model=chat, ollama_embed_model=embed)
    )


def get_llm(settings: Annotated[Settings, Depends(get_settings)]) -> LLMProvider:
    return _build_provider(
        settings.ollama_host, settings.ollama_chat_model, settings.ollama_embed_model
    )


LLMDep = Annotated[LLMProvider, Depends(get_llm)]
