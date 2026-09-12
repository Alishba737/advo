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
    project_id: Optional[str] = None


class CitationResponse(BaseModel):
    act_name: str
    section: Optional[str] = None
    text_snippet: str = ""
    # True when the cited act+section matched a chunk retrieved this run;
    # None when verification did not run, False when it did not match.
    verified: Optional[bool] = None


class ChatResponse(BaseModel):
    response: str
    citations: list[CitationResponse] = Field(default_factory=list)
    follow_up_questions: list[str] = Field(default_factory=list)
    disclaimer: Optional[str] = None
    tool_calls_made: int = 0
    # Grounding confidence derived from citation verification:
    # high = all citations verified, medium = some, low = none/empty.
    confidence: Optional[Literal["high", "medium", "low"]] = None
    # True when the user's message matches high-risk legal topics
    # (arrest, eviction, custody, deadlines, …) and we urge consulting a lawyer.
    high_risk: bool = False


class StreamEvent(BaseModel):
    type: Literal["token", "tool_call", "tool_result", "done", "error"]
    content: str
    citations: Optional[list[CitationResponse]] = None
    confidence: Optional[Literal["high", "medium", "low"]] = None
    high_risk: bool = False


class UploadResponse(BaseModel):
    document_id: str
    filename: str
    text_length: int
    preview: str


class HealthResponse(BaseModel):
    status: str
    version: str = "0.1.0"
    components: dict


class SpeakRequest(BaseModel):
    """Request body for text-to-speech."""

    text: str = Field(..., min_length=1, max_length=3000)
    voice: Optional[str] = None


class TranscriptionResponse(BaseModel):
    """Response for speech-to-text."""

    text: str
    duration_ms: Optional[int] = None


class LawSection(BaseModel):
    section: str
    title: str
    summary: str
    domain_tags: list[str]
    source_url: str


class LawAct(BaseModel):
    name: str
    year: str
    category: str
    official_url: str
    section_count: int
    sections: list[LawSection]


class LawCategory(BaseModel):
    name: str
    acts: list[LawAct]


class LawLibraryResponse(BaseModel):
    categories: list[LawCategory]


class LawSectionText(BaseModel):
    act: str
    section: str
    title: str
    full_text: str
