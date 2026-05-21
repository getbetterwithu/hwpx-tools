"""Anthropic Claude provider (Messages API)."""
from __future__ import annotations

import httpx

from .base import ChatResult, ProviderError, ssl_context
from .parse import parse_response


class ClaudeProvider:
    name = "claude"
    default_model = "claude-sonnet-4-6"

    async def chat(
        self,
        *,
        api_key: str,
        model: str,
        system: str,
        user_text: str,
        document_text: str,
    ) -> ChatResult:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        body = {
            "model": model,
            "max_tokens": 8192,
            "temperature": 0.2,
            "system": system,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        f"=== 현재 문서 본문 ===\n{document_text}\n\n"
                        f"=== 사용자 지시 ===\n{user_text}"
                    ),
                }
            ],
        }
        async with httpx.AsyncClient(timeout=120.0, verify=ssl_context()) as client:
            try:
                r = await client.post(url, headers=headers, json=body)
            except httpx.HTTPError as e:
                raise ProviderError(f"Claude 네트워크 오류: {e}")
        if r.status_code != 200:
            raise ProviderError(
                f"Claude API 오류 {r.status_code}: {r.text[:500]}"
            )
        data = r.json()
        try:
            text = data["content"][0]["text"]
        except (KeyError, IndexError, TypeError):
            raise ProviderError(f"Claude 응답 형식이 예상과 다릅니다: {str(data)[:500]}")
        return parse_response(text)
