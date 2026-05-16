"""Common AI provider interface.

A provider takes (api_key, model, system, user_messages) and returns a
ChatResult containing both a summary line and a list of {old, new}
replacements. The system prompt is owned by us — providers should not
modify it.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class Replacement:
    old: str
    new: str


@dataclass
class ChatResult:
    summary: str
    replacements: list[Replacement]
    raw_response: str  # original assistant text (for debugging)


class ProviderError(RuntimeError):
    """Raised when the upstream provider call fails or returns garbage."""


class AIProvider(Protocol):
    name: str
    default_model: str

    async def chat(
        self,
        *,
        api_key: str,
        model: str,
        system: str,
        user_text: str,
        document_text: str,
    ) -> ChatResult:
        ...
