"""Google Gemini text provider (narrative, keywords, names, query parsing).

Activated by TEXT_PROVIDER=gemini with GEMINI_API_KEY set. Uses the google-genai
SDK; imported lazily so the app runs without it when using mocks.
"""
from __future__ import annotations


class GeminiTextProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for GeminiTextProvider")
        try:
            from google import genai  # type: ignore
        except ImportError as e:  # pragma: no cover - optional dep
            raise RuntimeError("google-genai not installed; `pip install google-genai`") from e
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        from google.genai import types  # type: ignore

        cfg_kwargs: dict = {"system_instruction": system}
        if json_mode:
            cfg_kwargs["response_mime_type"] = "application/json"
        config = types.GenerateContentConfig(**cfg_kwargs)

        resp = await self._client.aio.models.generate_content(
            model=self._model, contents=user, config=config
        )
        return resp.text or ""
