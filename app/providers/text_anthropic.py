"""Anthropic Claude text provider.

Activated by TEXT_PROVIDER=anthropic with ANTHROPIC_API_KEY set. The anthropic
SDK is imported lazily so the app runs without it installed when using mocks.
"""
from __future__ import annotations


class AnthropicTextProvider:
    def __init__(self, api_key: str, model: str = "claude-opus-4-8") -> None:
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for AnthropicTextProvider")
        self._api_key = api_key
        self._model = model

    async def complete(self, system: str, user: str, *, json_mode: bool = False) -> str:
        try:
            from anthropic import AsyncAnthropic  # type: ignore
        except ImportError as e:  # pragma: no cover - depends on optional dep
            raise RuntimeError("anthropic not installed; `pip install anthropic`") from e

        client = AsyncAnthropic(api_key=self._api_key)
        sys_prompt = system
        if json_mode:
            sys_prompt = f"{system}\n\nRespond with ONLY valid JSON. No markdown, no prose."

        msg = await client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=sys_prompt,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(block.text for block in msg.content if getattr(block, "type", None) == "text")
        return _strip_code_fence(text) if json_mode else text


def _strip_code_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.endswith("```"):
            t = t[: -3]
        # drop a leading "json" language tag if present
        if t.lstrip().lower().startswith("json"):
            t = t.lstrip()[4:]
    return t.strip()
