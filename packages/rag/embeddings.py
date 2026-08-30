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
    """Uses sentence-transformers locally (bge-m3 on GPU or CPU)."""

    def __init__(self, model_name: str = "BAAI/bge-m3", device: str = "cpu") -> None:
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(model_name, device=device)
        self.device = device

    def embed(self, texts: list[str], batch_size: int = 32) -> list[list[float]]:
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
    """Factory: choose embedder based on environment."""
    device = cfg.device

    # If CUDA available and sentence-transformers installed, use local
    if device == "cuda":
        try:
            return LocalEmbedder(device="cuda")
        except Exception as e:
            print(f"  Local embedder failed ({e}), falling back to DashScope API")

    # Default: DashScope API (works everywhere, no GPU needed)
    if not cfg.dashscope.api_key:
        raise RuntimeError(
            "DASHSCOPE_API_KEY not set. Set it in .env or install sentence-transformers for local embeddings."
        )

    print("  Using DashScope API for embeddings")
    return DashScopeEmbedder()
