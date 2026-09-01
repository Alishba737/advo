"""Embedding generation — supports DashScope API (cloud) and local sentence-transformers."""

from __future__ import annotations

import os
import time
from typing import Protocol

import httpx

from packages.shared.config import cfg


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...


class DashScopeEmbedder:
    """Uses Alibaba DashScope text-embedding-v3 via OpenAI-compatible API."""

    def __init__(self) -> None:
        self.api_key = cfg.dashscope.api_key
        self.base_url = cfg.dashscope.base_url.rstrip("/")
        self.model = cfg.dashscope.embedding_model
        self._client = httpx.Client(
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )

    def _request(self, texts: list[str]) -> list[list[float]]:
        url = f"{self.base_url}/embeddings"
        payload = {
            "model": self.model,
            "input": texts,
            "encoding_format": "float",
        }
        resp = self._client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        # Sort by index to maintain order
        sorted_data = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in sorted_data]

    def embed(self, texts: list[str], batch_size: int = 20) -> list[list[float]]:
        """Embed multiple texts in batches (DashScope has batch limits)."""
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            embeddings = self._request(batch)
            all_embeddings.extend(embeddings)
            if i + batch_size < len(texts):
                time.sleep(0.1)  # Rate limiting
        return all_embeddings

    def embed_query(self, text: str) -> list[float]:
        return self._request([text])[0]


class LocalEmbedder:
    """Runs bge-m3 locally via sentence-transformers — GPU if available, else CPU."""

    def __init__(self, model_name: str | None = None, device: str | None = None) -> None:
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name or cfg.embedding_model
        self.device = device or cfg.device
        self.model = SentenceTransformer(self.model_name, device=self.device)

    def embed(self, texts: list[str], batch_size: int | None = None) -> list[list[float]]:
        # GPU handles larger batches comfortably; use smaller ones on CPU
        batch_size = batch_size or (32 if self.device == "cuda" else 16)
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=True,
            normalize_embeddings=True,
        )
        return embeddings.tolist()

    def embed_query(self, text: str) -> list[float]:
        embedding = self.model.encode([text], normalize_embeddings=True)
        return embedding[0].tolist()


def create_embedder() -> Embedder:
    """Factory: pick embedder based on EMBEDDING_PROVIDER.

    - auto (default): local sentence-transformers when installed (GPU if
      available, else CPU), falling back to DashScope API
    - local: force local embeddings (error if sentence-transformers missing)
    - dashscope: force DashScope API
    """
    provider = cfg.embedding_provider
    if provider not in ("auto", "local", "dashscope"):
        print(f"  Unknown EMBEDDING_PROVIDER '{provider}' — using auto")
        provider = "auto"

    if provider == "dashscope":
        return _dashscope_embedder()

    try:
        embedder = LocalEmbedder()
        print(f"  Local embeddings on {embedder.device.upper()} ({embedder.model_name})")
        return embedder
    except ImportError:
        if provider == "local":
            raise RuntimeError(
                "EMBEDDING_PROVIDER=local but sentence-transformers is not installed. "
                "Run: pip install sentence-transformers"
            )
        print("  sentence-transformers not installed — falling back to DashScope API")
    except Exception as e:
        if provider == "local":
            raise
        print(f"  Local embedder failed ({e}) — falling back to DashScope API")

    return _dashscope_embedder()


def _dashscope_embedder() -> DashScopeEmbedder:
    if not cfg.dashscope.api_key:
        raise RuntimeError(
            "No usable local embeddings and DASHSCOPE_API_KEY not set. "
            "Set it in .env or install sentence-transformers."
        )
    print("  Using DashScope API for embeddings")
    return DashScopeEmbedder()
