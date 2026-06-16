"""OpenAI text provider (alternate to Claude).

Activated by TEXT_PROVIDER=openai with OPENAI_API_KEY set.
"""
from __future__ import annotations


class OpenAITextProvider:
    def __init__(self, api_key: str, model: str = "gpt-4o") -> None:
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAITextProvider")
        self._api_key = api_key
        self._model = model

    async def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        try:
            from openai import AsyncOpenAI  # type: ignore
        except ImportError as e:  # pragma: no cover - depends on optional dep
            raise RuntimeError("openai not installed; `pip install openai`") from e

        client = AsyncOpenAI(api_key=self._api_key)
        kwargs: dict = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        resp = await client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""
