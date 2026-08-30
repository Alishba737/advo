"""Conversation memory manager — stores per-session chat history."""

from __future__ import annotations

from collections import defaultdict
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage


class ConversationMemory:
    """In-memory conversation store. Per-session message history.

    On RTX laptop with Redis, swap this for a Redis-backed implementation.
    """

    def __init__(self, max_messages: int = 50) -> None:
        self._sessions: dict[str, list[BaseMessage]] = defaultdict(list)
        self.max_messages = max_messages

    def add_user_message(self, session_id: str, content: str) -> None:
        self._sessions[session_id].append(HumanMessage(content=content))
        self._trim(session_id)

    def add_ai_message(self, session_id: str, content: str) -> None:
        self._sessions[session_id].append(AIMessage(content=content))
        self._trim(session_id)

    def get_history(self, session_id: str) -> list[BaseMessage]:
        return list(self._sessions.get(session_id, []))

    def get_last_n(self, session_id: str, n: int = 10) -> list[BaseMessage]:
        history = self._sessions.get(session_id, [])
        return history[-n:] if history else []

    def clear(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def _trim(self, session_id: str) -> None:
        """Keep only the last max_messages to manage context window."""
        messages = self._sessions[session_id]
        if len(messages) > self.max_messages:
            self._sessions[session_id] = messages[-self.max_messages:]

    def session_count(self) -> int:
        return len(self._sessions)

    def list_sessions(self) -> list[str]:
        return list(self._sessions.keys())


# Global memory instance
memory = ConversationMemory()
