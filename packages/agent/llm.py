"""LLM client setup — Qwen2.5 via DashScope (OpenAI-compatible API)."""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from packages.shared.config import cfg


def get_primary_llm(temperature: float = 0.2) -> ChatOpenAI:
    """Main LLM for response generation, reasoning, document analysis.
    Uses Qwen2.5-72B-Instruct via DashScope."""
    return ChatOpenAI(
        model="qwen2.5-72b-instruct",
        base_url=cfg.dashscope.base_url,
        api_key=cfg.dashscope.api_key,
        temperature=temperature,
        max_tokens=2048,
        streaming=True,
    )


def get_fast_llm(temperature: float = 0.1) -> ChatOpenAI:
    """Fast LLM for intent routing, classification, entity extraction.
    Uses Qwen2.5-7B-Instruct via DashScope."""
    return ChatOpenAI(
        model="qwen2.5-7b-instruct",
        base_url=cfg.dashscope.base_url,
        api_key=cfg.dashscope.api_key,
        temperature=temperature,
        max_tokens=512,
    )
