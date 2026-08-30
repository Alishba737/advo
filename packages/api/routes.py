"""ADVO API routes — chat, streaming, upload, health."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse

from packages.api.schemas import (
    ChatRequest,
    ChatResponse,
    CitationResponse,
    UploadResponse,
    HealthResponse,
    StreamEvent,
)
from packages.api.main import get_agent, get_retriever
from packages.agent.memory import memory

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


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
        user_message=request.message,
        session_id=request.session_id,
        user_mode=request.user_mode,
        history=history,
    )

    # Store in memory
    memory.add_user_message(request.session_id, request.message)
    memory.add_ai_message(request.session_id, result["response"])

    # Build citations
    citations = [
        CitationResponse(
            act_name=c.get("act", ""),
            section=c.get("section"),
        )
        for c in result.get("citations", [])
    ]

    return ChatResponse(
        response=result["response"],
        citations=citations,
        tool_calls_made=result["tool_calls_made"],
        disclaimer="This is AI-generated legal information, not legal advice. Please consult a qualified lawyer for important legal matters.",
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
                user_message=request.message,
                session_id=request.session_id,
                user_mode=request.user_mode,
                history=history,
            ):
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

    return UploadResponse(
        document_id=doc_id,
        filename=file.filename or filename,
        text_length=len(text),
        preview=text[:500] if text else "(empty document)",
    )


# ─── Session Management ───────────────────────────────────────

@router.get("/sessions")
async def list_sessions():
    """List active chat sessions."""
    return {"sessions": memory.list_sessions()}


@router.delete("/sessions/{session_id}")
async def clear_session(session_id: str):
    """Clear a chat session's history."""
    memory.clear(session_id)
    return {"status": "cleared", "session_id": session_id}
