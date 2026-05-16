"""Parse the assistant's JSON output into a ChatResult."""
from __future__ import annotations

import json
import re

from .base import ChatResult, ProviderError, Replacement


_JSON_BLOCK = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def parse_response(raw: str) -> ChatResult:
    """Best-effort parse: accept raw JSON or JSON inside a code fence."""
    text = raw.strip()
    candidate = _extract_json(text)
    if candidate is None:
        raise ProviderError(f"모델이 JSON을 반환하지 않았습니다.\n원본: {raw[:500]}")
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as e:
        raise ProviderError(f"JSON 파싱 실패: {e}\n원본: {candidate[:500]}")

    summary = str(data.get("summary", "")).strip()
    items = data.get("replacements", [])
    if not isinstance(items, list):
        raise ProviderError("'replacements'는 리스트여야 합니다.")

    reps: list[Replacement] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        old = it.get("old")
        new = it.get("new")
        if not isinstance(old, str) or not isinstance(new, str):
            continue
        if not old:
            continue  # empty 'old' would be meaningless
        reps.append(Replacement(old=old, new=new))

    return ChatResult(summary=summary, replacements=reps, raw_response=raw)


def _extract_json(text: str) -> str | None:
    m = _JSON_BLOCK.search(text)
    if m:
        return m.group(1)
    # Fall back to first '{...}' block via brace matching
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None
