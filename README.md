# ADVO — AI-Powered Legal Assistant & Agent

An AI-powered legal technology platform for legal assistance, education, research, and guidance.

## Features (MVP)

- **Legal RAG** — Graph-augmented retrieval from Pakistani legal corpus
- **AI Agent** — Qwen2.5-powered agentic system with tool-calling
- **Three Modes** — Citizen, Student, Lawyer
- **Voice** — Speech input (Paraformer) and output (CosyVoice)
- **Document Analysis** — Upload, extract, analyze legal documents
- **Citations** — Every response grounded in legal sources

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | Qwen2.5-72B / 7B (DashScope API) |
| Embeddings | bge-m3 (local GPU) |
| Vector DB | Qdrant (local Docker) |
| STT | Paraformer-v2 (DashScope) |
| TTS | CosyVoice (DashScope) |
| Backend | Python + FastAPI |
| Frontend | Next.js + Tailwind + shadcn/ui |
| Agent | LangGraph |

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Alishba737/advo.git
cd advo

# 2. Environment
cp .env.example .env
# Edit .env with your DashScope API key

# 3. Start local services
docker compose up -d

# 4. Install dependencies
pip install -r requirements.txt

# 5. Run
# (instructions added as packages are built)
```

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
- NVIDIA GPU with CUDA (for local embeddings)
- DashScope API key (Alibaba Cloud)
