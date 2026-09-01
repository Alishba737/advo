"""ADVO API routes — chat, streaming, upload, health, voice."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from pathlib import Path

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
)
from packages.api.main import get_agent, get_retriever
from packages.agent.graph import _extract_citations, _verify_citations
from packages.agent.tools import get_retrieved_chunks
from packages.agent.memory import memory

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# Max characters of attached-document text injected into the LLM context
MAX_DOC_CONTEXT_CHARS = 8000


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

    result = agent.chat(
        user_message=_augment_with_documents(request.message, request.document_ids),
        session_id=request.session_id,
        user_mode=request.user_mode,
        history=history,
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

    async def event_generator():
        full_response = ""
        try:
            for event in agent.chat_stream(
                user_message=_augment_with_documents(request.message, request.document_ids),
                session_id=request.session_id,
                user_mode=request.user_mode,
                history=history,
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
    allowed_types = {
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "text/plain": ".txt",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: PDF, DOCX, TXT",
        )

    # Save file
    doc_id = str(uuid.uuid4())[:8]
    ext = allowed_types[file.content_type]
    filename = f"{doc_id}{ext}"
    filepath = UPLOAD_DIR / filename

    content = await file.read()
    filepath.write_bytes(content)

    # Extract text
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

    # Persist the extracted text so chat requests can attach it as context
    (UPLOAD_DIR / f"{doc_id}.txt").write_text(text, encoding="utf-8")

    return UploadResponse(
        document_id=doc_id,
        filename=file.filename or filename,
        text_length=len(text),
        preview=text[:500] if text else "(empty document)",
    )


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
