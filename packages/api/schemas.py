"""API request/response schemas."""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    session_id: str = "default"
    user_mode: Literal["citizen", "student", "lawyer"] = "citizen"
    jurisdiction: Optional[str] = "Pakistan"
    document_ids: Optional[list[str]] = None


class CitationResponse(BaseModel):
    act_name: str
    section: Optional[str] = None
    text_snippet: str = ""


class ChatResponse(BaseModel):
    response: str
    citations: list[CitationResponse] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    disclaimer: Optional[str] = None
    tool_calls_made: int = 0


class StreamEvent(BaseModel):
    type: Literal["token", "tool_call", "tool_result", "done", "error"]
    content: str


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    text_length: int
    preview: str


class HealthResponse(BaseModel):
    status: str
    version: str = "0.1.0"
    components: dict
