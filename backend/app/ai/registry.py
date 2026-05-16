"""Provider registry — keep it simple."""
from __future__ import annotations

from .base import AIProvider
from .claude import ClaudeProvider
from .gemini import GeminiProvider
from .openai import OpenAIProvider

_PROVIDERS: dict[str, AIProvider] = {
    GeminiProvider.name: GeminiProvider(),
    ClaudeProvider.name: ClaudeProvider(),
    OpenAIProvider.name: OpenAIProvider(),
}


def get_provider(name: str) -> AIProvider:
    if name not in _PROVIDERS:
        raise KeyError(f"Unknown provider: {name}")
    return _PROVIDERS[name]


def available_providers() -> list[dict]:
    return [
        {"name": p.name, "default_model": p.default_model}
        for p in _PROVIDERS.values()
    ]
