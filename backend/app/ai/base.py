"""Common AI provider interface.

A provider takes (api_key, model, system, user_messages) and returns a
ChatResult containing both a summary line and a list of {old, new}
replacements. The system prompt is owned by us — providers should not
modify it.
"""
from __future__ import annotations

import os
import ssl
from dataclasses import dataclass
from typing import Protocol, Union

import truststore

_SSL_CTX = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)


def ssl_context() -> Union[ssl.SSLContext, bool]:
    """Return an SSL verification config for httpx.

    Default: OS truststore-backed context (Windows certmgr / macOS Keychain
    / Linux openssl) — works through corporate MITM proxies that install
    their root CA into the system store.

    Override: set HWPX_INSECURE_SSL=1 to disable verification entirely.
    Use this only on networks where the MITM CA is NOT installed system-wide
    and you cannot install it (e.g. ad-hoc school Wi-Fi). MITM-vulnerable.
    """
    if os.environ.get("HWPX_INSECURE_SSL", "").strip() in {"1", "true", "TRUE", "yes"}:
        return False
    return _SSL_CTX


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
