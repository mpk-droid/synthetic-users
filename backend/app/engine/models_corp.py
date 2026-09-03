"""Models.corp client — wraps the internal 3scale gateway for Claude access."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from types import SimpleNamespace

import httpx

logger = logging.getLogger(__name__)

MODEL_PATH_MAP = {
    "sonnet": "sonnet",
    "haiku": "haiku",
    "opus": "opus",
}


def _model_path(model_id: str) -> str:
    for key in MODEL_PATH_MAP:
        if key in model_id:
            return MODEL_PATH_MAP[key]
    return "sonnet"


@dataclass
class ModelsCorpMessages:
    base_url: str
    api_key: str
    verify_ssl: bool = True
    _client: httpx.AsyncClient = field(init=False, repr=False)

    def __post_init__(self):
        self._client = httpx.AsyncClient(
            verify=self.verify_ssl,
            timeout=300.0,
        )

    async def create(
        self,
        model: str,
        max_tokens: int,
        system: str,
        messages: list[dict],
        tools: list[dict] | None = None,
        **kwargs,
    ) -> SimpleNamespace:
        path = _model_path(model)
        url = f"{self.base_url}/{path}/models/{model}:streamRawPredict"

        body: dict = {
            "anthropic_version": "vertex-2023-10-16",
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        }
        if tools:
            body["tools"] = tools

        response = await self._client.post(
            url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            json=body,
        )
        response.raise_for_status()
        data = response.json()

        content = []
        for block in data.get("content", []):
            content.append(SimpleNamespace(**block))

        return SimpleNamespace(
            id=data.get("id"),
            model=data.get("model"),
            content=content,
            stop_reason=data.get("stop_reason"),
            usage=data.get("usage", {}),
        )

    async def close(self):
        await self._client.aclose()


@dataclass
class ModelsCorpClient:
    """Drop-in replacement for anthropic.AsyncAnthropic with Models.corp."""

    base_url: str
    api_key: str
    verify_ssl: bool = True
    messages: ModelsCorpMessages = field(init=False)

    def __post_init__(self):
        self.messages = ModelsCorpMessages(
            base_url=self.base_url,
            api_key=self.api_key,
            verify_ssl=self.verify_ssl,
        )
