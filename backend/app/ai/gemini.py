"""Gemini provider (Google AI Studio REST API)."""
from __future__ import annotations

import httpx

from .base import ChatResult, ProviderError, ssl_context
from .parse import parse_response


class GeminiProvider:
    name = "gemini"
    default_model = "gemini-2.5-pro"

    async def chat(
        self,
        *,
        api_key: str,
        model: str,
        system: str,
        user_text: str,
        document_text: str,
    ) -> ChatResult:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={api_key}"
        )
        # Gemini takes system_instruction separately from contents.
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": f"=== 현재 문서 본문 ===\n{document_text}"},
                        {"text": f"=== 사용자 지시 ===\n{user_text}"},
                    ],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.2,
            },
        }
        async with httpx.AsyncClient(timeout=120.0, verify=ssl_context()) as client:
            try:
                r = await client.post(url, json=body)
            except httpx.HTTPError as e:
                raise ProviderError(f"Gemini 네트워크 오류: {e}")
        if r.status_code != 200:
            raise ProviderError(
                f"Gemini API 오류 {r.status_code}: {r.text[:500]}"
            )
        data = r.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError):
            raise ProviderError(f"Gemini 응답 형식이 예상과 다릅니다: {str(data)[:500]}")
        return parse_response(text)
