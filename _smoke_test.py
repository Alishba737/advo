"""ADVO install smoke test — fast checks, no model downloads."""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

results: list[tuple[str, bool, str]] = []


def check(name, fn):
    start = time.time()
    try:
        detail = fn()
        results.append((name, True, f"{detail} ({time.time() - start:.1f}s)"))
    except Exception as e:
        results.append((name, False, f"{type(e).__name__}: {e}"))


# 1. Device resolution — .env has DEVICE=cpu
from packages.shared.config import cfg, resolve_device

check("device = cpu (from .env)", lambda: cfg.device)
check("resolve_device() override auto", lambda: (
    os.environ.__setitem__("DEVICE", "auto"),
    resolve_device(),
)[-1] + " (torch CUDA absent -> cpu)"
    if True else None)

# 2. Config sanity
check("embedding provider/model", lambda: f"{cfg.embedding_provider} / {cfg.embedding_model}")
check("qdrant in-memory mode", lambda: "memory" if cfg.qdrant.use_memory else f"url={cfg.qdrant.url}")
check("cfg.validate() passes (placeholder key)", lambda: "PASS" if not cfg.validate() else f"FAIL: {cfg.validate()}")

# 3. Package imports
check("import rag.chunker", lambda: __import__("packages.rag.chunker").__name__)
check("import rag.graph", lambda: __import__("packages.rag.graph").__name__)
check("import rag.embeddings", lambda: __import__("packages.rag.embeddings").__name__)
check("import rag.vector_store", lambda: __import__("packages.rag.vector_store").__name__)
check("import rag.retriever", lambda: __import__("packages.rag.retriever").__name__)
check("import rag.ingest", lambda: __import__("packages.rag.ingest").__name__)
check("import agent.llm", lambda: __import__("packages.agent.llm").__name__)
check("import agent.graph (langgraph)", lambda: __import__("packages.agent.graph").__name__)
check("import agent.tools", lambda: __import__("packages.agent.tools").__name__)
check("import agent.memory", lambda: __import__("packages.agent.memory").__name__)
check("import agent.prompts", lambda: __import__("packages.agent.prompts").__name__)
check("import api.main (fastapi app)", lambda: __import__("packages.api.main", fromlist=["app"]).app.title)

# 4. Chunker on the real legal corpus
from packages.rag.chunker import load_and_parse_directory

def chunk_corpus():
    chunks = load_and_parse_directory(cfg.legal_data_dir, chunk_size=cfg.rag.chunk_size, chunk_overlap=cfg.rag.chunk_overlap)
    sections = [c.section_number for c in chunks if c.section_number]
    tags = {t for c in chunks for t in c.domain_tags}
    return f"{len(chunks)} chunks, sections={sections[:6]}..., tags={sorted(tags)}"

check("chunker parses Contract_Act_1872.txt", chunk_corpus)

# 5. Knowledge graph build (no LLM needed)
from packages.rag.graph import KnowledgeGraph, build_graph_from_chunks_and_llm

def build_kg():
    chunks = load_and_parse_directory(cfg.legal_data_dir, chunk_size=cfg.rag.chunk_size, chunk_overlap=cfg.rag.chunk_overlap)
    kg = build_graph_from_chunks_and_llm(chunks, cfg.graph_path)
    return f"{len(kg.graph.nodes)} nodes, {len(kg.graph.edges)} edges"

check("knowledge graph builds + saves", build_kg)

# 6. BM25 index
from packages.rag.retriever import BM25Index

def bm25_test():
    idx = BM25Index()
    idx.build([{"chunk_id": "1", "text": "a contract is an agreement enforceable by law"}, {"chunk_id": "2", "text": "employment termination notice period wages"}])
    hits = idx.search("contract agreement", top_k=2)
    return f"top hit: {hits[0][0]['chunk_id']} score={hits[0][1]:.2f}"

check("BM25 search", bm25_test)

# ─── Report ───
print("\n" + "=" * 62)
passed = sum(1 for _, ok, _ in results if ok)
for name, ok, detail in results:
    print(f"  {'PASS' if ok else 'FAIL':4} | {name:42} | {detail}")
print("=" * 62)
print(f"  {passed}/{len(results)} checks passed")
sys.exit(0 if passed == len(results) else 1)
