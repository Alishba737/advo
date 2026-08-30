"""ADVO Shared Data Models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LegalChunk(BaseModel):
    """A chunk of legal text with rich metadata."""

    id: str
    text: str
    act_name: str
    section_number: str | None = None
    section_title: str | None = None
    jurisdiction: str = "Pakistan"
    chunk_type: str = "section"  # section, article, preamble, definition
    domain_tags: list[str] = Field(default_factory=list)
    graph_node_id: str | None = None
    source_file: str | None = None


class GraphNode(BaseModel):
    """A node in the legal knowledge graph."""

    id: str
    type: str = "provision"  # provision, concept, authority
    act: str
    section: str
    title: str
    domain_tags: list[str] = Field(default_factory=list)
    summary: str = ""


class GraphEdge(BaseModel):
    """A relationship between two legal provisions."""

    source: str
    target: str
    relation: str  # references, overrides, related_to, defines, amends


class LegalGraph(BaseModel):
    """The complete legal knowledge graph."""

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class RetrievalResult(BaseModel):
    """A single retrieval result with score and metadata."""

    chunk: LegalChunk
    score: float
    source: str = "vector"  # vector, bm25, graph_expansion
    graph_path: list[str] = Field(default_factory=list)


class Citation(BaseModel):
    """A legal citation for grounding."""

    act_name: str
    section: str | None = None
    text_snippet: str = ""
