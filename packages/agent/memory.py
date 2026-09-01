"""Conversation memory manager — stores per-session chat history."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from langchain_core.messages import BaseMessage, HumanMessage, AIMessage


class ConversationMemory:
    """In-memory conversation store. Per-session message history.

    On RTX laptop with Redis, swap this for a Redis-backed implementation.
    """

    def __init__(self, max_messages: int = 50) -> None:
        self._sessions: dict[str, list[BaseMessage]] = defaultdict(list)
        self._meta: dict[str, dict] = {}
        self.max_messages = max_messages

    def add_user_message(self, session_id: str, content: str) -> None:
        self._sessions[session_id].append(HumanMessage(content=content))
        self._trim(session_id)
        self._touch(session_id, role="user", content=content)

    def add_ai_message(self, session_id: str, content: str) -> None:
        self._sessions[session_id].append(AIMessage(content=content))
        self._trim(session_id)
        self._touch(session_id, role="assistant", content=content)

    def get_history(self, session_id: str) -> list[BaseMessage]:
        return list(self._sessions.get(session_id, []))

    def get_last_n(self, session_id: str, n: int = 10) -> list[BaseMessage]:
        history = self._sessions.get(session_id, [])
        return history[-n:] if history else []

    def get_messages(self, session_id: str) -> list[dict]:
        """Session messages as plain dicts for the API."""
        out = []
        for msg in self._sessions.get(session_id, []):
            role = "user" if isinstance(msg, HumanMessage) else (
                "assistant" if isinstance(msg, AIMessage) else "system"
            )
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            if content:
                out.append({"role": role, "content": content})
        return out

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        self._meta.pop(session_id, None)

    def _trim(self, session_id: str) -> None:
        """Keep only the last max_messages to manage context window."""
        messages = self._sessions[session_id]
        if len(messages) > self.max_messages:
            self._sessions[session_id] = messages[-self.max_messages:]

    def _touch(self, session_id: str, role: str, content: str) -> None:
        """Track lightweight session metadata for the history list."""
        meta = self._meta.setdefault(
            session_id, {"title": "", "message_count": 0, "updated": ""}
        )
        meta["message_count"] += 1
        meta["updated"] = datetime.now().isoformat(timespec="seconds")
        # First user message becomes the session title
        if role == "user" and not meta["title"]:
            meta["title"] = " ".join(content.split())[:60]

    def session_count(self) -> int:
        return len(self._meta)

    def list_sessions(self) -> list[dict]:
        """Session metadata, most recently active first."""
        sessions = [
            {"id": sid, **meta} for sid, meta in self._meta.items()
        ]
        sessions.sort(key=lambda s: s.get("updated", ""), reverse=True)
        return sessions


# Global memory instance
memory = ConversationMemory()
