"""Pydantic models for ADVO Projects."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional
from pydantic import BaseModel, Field


UserMode = Literal["citizen", "student", "lawyer"]


class ProjectDocument(BaseModel):
    """A document attached to a project."""

    id: str
    filename: str
    text_length: int
    preview: str
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Project(BaseModel):
    """A project bundles instructions and reference documents for a legal matter."""

    id: str
    name: str
    role: UserMode
    description: Optional[str] = None
    instructions: Optional[str] = None
    documents: list[ProjectDocument] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProjectCreate(BaseModel):
    """Payload for creating a project."""

    name: str = Field(..., min_length=1, max_length=200)
    role: UserMode = "citizen"
    description: Optional[str] = None
    instructions: Optional[str] = None


class ProjectUpdate(BaseModel):
    """Payload for updating a project."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    instructions: Optional[str] = None
