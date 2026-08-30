"""ADVO API — FastAPI application startup and dependency injection."""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure project root is in path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from contextlib import asynccontextmanager
from fastapi import FastAPI

from packages.shared.config import cfg


# Global references — initialized on startup
agent = None
retriever = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize RAG pipeline and agent on startup."""
    global agent, retriever

    print("=" * 60)
    print("ADVO API — Starting up...")
    print("=" * 60)

    issues = cfg.validate()
    if issues:
        print("Configuration issues:")
        for issue in issues:
            print(f"  ✗ {issue}")
        print("Agent will not be available until issues are resolved.")
        yield
        return

    try:
        # Initialize RAG pipeline
        from packages.rag.chunker import load_and_parse_directory
        from packages.rag.graph import KnowledgeGraph, build_graph_from_chunks_and_llm
        from packages.rag.embeddings import create_embedder
        from packages.rag.vector_store import VectorStore
        from packages.rag.retriever import Retriever

        print("\n[1/4] Parsing legal documents...")
        chunks = load_and_parse_directory(
            cfg.legal_data_dir,
            chunk_size=cfg.rag.chunk_size,
            chunk_overlap=cfg.rag.chunk_overlap,
        )

        if not chunks:
            print("  No chunks found. Add legal texts to data/legal/ and restart.")
            yield
            return

        print("\n[2/4] Loading knowledge graph...")
        kg = KnowledgeGraph()
        if cfg.graph_path.exists():
            kg.load(cfg.graph_path)
        else:
            kg = build_graph_from_chunks_and_llm(chunks, cfg.graph_path)

        print("\n[3/4] Building vector store...")
        embedder = create_embedder()
        texts = [c.text for c in chunks]
        embeddings = embedder.embed(texts)
        cfg.qdrant.vector_size = len(embeddings[0])
        vs = VectorStore()
        vs.upsert_chunks(chunks, embeddings)

        retriever = Retriever(embedder, vs, kg)
        retriever.build_bm25_index(chunks)

        print("\n[4/4] Initializing ADVO agent...")
        from packages.agent.graph import AdvoAgent
        agent = AdvoAgent(retriever=retriever, knowledge_graph=kg)

        print("\n✓ ADVO is ready!")
        print(f"  Chunks: {len(chunks)}")
        print(f"  Graph nodes: {len(kg.graph.nodes)}, edges: {len(kg.graph.edges)}")
        print(f"  Vectors indexed: {vs.collection_info()['points_count']}")

    except Exception as e:
        print(f"\n✗ Startup error: {e}")
        print("  Agent will not be available. Fix the issue and restart.")

    yield

    print("\nADVO API — Shutting down...")


def get_agent():
    """Dependency: get the initialized agent."""
    if agent is None:
        raise RuntimeError("Agent not initialized. Check startup logs.")
    return agent


def get_retriever():
    """Dependency: get the initialized retriever."""
    if retriever is None:
        raise RuntimeError("Retriever not initialized. Check startup logs.")
    return retriever


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    from packages.api.routes import router

    app = FastAPI(
        title="ADVO API",
        description="AI-Powered Legal Assistant & Agent",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.include_router(router, prefix="/api")

    # CORS for Next.js frontend
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:3001"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


app = create_app()
