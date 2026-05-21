"""OpenAI provider (Chat Completions)."""
from __future__ import annotations

import httpx

from .base import ChatResult, ProviderError, ssl_context
from .parse import parse_response


class OpenAIProvider:
    name = "openai"
    default_model = "gpt-4o"

    async def chat(
        self,
        *,
        api_key: str,
        model: str,
        system: str,
        user_text: str,
        document_text: str,
    ) -> ChatResult:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": model,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": (
                        f"=== 현재 문서 본문 ===\n{document_text}\n\n"
                        f"=== 사용자 지시 ===\n{user_text}"
                    ),
                },
            ],
        }
        async with httpx.AsyncClient(timeout=120.0, verify=ssl_context()) as client:
            try:
                r = await client.post(url, headers=headers, json=body)
            except httpx.HTTPError as e:
                raise ProviderError(f"OpenAI 네트워크 오류: {e}")
        if r.status_code != 200:
            raise ProviderError(
                f"OpenAI API 오류 {r.status_code}: {r.text[:500]}"
            )
        data = r.json()
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise ProviderError(f"OpenAI 응답 형식이 예상과 다릅니다: {str(data)[:500]}")
        return parse_response(text)
