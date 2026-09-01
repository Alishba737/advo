# ADVO — AI-Powered Legal Assistant & Agent

An AI-powered legal technology platform for legal assistance, education, research, and guidance.

## Features (MVP)

- **Legal RAG** — Graph-augmented retrieval from Pakistani legal corpus
- **AI Agent** — Qwen-powered agentic system with tool-calling
- **Three Modes** — Citizen, Student, Lawyer
- **Voice** — Speech input (qwen3-asr-flash-realtime) and output (qwen3-tts-flash) — mic button in chat, speaker button on every reply
- **Document Analysis** — Upload, extract, analyze legal documents
- **Citations with verification** — every cited act/section is checked against the retrieved sources; verified citations carry the actual statute text, unverified ones are flagged
- **Safety layer** — grounding confidence indicator (high/medium/low), high-risk topic advisory (consult-a-lawyer banner), mandatory disclaimer
- **Session history** — resume past conversations from the History panel

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | Qwen (DashScope / Alibaba Model Studio) |
| Embeddings | bge-m3 (local, CPU or GPU) or DashScope text-embedding-v3 |
| Vector DB | Qdrant (Docker or in-memory) |
| STT | qwen3-asr-flash-realtime (DashScope realtime WebSocket, 16 kHz PCM) |
| TTS | qwen3-tts-flash (DashScope multimodal-generation API) |
| Backend | Python + FastAPI |
| Frontend | Next.js 16 + Tailwind + shadcn/ui |
| Agent | LangGraph |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Alishba737/advo.git
cd advo

# 2. Environment
cp .env.example .env
# Edit .env with your DashScope API key

# 3. Start local services (optional — Qdrant falls back to in-memory)
docker compose up -d

# 4. Install dependencies
pip install -r requirements.txt

# 5. Run the backend (from repo root)
python -m uvicorn packages.api.main:app --host 127.0.0.1 --port 8000

# 6. Run the frontend (separate terminal, from apps/web)
npm install
npm run dev
# Open http://localhost:3000
```

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Service health + active mode |
| POST | `/api/chat` | Send a message (sync), returns answer + citations (with verification) + confidence + high-risk flag |
| POST | `/api/chat/stream` | Same, streamed via SSE |
| POST | `/api/upload` | Upload PDF/DOCX/TXT for document-grounded chat |
| GET | `/api/sessions` | List chat sessions (title, message count, last active) |
| GET | `/api/sessions/{id}/messages` | Full message history of one session |
| DELETE | `/api/sessions/{id}` | Clear a session |
| POST | `/api/voice/transcribe` | Speech-to-text (raw 16 kHz PCM body, `?sample_rate=` optional) |
| POST | `/api/voice/speak` | Text-to-speech (JSON `{text, voice?}` → `audio/wav`) |

Voice notes: the browser captures 16 kHz mono PCM via `AudioContext` + `ScriptProcessorNode`; the backend streams it to the DashScope realtime WebSocket and returns the transcript. TTS is capped at ~1200 characters per request (≈1 min of speech) for latency.

## Hallucination Safety

Every answer passes through a citation-verification pipeline:

1. The agent retrieves legal provisions (tool calls) and composes an answer
2. Citations are extracted from the answer text (handles "Section 10 of the Contract Act", plural lists, bare heading forms)
3. Each citation is matched against the chunks actually retrieved — verified citations carry the real statute text as an expandable snippet; unmatched citations get an amber "Unverified" badge
4. A grounding confidence chip (high/medium/low) summarizes how well the answer is sourced
5. High-stakes queries (arrest, eviction, custody, deadlines, …) trigger a consult-a-lawyer advisory banner

## Repository Structure

```
advo/
├── apps/
│   ├── web/              # Next.js frontend
│   └── mobile/           # React Native (Phase 2)
├── packages/
│   ├── api/              # FastAPI backend
│   ├── agent/            # ADVO agent orchestration
│   ├── rag/              # RAG pipeline
│   ├── voice/            # STT/TTS pipeline
│   └── shared/           # Shared utilities
├── data/
│   └── legal/            # Legal documents & knowledge graph
├── docker-compose.yml
└── .env.example
```

## Development

Requires:
- Python 3.11+
- Node.js 20+
- Docker Desktop
- NVIDIA GPU with CUDA (optional — embeddings run on CPU without it)
- DashScope API key (Alibaba Cloud)
