"""Legal document chunker — parses Pakistani legal texts into structured chunks."""

from __future__ import annotations

import re
from pathlib import Path

from packages.shared.models import LegalChunk


# Common patterns in Pakistani legal documents
SECTION_PATTERNS = [
    # "Section 1.", "Section 14.", "Section 2-A."
    re.compile(r"^(?:Section|Sec\.?)\s+(\d+[-A-Za-z]*)\.", re.IGNORECASE),
    # "1. Short title..." "14. Notice period..."
    re.compile(r"^(\d+[-A-Za-z]*)\.\s+"),
    # "Article 1.", "Article 14."
    re.compile(r"^(?:Article|Art\.?)\s+(\d+[-A-Za-z]*)\.", re.IGNORECASE),
]

# Domain keyword mapping for auto-tagging
DOMAIN_KEYWORDS = {
    "employment": [
        "employee", "employer", "employment", "termination", "wages",
        "salary", "labour", "labor", "worker", "dismissal", "notice period",
        "severance", "overtime", "workman", "service",
    ],
    "contract": [
        "contract", "agreement", "offer", "acceptance", "consideration",
        "breach", "damages", "obligation", "party", "parties",
    ],
    "property": [
        "property", "land", "tenant", "landlord", "rent", "lease",
        "eviction", "possession", "transfer", "mortgage",
    ],
    "criminal": [
        "offence", "punishment", "imprisonment", "fine", "bail",
        "arrest", "accused", "complaint", "cognizable", "trial",
    ],
    "family": [
        "marriage", "divorce", "maintenance", "custody", "dower",
        "guardian", "minor", "dissolution", "iddat",
    ],
    "constitutional": [
        "fundamental right", "constitution", "article", "supreme court",
        "high court", "federation", "province", "parliament", "assembly",
    ],
}


def detect_domain(text: str) -> list[str]:
    """Auto-detect legal domain tags from text content."""
    text_lower = text.lower()
    tags = []
    for domain, keywords in DOMAIN_KEYWORDS.items():
        if any(kw in text_lower for kw in keywords):
            tags.append(domain)
    return tags


def _make_chunk_id(act_name: str, section: str | None, idx: int) -> str:
    """Generate a unique chunk ID."""
    safe_act = re.sub(r"[^a-zA-Z0-9]", "_", act_name).lower().strip("_")
    sec = section or f"chunk_{idx}"
    return f"{safe_act}__s{sec}"


def parse_legal_text(
    text: str,
    act_name: str,
    source_file: str | None = None,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> list[LegalChunk]:
    """Parse a legal document into structured section-level chunks.

    Strategy:
    1. Try to split by section/article headings
    2. If sections are too long, sub-chunk with overlap
    3. Tag each chunk with domain and metadata
    """
    lines = text.split("\n")
    sections: list[dict] = []
    current_section: dict | None = None

    for line in lines:
        section_num = None
        for pattern in SECTION_PATTERNS:
            match = pattern.match(line.strip())
            if match:
                section_num = match.group(1)
                break

        if section_num:
            if current_section:
                sections.append(current_section)
            current_section = {
                "section_number": section_num,
                "lines": [line],
            }
        else:
            if current_section is None:
                # Text before first section heading — preamble/preamble-like
                current_section = {
                    "section_number": None,
                    "lines": [],
                }
            current_section["lines"].append(line)

    if current_section:
        sections.append(current_section)

    # Convert sections to chunks
    chunks: list[LegalChunk] = []
    global_idx = 0

    for section in sections:
        section_text = "\n".join(section["lines"]).strip()
        if not section_text:
            continue

        # Sub-chunk if section is too long
        if len(section_text) <= chunk_size * 4:  # ~4 chars per token
            chunk = LegalChunk(
                id=_make_chunk_id(act_name, section["section_number"], global_idx),
                text=section_text,
                act_name=act_name,
                section_number=section["section_number"],
                jurisdiction="Pakistan",
                chunk_type="section",
                domain_tags=detect_domain(section_text),
                graph_node_id=_make_graph_node_id(act_name, section["section_number"]),
                source_file=source_file,
            )
            chunks.append(chunk)
            global_idx += 1
        else:
            # Split long sections with overlap
            words = section_text.split()
            start = 0
            sub_idx = 0
            while start < len(words):
                end = start + chunk_size
                sub_text = " ".join(words[start:end])
                chunk = LegalChunk(
                    id=_make_chunk_id(act_name, section["section_number"], global_idx),
                    text=sub_text,
                    act_name=act_name,
                    section_number=section["section_number"],
                    jurisdiction="Pakistan",
                    chunk_type="section",
                    domain_tags=detect_domain(sub_text),
                    graph_node_id=_make_graph_node_id(act_name, section["section_number"]),
                    source_file=source_file,
                )
                chunks.append(chunk)
                start = end - chunk_overlap
                global_idx += 1
                sub_idx += 1

    return chunks


def _make_graph_node_id(act_name: str, section: str | None) -> str | None:
    """Create a graph node ID from act name and section."""
    if not section:
        return None
    safe_act = re.sub(r"[^a-zA-Z0-9]", "_", act_name).lower().strip("_")
    return f"{safe_act}__s{section}"


def load_and_parse_directory(
    directory: Path,
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> list[LegalChunk]:
    """Load all .txt files from a directory and parse into chunks."""
    all_chunks: list[LegalChunk] = []

    for filepath in sorted(directory.glob("*.txt")):
        act_name = filepath.stem.replace("_", " ").title()
        text = filepath.read_text(encoding="utf-8")
        chunks = parse_legal_text(
            text,
            act_name=act_name,
            source_file=str(filepath),
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        all_chunks.extend(chunks)
        print(f"  Parsed {filepath.name}: {len(chunks)} chunks")

    return all_chunks
