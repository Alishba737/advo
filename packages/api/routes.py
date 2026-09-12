"""ADVO API routes — chat, streaming, upload, health, voice."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, UploadFile, File, HTTPException, Body
from fastapi.responses import StreamingResponse, Response

from packages.api.schemas import (
    ChatRequest,
    ChatResponse,
    CitationResponse,
    UploadResponse,
    HealthResponse,
    StreamEvent,
    SpeakRequest,
    TranscriptionResponse,
    LawLibraryResponse,
    LawCategory,
    LawAct,
    LawSection,
    LawSectionText,
)
from packages.api.main import get_agent, get_retriever
from packages.agent.graph import _extract_citations, _verify_citations
from packages.agent.tools import get_retrieved_chunks
from packages.agent.memory import memory
from packages.projects.store import project_store
from packages.projects.models import ProjectCreate, ProjectUpdate, ProjectDocument

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Max characters of attached-document text injected into the LLM context
MAX_DOC_CONTEXT_CHARS = 8000

# Supported file types for document upload
_ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
}


def _save_upload_and_extract(file: UploadFile) -> UploadResponse:
    """Persist an uploaded file, extract text, and return upload metadata."""
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: PDF, DOCX, TXT",
        )

    doc_id = str(uuid.uuid4())[:8]
    ext = _ALLOWED_TYPES[file.content_type]
    filename = f"{doc_id}{ext}"
    filepath = UPLOAD_DIR / filename

    content = file.file.read()
    filepath.write_bytes(content)

    text = ""
    if ext == ".pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(str(filepath))
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e}")

    elif ext == ".docx":
        try:
            from docx import Document
            doc = Document(str(filepath))
            text = "\n".join(para.text for para in doc.paragraphs)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DOCX extraction failed: {e}")

    elif ext == ".txt":
        text = filepath.read_text(encoding="utf-8")

    (UPLOAD_DIR / f"{doc_id}.txt").write_text(text, encoding="utf-8")

    return UploadResponse(
        document_id=doc_id,
        filename=file.filename or filename,
        text_length=len(text),
        preview=text[:500] if text else "(empty document)",
    )


def _load_document_context(document_ids: list[str] | None) -> str:
    """Build a context block from the extracted text of attached documents."""
    if not document_ids:
        return ""
    parts = []
    for doc_id in document_ids[:3]:  # cap at 3 documents per message
        text_path = UPLOAD_DIR / f"{doc_id}.txt"
        if text_path.exists():
            content = text_path.read_text(encoding="utf-8").strip()
            if content:
                parts.append(f"--- Attached document ({doc_id}) ---\n{content}")
    if not parts:
        return ""
    return "\n\n".join(parts)[:MAX_DOC_CONTEXT_CHARS]


def _augment_with_documents(message: str, document_ids: list[str] | None) -> str:
    """Append attached-document text to the user message for the LLM."""
    context = _load_document_context(document_ids)
    if not context:
        return message
    return (
        f"{message}\n\n"
        f"The user has attached the following document(s) for analysis:\n\n{context}"
    )


def _resolve_project_context(request: ChatRequest) -> tuple[str | None, list[str]]:
    """Return project instructions and merged document ids for a chat request.

    If a project_id is provided, the backend loads the project and uses its
    instructions and document list as context. Explicit document_ids are merged
    in and filtered to the project's own documents.
    """
    if not request.project_id:
        return None, request.document_ids or []

    project = project_store.get_project(request.project_id)
    if not project:
        return None, request.document_ids or []

    project_doc_ids = {d.id for d in project.documents}
    explicit_ids = [d for d in (request.document_ids or []) if d in project_doc_ids]
    merged = list(dict.fromkeys(explicit_ids + list(project_doc_ids)))[:3]
    return project.instructions, merged


# Topics where getting it wrong carries real consequences — we surface a
# consult-a-lawyer banner for these.
_HIGH_RISK_RE = re.compile(
    r"\b("
    r"fir|first information report|arrest\w*|police|jail|imprison\w*|bail|criminal|"
    r"charged|accused|murder|theft|assault|warrant|summons|"
    r"court (?:case|order|notice|date|hearing)|deadline|limitation period|"
    r"evict\w*|demolition|divorce|khula|talaq|custody|deport\w*|"
    r"wrongfully terminat\w*|wrongful dismissal|sue|lawsuit|legal action"
    r")\b",
    re.IGNORECASE,
)


def _is_high_risk(message: str) -> bool:
    """True when the user's message touches a high-stakes legal topic."""
    return bool(_HIGH_RISK_RE.search(message))


def _confidence(citations: list) -> str:
    """Grounding confidence from citation verification results."""
    if not citations:
        return "low"
    flags = [bool(c.verified) for c in citations]
    if all(flags):
        return "high"
    if any(flags):
        return "medium"
    return "low"


# ─── Law Library ───────────────────────────────────────────────

# Act metadata and official sources (Pakistan statutory texts)
_ACT_OFFICIAL_URLS: dict[str, str] = {
    "Contract Act 1872": "https://www.na.gov.pk/uploads/documents/1333523681_951.pdf",
    "Pakistan Penal Code 1860": "https://www.na.gov.pk/uploads/documents/1333523681_951.pdf",
    "Criminal Procedure Code 1898": "https://www.na.gov.pk/uploads/documents/1333523681_951.pdf",
    "Qanun-e-Shahadat 1984": "https://www.na.gov.pk/uploads/documents/1333523681_951.pdf",
    "Constitution of Pakistan 1973": "https://www.na.gov.pk/uploads/documents/1973_constitution.pdf",
}

# Human-readable category from domain tag
_CATEGORY_MAP: dict[str, str] = {
    "contract": "Contract Law",
    "criminal": "Criminal Law",
    "family": "Family Law",
    "evidence": "Evidence",
    "property": "Property Law",
    "constitutional": "Constitutional Law",
}


@router.get("/laws", response_model=LawLibraryResponse)
async def law_library():
    """Return the structured legal library (acts, sections, summaries)."""
    graph_path = Path(__file__).resolve().parent.parent.parent / "data" / "legal" / "legal_graph.json"
    if not graph_path.exists():
        return LawLibraryResponse(categories=[])

    data = json.loads(graph_path.read_text(encoding="utf-8"))
    nodes = data.get("nodes", [])

    # Group provision nodes by act
    acts_map: dict[str, dict] = {}
    for node in nodes:
        if node.get("type") != "provision":
            continue
        act = node.get("act") or "Unknown Act"
        acts_map.setdefault(act, {"sections": [], "tags": []})
        acts_map[act]["sections"].append(node)
        acts_map[act]["tags"].extend(node.get("domain_tags", []))

    # Build categories
    category_acts: dict[str, list[LawAct]] = {}
    for act, info in acts_map.items():
        nodes_sorted = sorted(info["sections"], key=lambda n: _section_sort_key(n.get("section", "")))
        official_url = _ACT_OFFICIAL_URLS.get(act, "https://www.na.gov.pk")

        # Attach per-section source URLs that jump to the section inside the PDF.
        # Chromium/Edge PDF viewers support #search=<query>.
        def _section_source_url(section: str) -> str:
            if not official_url.endswith(".pdf"):
                return official_url
            return f"{official_url}#search={quote(f'Section {section}', safe='')}"

        sections = [
            LawSection(
                section=n.get("section", ""),
                title=n.get("title", ""),
                summary=n.get("summary", ""),
                domain_tags=n.get("domain_tags", []),
                source_url=_section_source_url(n.get("section", "")),
            )
            for n in nodes_sorted
        ]

        # Pick category from most common tag
        tags = info["tags"]
        tag = max(set(tags), key=tags.count) if tags else "general"
        category = _CATEGORY_MAP.get(tag, tag.replace("_", " ").title())

        # Extract year from act name if present
        year = ""
        if match := re.search(r"\b(18|19|20)\d{2}\b", act):
            year = match.group(0)

        law_act = LawAct(
            name=act,
            year=year,
            category=category,
            official_url=official_url,
            section_count=len(sections),
            sections=sections,
        )
        category_acts.setdefault(category, []).append(law_act)

    categories = [
        LawCategory(name=cat, acts=acts)
        for cat, acts in sorted(category_acts.items())
    ]
    return LawLibraryResponse(categories=categories)


def _section_sort_key(section: str) -> tuple[int, str]:
    """Sort section labels numerically when possible."""
    digits = re.sub(r"[^0-9]", "", section)
    return (int(digits) if digits.isdigit() else 9999, section)


def _act_filename(act: str) -> str | None:
    """Map act display name to the legal text file in data/legal/."""
    legal_dir = Path(__file__).resolve().parent.parent.parent / "data" / "legal"
    # Try direct normalization first
    normalized = act.lower().replace(" ", "_").replace(",", "").replace(".", "")
    candidates = [
        legal_dir / f"{normalized}.txt",
        legal_dir / f"{normalized}_act.txt",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    # Fallback: scan for any file whose name contains the act year or main words
    words = [w for w in re.findall(r"[A-Za-z]+", act.lower()) if len(w) > 2]
    for filepath in legal_dir.glob("*.txt"):
        name_lower = filepath.stem.lower()
        if all(w in name_lower for w in words[:2]):
            return str(filepath)
    return None


def _extract_section_text(act: str, section: str) -> LawSectionText | None:
    """Read the act text file and extract the full text of one section."""
    filepath = _act_filename(act)
    if not filepath:
        return None

    text = Path(filepath).read_text(encoding="utf-8")
    # Section headers look like: "1. Short title." or "10. What agreements are contracts."
    pattern = re.compile(rf"^({re.escape(section)})\.\s+(.*?)\n(.*?)(?=\n\d+\.\s|\Z)", re.MULTILINE | re.DOTALL)
    match = pattern.search(text)
    if not match:
        return None

    title = match.group(2).strip()
    body = match.group(3).strip()
    return LawSectionText(act=act, section=section, title=title, full_text=body)


@router.get("/laws/section", response_model=LawSectionText)
async def law_section_text(act: str, section: str):
    """Return the full text of a single statutory section."""
    result = _extract_section_text(act, section)
    if not result:
        raise HTTPException(status_code=404, detail="Section not found")
    return result


# ─── Health ────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Check API and component health."""
    try:
        agent = get_agent()
        agent_ok = True
    except RuntimeError:
        agent_ok = False

    try:
        retriever = get_retriever()
        retriever_ok = True
    except RuntimeError:
        retriever_ok = False

    status = "healthy" if (agent_ok and retriever_ok) else "degraded"

    return HealthResponse(
        status=status,
        components={
            "agent": "ok" if agent_ok else "unavailable",
            "retriever": "ok" if retriever_ok else "unavailable",
            "sessions": memory.session_count(),
        },
    )


# ─── Chat (non-streaming) ─────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message and get a complete response."""
    agent = get_agent()

    history = memory.get_last_n(request.session_id, n=10)
    project_instructions, document_ids = _resolve_project_context(request)

    result = agent.chat(
        user_message=_augment_with_documents(request.message, document_ids),
        session_id=request.session_id,
        user_mode=request.user_mode,
        history=history,
        project_instructions=project_instructions,
    )

    # Store in memory (the original message, without document text)
    memory.add_user_message(request.session_id, request.message)
    memory.add_ai_message(request.session_id, result["response"])

    # Build citations
    citations = [
        CitationResponse(
            act_name=c.get("act", ""),
            section=c.get("section"),
            text_snippet=c.get("text_snippet", ""),
            verified=c.get("verified"),
        )
        for c in result.get("citations", [])
    ]

    return ChatResponse(
        response=result["response"],
        citations=citations,
        tool_calls_made=result["tool_calls_made"],
        disclaimer="This is AI-generated legal information, not legal advice. Please consult a qualified lawyer for important legal matters.",
        confidence=_confidence(citations),
        high_risk=_is_high_risk(request.message),
    )


# ─── Chat (streaming) ─────────────────────────────────────────

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Stream the agent's response via Server-Sent Events."""
    agent = get_agent()

    history = memory.get_last_n(request.session_id, n=10)
    project_instructions, document_ids = _resolve_project_context(request)

    async def event_generator():
        full_response = ""
        try:
            for event in agent.chat_stream(
                user_message=_augment_with_documents(request.message, document_ids),
                session_id=request.session_id,
                user_mode=request.user_mode,
                history=history,
                project_instructions=project_instructions,
            ):
                # Skip the agent's bare "done" — we emit an enriched one with citations
                if event["type"] == "done":
                    continue

                event_data = StreamEvent(
                    type=event["type"],
                    content=event["content"],
                )
                yield f"data: {event_data.model_dump_json()}\n\n"

                if event["type"] == "token":
                    full_response += event["content"]

            # Store in memory after streaming
            memory.add_user_message(request.session_id, request.message)
            memory.add_ai_message(request.session_id, full_response)

            # Emit the final done event with citations verified against
            # the chunks retrieved during this streamed run
            citations = [
                CitationResponse(
                    act_name=c.get("act", ""),
                    section=c.get("section"),
                    text_snippet=c.get("text_snippet", ""),
                    verified=c.get("verified"),
                )
                for c in _verify_citations(
                    _extract_citations(full_response), get_retrieved_chunks()
                )
            ]
            done_event = StreamEvent(
                type="done",
                content="",
                citations=citations,
                confidence=_confidence(citations),
                high_risk=_is_high_risk(request.message),
            )
            yield f"data: {done_event.model_dump_json()}\n\n"

        except Exception as e:
            error_event = StreamEvent(type="error", content=str(e))
            yield f"data: {error_event.model_dump_json()}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Document Upload ──────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload a legal document for analysis."""
    return _save_upload_and_extract(file)


# ─── Session Management ───────────────────────────────────────

@router.get("/sessions")
async def list_sessions():
    """List chat sessions (most recently active first)."""
    return {"sessions": memory.list_sessions()}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(session_id: str):
    """Fetch the message history of one chat session."""
    return {"session_id": session_id, "messages": memory.get_messages(session_id)}


@router.delete("/sessions/{session_id}")
async def clear_session(session_id: str):
    """Clear a chat session's history."""
    memory.clear(session_id)
    return {"status": "cleared", "session_id": session_id}


# ─── Voice ─────────────────────────────────────────────────────

# 1 MiB of 16kHz 16-bit mono ≈ 5.5 minutes of speech
MAX_AUDIO_BYTES = 10 * 1024 * 1024


@router.post("/voice/transcribe", response_model=TranscriptionResponse)
async def voice_transcribe(
    request: bytes = Body(..., media_type="application/octet-stream"),
    sample_rate: int = 16000,
):
    """Transcribe raw 16-bit mono PCM audio (binary body) to text.

    The browser records PCM via the Web Audio API and posts the raw bytes.
    """
    if not request:
        raise HTTPException(status_code=400, detail="Empty audio body")
    if len(request) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large (max 10 MiB)")

    from packages.voice.stt import transcribe_pcm, TranscriptionError

    duration_ms = int(len(request) / (sample_rate * 2) * 1000)
    try:
        text = await transcribe_pcm(request, sample_rate=sample_rate)
    except TranscriptionError as e:
        raise HTTPException(status_code=502, detail=str(e))

    if not text:
        return TranscriptionResponse(text="", duration_ms=duration_ms)
    return TranscriptionResponse(text=text, duration_ms=duration_ms)


@router.post("/voice/speak")
async def voice_speak(request: SpeakRequest):
    """Synthesize speech from text and return WAV audio bytes."""
    from packages.voice.tts import synthesize, TTSError

    try:
        audio = await asyncio.to_thread(synthesize, request.text, request.voice)
    except TTSError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="advo-response.wav"'},
    )


# ─── Projects ─────────────────────────────────────────────────

@router.get("/projects")
async def list_projects(role: str | None = None):
    """List projects, optionally filtered by role."""
    projects = project_store.list_projects(role=role)  # type: ignore[arg-type]
    return {"projects": [p.model_dump(mode="json") for p in projects]}


@router.post("/projects")
async def create_project_endpoint(payload: ProjectCreate):
    """Create a new project."""
    project = project_store.create_project(payload)
    return project.model_dump(mode="json")


@router.get("/projects/{project_id}")
async def get_project_endpoint(project_id: str):
    """Get a single project by ID."""
    project = project_store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.model_dump(mode="json")


@router.put("/projects/{project_id}")
async def update_project_endpoint(project_id: str, payload: ProjectUpdate):
    """Update a project's metadata."""
    project = project_store.update_project(project_id, payload)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.model_dump(mode="json")


@router.delete("/projects/{project_id}")
async def delete_project_endpoint(project_id: str):
    """Delete a project and remove its document associations."""
    deleted = project_store.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted", "project_id": project_id}


@router.post("/projects/{project_id}/documents")
async def upload_project_document(project_id: str, file: UploadFile = File(...)):
    """Upload a document and attach it to a project."""
    project = project_store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if len(project.documents) >= 5:
        raise HTTPException(status_code=400, detail="Project document limit reached (max 5)")

    result = _save_upload_and_extract(file)
    updated = project_store.add_document(
        project_id,
        ProjectDocument(
            id=result.document_id,
            filename=result.filename,
            text_length=result.text_length,
            preview=result.preview,
        ),
    )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to attach document to project")
    return updated.model_dump(mode="json")


@router.delete("/projects/{project_id}/documents/{document_id}")
async def remove_project_document(project_id: str, document_id: str):
    """Remove a document association from a project."""
    project = project_store.remove_document(project_id, document_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project.model_dump(mode="json")
