# ADVO Implementation Plan

## Guiding Principle
**Build the critical path first.** Every phase produces a working, demoable increment. Nothing is started until the prior phase is functional.

## Development Environment
**Primary machine:** Laptop with NVIDIA RTX 1070 (8GB VRAM)  
**Mode:** Local-first — all databases, vector DB, embeddings, and reranking run locally. Only LLM inference, STT, and TTS use Alibaba DashScope API.  
**Later migration:** Swap `.env` connection strings to point to cloud services — zero code changes.

### VRAM Budget (RTX 1070 8GB)
| Component | VRAM | 
|---|---|
| bge-m3 (embeddings) | ~2.2 GB |
| bge-reranker-v2-m3 | ~0.6 GB |
| **Total GPU** | **~2.8 GB / 8 GB** |
| Remaining headroom | ~5.2 GB (could self-host Qwen2.5-7B via ollama later) |

### Local Services
| Service | How | Port |
|---|---|---|
| Qdrant (Vector DB) | Docker: `qdrant/qdrant` | 6333 |
| PostgreSQL | Docker: `postgres:16` | 5432 |
| Redis | Docker: `redis:7-alpine` | 6379 |
| bge-m3 + reranker | `sentence-transformers` or `infinity-emb` on GPU | In-process |

### Cloud Services (DashScope API)
| Service | Model | Why Cloud |
|---|---|---|
| Main LLM | Qwen2.5-72B-Instruct | 72B params, needs ~40GB VRAM |
| Fast LLM | Qwen2.5-7B-Instruct | Simpler via API for now |
| STT | Paraformer-v2 | DashScope hosted |
| TTS | CosyVoice | DashScope hosted |

## Locked Technical Stack
| Layer | Choice | Hosting | Rationale |
|---|---|---|---|
| **LLM** | Qwen2.5-72B-Instruct | DashScope API | Strong multilingual, tool-calling, cost-effective |
| **LLM (fast/routing)** | Qwen2.5-7B-Instruct | DashScope API | Low-latency routing; can self-host on RTX 1070 later |
| **Embeddings** | `bge-m3` (BAAI) | Local GPU | Best multilingual retrieval, no per-call cost |
| **Reranking** | `bge-reranker-v2-m3` (BAAI) | Local GPU | Strong cross-lingual reranking |
| **STT** | Paraformer-v2 | DashScope API | High-accuracy ASR, multilingual |
| **TTS** | CosyVoice | DashScope API | Natural speech synthesis |
| **Vector DB** | Qdrant | Local Docker | Best metadata filtering for graph-augmented retrieval |
| **Database** | PostgreSQL 16 | Local Docker | Session storage, document metadata |
| **Cache** | Redis 7 | Local Docker | Conversation state, rate limiting |
| **Backend** | Python + FastAPI | Local | Best AI/ML ecosystem |
| **Frontend** | Next.js + Tailwind + shadcn/ui | Local | Fast, polished, responsive |
| **Agent Framework** | LangGraph | In-process | Best control flow for agentic RAG |

---

## Phase 0 — Project Scaffolding & Foundation (Day 1)

### 0.1 Repository Structure
```
advo/
├── apps/
│   ├── web/              # Next.js web application
│   └── mobile/           # Expo/React Native (Phase 2 or MVP stretch)
├── packages/
│   ├── api/              # FastAPI backend
│   ├── agent/            # ADVO agent orchestration
│   ├── rag/              # RAG pipeline (ingestion, retrieval, reranking)
│   ├── voice/            # STT/TTS pipeline
│   └── shared/           # Shared types, constants, configs
├── data/
│   └── legal/            # Raw legal documents (Constitution, Acts, etc.)
├── docker-compose.yml
├── .env.example
└── README.md
```

### 0.2 Infrastructure Setup
- **Python 3.11+** with `uv` or `pip` for dependency management
- **Docker Desktop** installed on RTX 1070 laptop (for Qdrant, Postgres, Redis)
- **NVIDIA CUDA toolkit** + `torch` with CUDA support for bge-m3/reranker
- **DashScope API key** — sign up at Alibaba Cloud Model Studio
- **Environment config** via `.env`:

```env
# .env.example

# --- DashScope (Alibaba Cloud) ---
DASHSCOPE_API_KEY=sk-xxx
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# --- Local Services ---
QDRANT_URL=http://localhost:6333
POSTGRES_DSN=postgresql://advo:advo@localhost:5432/advo
REDIS_URL=redis://localhost:6379

# --- Local Models ---
EMBEDDING_MODEL=BAAI/bge-m3
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
DEVICE=cuda  # or cpu if no GPU
```

- **docker-compose.yml** for one-command local infra startup:

```yaml
services:
  qdrant:
    image: qdrant/qdrant
    ports: ["6333:6333"]
    volumes: ["./data/qdrant:/qdrant/storage"]
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: advo
      POSTGRES_PASSWORD: advo
      POSTGRES_DB: advo
    ports: ["5432:5432"]
    volumes: ["./data/postgres:/var/lib/postgresql/data"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

```bash
# One command to start all local infrastructure:
docker compose up -d
```

### 0.3 Legal Data Collection (MVP Jurisdiction: Pakistan)
- Download and organize key legal texts:
  - Constitution of Pakistan
  - Pakistan Penal Code (PPC)
  - Code of Criminal Procedure (CrPC)
  - Code of Civil Procedure (CPC)
  - Contract Act 1872
  - Key labour/employment laws
  - Landlord-tenant laws
  - Family laws
- Store as structured text/PDF in `data/legal/`

**Deliverable:** Running project skeleton, legal corpus ready for ingestion.

---

## Phase 1 — Graph-Augmented Legal RAG Pipeline (Day 1–2) ⭐ MVP Core

This is the hybrid approach: **Vector RAG + curated Legal Knowledge Graph + graph expansion at retrieval time.** Captures ~80% of full GraphRAG value at ~20% of the complexity.

### 1.1 Legal Knowledge Graph Construction (New)
Build a structured cross-reference graph for Pakistani law — semi-automated with LLM assistance + manual curation:

```python
# data/legal/legal_graph.json
{
  "nodes": [
    {
      "id": "contract_act_s10",
      "type": "provision",
      "act": "Contract Act 1872",
      "section": "10",
      "title": "What agreements are contracts",
      "domain_tags": ["contract", "formation", "validity"],
      "summary": "Defines essential elements of a valid contract..."
    }
  ],
  "edges": [
    {
      "from": "contract_act_s10",
      "to": "contract_act_s2",
      "relation": "references_definition"
    },
    {
      "from": "contract_act_s10",
      "to": "contract_act_s11",
      "relation": "related_to"  
    },
    {
      "from": "employment_ord_s14",
      "to": "labour_law_s35",
      "relation": "overridden_by"
    }
  ]
}
```

**Graph building workflow:**
1. Parse each Act into structured sections
2. Use Qwen2.5-72B to extract cross-references ("Section X references Section Y of Act Z")
3. Manually curate critical connections for MVP demo scenarios
4. Store as JSON (MVP) or Neo4j (Phase 2)

### 1.2 Document Chunking
- Parse legal texts into semantically meaningful chunks (section-level, article-level)
- Preserve rich metadata on every chunk:
  - `source`, `act_name`, `section_number`, `jurisdiction`, `chunk_type`
  - `domain_tags` (employment, contract, property, criminal, family, etc.)
  - `graph_node_id` — links chunk to the knowledge graph
  - `related_provisions` — pre-computed list from graph edges
- Chunk size: ~512 tokens with 64-token overlap
- Use custom legal structure parser (acts have predictable formatting)

### 1.3 Embedding & Vector Store
- **Embedding model:** `bge-m3` (BAAI) — open-source, best multilingual retrieval quality
- Self-hosted via `sentence-transformers` or `infinity-emb` for batch embedding
- **Vector DB:** Qdrant — excellent metadata filtering for graph-augmented queries
- Index all chunks with full metadata payload for filtered + graph-expanded retrieval

### 1.4 Hybrid Retrieval + Graph Expansion
```
User Query
    ↓
[1] Intent Detection (Qwen2.5-7B) → extract: legal_domain, jurisdiction, entities
    ↓
[2] Vector Search (bge-m3 embedding → Qdrant) → Top 10 candidates
    ↓
[3] BM25 Keyword Search → Top 10 candidates
    ↓
[4] Merge + Deduplicate
    ↓
[5] GRAPH EXPANSION: For each retrieved chunk's graph_node_id,
    pull connected provisions (1-hop neighbors) from legal_graph.json
    ↓
[6] Rerank all results (bge-reranker-v2-m3) → Top 5–8
    ↓
[7] Return grounded context + full citation chain + graph paths
```

**Key insight:** Graph expansion at step 5 catches cross-act connections that pure vector search misses. E.g., a query about "fired without notice" retrieves termination provisions AND automatically pulls in related wage/payment provisions via graph edges.

### 1.5 RAG Evaluation
- Build a small test set (20–30 Q&A pairs) covering citizen, student, lawyer queries
- Test scenarios that specifically require cross-act reasoning (graph expansion value)
- Measure: retrieval relevance, graph expansion hit rate, answer grounding
- Iterate on chunk size, graph density, retrieval strategy, reranking

**Deliverable:** Working graph-augmented RAG pipeline that retrieves connected Pakistani legal provisions across multiple acts for any query.

---

## Phase 2 — AI Agent Architecture (Day 2–3) ⭐ MVP Core

### 2.1 Agent Framework Selection
Evaluate and pick one:
- **LangGraph** (recommended) — best control flow for agentic systems, production-ready
- **CrewAI** — good for multi-agent but heavier
- **Custom** — most control, most work

### 2.2 Core Agent Design
```
User Query
    ↓
[Router Agent] → Detects: user_mode, intent, needs_document, needs_voice
    ↓
[Orchestrator] → Builds execution plan
    ↓
┌─────────────────────────────────┐
│  Tools available to agent:      │
│  • legal_search (RAG)           │
│  • analyze_document             │
│  • ask_followup_question        │
│  • detect_jurisdiction          │
│  • web_legal_search (optional)  │
└─────────────────────────────────┘
    ↓
[Response Generator] → Grounded response + citations + disclaimer
```

### 2.3 System Prompt Engineering
- **Master system prompt** with:
  - Role definition (legal AI assistant, NOT a lawyer)
  - User mode context (citizen/student/lawyer)
  - Mandatory citation format
  - Disclaimer rules
  - Follow-up question logic
  - Jurisdiction handling
  - Hallucination prevention instructions

### 2.4 LLM Configuration (Alibaba Qwen via DashScope)

**Primary LLM — Qwen2.5-72B-Instruct:**
- Used for: final response generation, document analysis, legal reasoning
- DashScope API endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- Supports OpenAI-compatible API format (easy integration with LangChain/LangGraph)
- Strong multilingual: English + Urdu understanding
- Native function/tool calling support
- Context window: 128K tokens
- Temperature: 0.1–0.3 for legal responses (accuracy over creativity)

**Fast LLM — Qwen2.5-7B-Instruct:**
- Used for: intent routing, query classification, entity extraction, follow-up question generation
- Lower latency, lower cost — ideal for lightweight agent decisions
- Same DashScope API

**Integration via LangChain:**
```python
from langchain_openai import ChatOpenAI  # DashScope is OpenAI-compatible

llm_primary = ChatOpenAI(
    model="qwen2.5-72b-instruct",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    temperature=0.2,
)

llm_fast = ChatOpenAI(
    model="qwen2.5-7b-instruct",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    temperature=0.1,
)
```

### 2.5 Conversation Memory
- Maintain conversation history per session
- Use a simple in-memory or Redis-backed store
- Context window management (summarize older messages if needed)

**Deliverable:** Working agent that routes queries, uses RAG tool, generates grounded responses with citations.

---

## Phase 3 — Backend API (Day 2–3, parallel with Phase 2)

### 3.1 FastAPI Application
```
POST /api/chat          # Send message, get agent response (streaming)
POST /api/chat/stream   # SSE streaming endpoint
POST /api/upload        # Upload legal document
GET  /api/documents     # List uploaded documents
GET  /api/document/{id} # Get document analysis
POST /api/voice/stt     # Speech-to-text
POST /api/voice/tts     # Text-to-speech
GET  /api/health        # Health check
```

### 3.2 Request/Response Schema
```python
class ChatRequest(BaseModel):
    message: str
    session_id: str
    user_mode: Literal["citizen", "student", "lawyer"]
    jurisdiction: Optional[str] = None
    document_ids: Optional[list[str]] = None

class ChatResponse(BaseModel):
    response: str
    citations: list[Citation]
    follow_up_questions: list[str]
    disclaimer: Optional[str]
    sources: list[Source]
```

### 3.3 Streaming
- Implement SSE (Server-Sent Events) for real-time response streaming
- Stream token-by-token from LLM to frontend

### 3.4 File Upload & Processing
- Accept PDF, DOCX, images
- Extract text: `PyMuPDF` for PDF, `python-docx` for DOCX, `pytesseract`/`paddleocr` for OCR
- Store uploads in local filesystem (S3 for production)
- Return extracted text + basic analysis

### 3.5 Authentication (Minimal MVP)
- Simple session-based or API key auth for hackathon demo
- User mode selection (citizen/student/lawyer)

**Deliverable:** Fully functional API with streaming chat, file upload, and document analysis.

---

## Phase 4 — Frontend Web Application (Day 3–4)

### 4.1 Next.js Application
- **App Router** with TypeScript
- **Tailwind CSS** + **shadcn/ui** for rapid, polished UI
- Responsive design (mobile-ready even without native app)

### 4.2 Core Pages/Components
```
/                       # Landing page with mode selection
/chat                   # Main chat interface
/chat/[session]         # Chat session with history
/documents              # Document upload & management
/documents/[id]         # Document analysis view
```

### 4.3 Chat Interface
- Message bubbles (user + ADVO)
- Streaming response display (typewriter effect)
- Citation cards (collapsible, showing source act/section)
- Follow-up question chips
- Document upload within chat (drag & drop)
- Voice input button (hold-to-record)
- Disclaimer banner
- Mode indicator (Citizen/Student/Lawyer toggle)

### 4.4 Document Interface
- Drag-and-drop upload
- Processing status indicator
- Extracted text viewer
- AI summary + key clauses
- Ask questions about the document

### 4.5 State Management
- Zustand or React Context for session state
- API client with streaming support (EventSource or fetch + ReadableStream)

**Deliverable:** Polished, responsive web UI connected to the backend.

---

## Phase 5 — Voice Pipeline (Day 4–5) — Alibaba Voice Models

### 5.1 Speech-to-Text (STT) — Alibaba Paraformer
- **Model:** Alibaba Paraformer-v2 via DashScope API
- **Why:** High-accuracy ASR, multilingual support, real-time streaming capable
- **DashScope endpoint:** `wss://dashscope.aliyuncs.com/api/v1/services/audio/asr`
- **Languages:** English primary; Urdu/Roman Urdu support to be validated early
- **Fallback:** Alibaba SenseVoice (also via DashScope) — includes emotion detection and audio event understanding, useful for understanding user frustration/distress in legal queries
- **Frontend:** Record audio via browser `MediaRecorder` API → send to `/api/voice/stt`

```python
# DashScope Paraformer STT integration
import dashscope
from dashscope.audio.asr import Recognition

recognition = Recognition(
    model='paraformer-v2',
    format='wav',
    sample_rate=16000,
    callback=recognition_callback
)
```

### 5.2 Text-to-Speech (TTS) — Alibaba CosyVoice
- **Model:** Alibaba CosyVoice via DashScope API
- **Why:** Natural-sounding multilingual synthesis, streaming output, multiple voice options
- **DashScope endpoint:** streaming TTS API
- **Voice selection:** Pick a professional, clear voice suitable for legal context
- **Language matching:** Respond in same language as user's query (English → English voice, Urdu → Urdu voice)
- **Streaming:** CosyVoice supports streaming TTS — begin playback before full response is generated

```python
# DashScope CosyVoice TTS integration
from dashscope.audio.tts_v2 import SpeechSynthesizer

synthesizer = SpeechSynthesizer(
    model='cosyvoice-v1',
    voice='longxiaochun',  # select appropriate voice
    callback=tts_callback
)
audio = synthesizer.call(response_text)
```

### 5.3 Voice UX
- Microphone button in chat input
- Visual feedback (recording indicator, waveform visualization)
- Full pipeline: **User speaks → Paraformer STT → transcribed text → ADVO agent → CosyVoice TTS → audio playback**
- Auto-transcribe → auto-send → auto-play flow
- Toggle for voice auto-play (on/off)

**Deliverable:** Full voice input/output loop using Alibaba voice models, working in the web app.

---

## Phase 6 — Polish, Safety & Demo Prep (Day 5–6)

### 6.1 Legal Safety
- Mandatory disclaimer on every response
- Confidence indicators (high/medium/low)
- "Consult a lawyer" prompts for high-risk queries
- Refuse to fabricate citations (strict instruction + verification step)
- Jurisdiction confirmation flow

### 6.2 Hallucination Reduction
- Citation verification: check that cited sections actually exist in retrieved chunks
- Groundedness check: verify claims map to retrieved context
- Temperature: low (0.1–0.3) for legal responses

### 6.3 UX Polish
- Loading states and skeleton screens
- Error handling with user-friendly messages
- Onboarding flow explaining the three modes
- Example queries per mode
- Session history sidebar

### 6.4 Demo Script Preparation
Prepare 5–6 compelling demo scenarios:
1. **Citizen (Urdu voice):** Landlord dispute → voice query → RAG retrieval → plain-language response with citations
2. **Citizen (English text):** Employment termination → follow-up questions → rights explanation
3. **Student:** Contract law concept explanation → examples → follow-up quiz question
4. **Lawyer:** Upload a contract → summarize → identify relevant provisions
5. **Cross-mode:** Same query, different depth based on mode switch
6. **Edge case:** Jurisdiction-sensitive query → system asks for clarification

**Deliverable:** Demo-ready MVP with polished UX, safety guardrails, and rehearsed demo flow.

---

## Phase 7 — Mobile Application (Phase 2 / MVP Stretch)

### 7.1 Expo + React Native
- Share types/logic with web where possible
- Native voice recording (better than browser)
- Push notifications (future)
- Same API backend

### 7.2 Priority
Only start if web MVP is solid. A polished web app > a rough mobile app for hackathon demos.

---

## Phase 8 — Post-Hackathon / Future

| Feature | Priority |
|---|---|
| Full Microsoft GraphRAG (auto-extracted entities, community summaries) | Phase 2 |
| Multi-jurisdiction support (UAE, UK, etc.) | Phase 2 |
| User accounts & saved history | Phase 2 |
| Advanced document analysis (clause extraction, risk scoring) | Phase 2 |
| Legal precedent / case law search | Phase 2 |
| Neo4j graph DB (replace JSON graph) | Phase 2 |
| DashScope fine-tuning on legal domain | Phase 2 |
| Drafting assistance (legal notices, applications) | Future |
| Lawyer directory / referral integration | Future |
| Court deadline tracking | Future |
| Multi-language expansion beyond English/Urdu | Future |
| Evaluation pipeline (automated RAG quality testing) | Phase 2 |
| Monitoring & observability (LangSmith, Langfuse) | Phase 2 |

---

## Critical Path Summary

```
Day 1:  Project setup + Legal data collection + Knowledge graph construction + Chunking
Day 2:  Graph-augmented RAG pipeline complete + Agent architecture (Qwen2.5) start
Day 3:  Agent working + Backend API + Frontend start
Day 4:  Frontend chat connected + Voice pipeline (Paraformer + CosyVoice)
Day 5:  Voice complete + Document upload + Polish
Day 6:  Safety + Demo prep + Rehearsal
```

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Qwen2.5-72B latency too high for live demo | High | Use 7B for routing; pre-warm connections; stream tokens; fallback to 32B |
| Paraformer STT poor Urdu accuracy | Medium | Test Urdu early on Day 1; fallback to text input in demo |
| CosyVoice no good Urdu voice | Medium | Use English voice + transliterated text; validate Day 4 |
| Graph too sparse for cross-act queries | Medium | Manually curate graph edges for all 6 demo scenarios |
| DashScope API rate limits during demo | Low | Cache common queries; pre-generate demo responses as fallback |
| RTX 1070 VRAM pressure if running both models simultaneously | Low | Load models sequentially; or move reranker to CPU (~1s latency, acceptable) |
| Docker Desktop not installed on RTX 1070 laptop | Low | Install Docker Desktop + WSL2 before Day 1 |
| CUDA compatibility issues with bge-m3 | Low | Use `torch` with CUDA 11.8/12.1; fallback to CPU embedding (slower but works) |
