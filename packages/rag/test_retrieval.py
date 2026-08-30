"""Test retrieval — runs sample queries against the RAG pipeline."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from packages.shared.config import cfg
from packages.rag.chunker import load_and_parse_directory
from packages.rag.graph import KnowledgeGraph, build_graph_from_chunks_and_llm
from packages.rag.embeddings import create_embedder
from packages.rag.vector_store import VectorStore
from packages.rag.retriever import Retriever


# Test queries covering different domains and user modes
TEST_QUERIES = [
    # Citizen mode
    "What makes a contract valid in Pakistan?",
    "Someone forced me to sign a contract. Is it valid?",
    "What happens if someone breaks a contract? Can I get compensation?",
    # Student mode
    "Explain the difference between void and voidable contracts",
    "What is free consent? Define coercion and undue influence",
    "Explain the doctrine of consideration with examples",
    # Lawyer mode
    "What are the requirements for compensation under Section 73 of the Contract Act?",
    "Analyze Section 16 regarding undue influence and fiduciary relationships",
]


def main():
    print("=" * 60)
    print("ADVO Legal RAG — Retrieval Test")
    print("=" * 60)

    issues = cfg.validate()
    if issues:
        print("\nConfiguration issues:")
        for issue in issues:
            print(f"  ✗ {issue}")
        sys.exit(1)

    # Step 1: Parse documents (in-memory for test)
    print("\n[1/4] Parsing legal documents...")
    chunks = load_and_parse_directory(
        cfg.legal_data_dir,
        chunk_size=cfg.rag.chunk_size,
        chunk_overlap=cfg.rag.chunk_overlap,
    )
    print(f"  Total chunks: {len(chunks)}")

    # Step 2: Load or build graph
    print("\n[2/4] Loading knowledge graph...")
    kg = KnowledgeGraph()
    if cfg.graph_path.exists():
        kg.load(cfg.graph_path)
    else:
        print("  Graph not found, building from chunks...")
        kg = build_graph_from_chunks_and_llm(chunks, cfg.graph_path)

    # Step 3: Build embeddings and vector store
    print("\n[3/4] Building vector store...")
    embedder = create_embedder()
    texts = [c.text for c in chunks]
    embeddings = embedder.embed(texts)
    cfg.qdrant.vector_size = len(embeddings[0])
    vs = VectorStore()
    vs.upsert_chunks(chunks, embeddings)

    # Step 4: Build retriever and test queries
    print("\n[4/4] Testing retrieval...\n")
    retriever = Retriever(embedder, vs, kg)
    retriever.build_bm25_index(chunks)

    print("-" * 60)
    for query in TEST_QUERIES:
        print(f"\nQuery: \"{query}\"")
        print("-" * 40)

        results = retriever.retrieve(query, top_k=4)

        for i, result in enumerate(results, 1):
            source_badge = {
                "vector": "VEC",
                "bm25": "BM25",
                "graph_expansion": "GRAPH",
            }.get(result.source, result.source.upper())

            print(f"\n  [{i}] [{source_badge}] Score: {result.score:.3f}")
            print(f"      Act: {result.chunk.act_name}" +
                  (f", Section {result.chunk.section_number}" if result.chunk.section_number else ""))
            print(f"      Tags: {result.chunk.domain_tags}")
            if result.graph_path:
                print(f"      Graph: {' → '.join(result.graph_path)}")
            # Show first 120 chars of text
            snippet = result.chunk.text[:120].replace("\n", " ")
            print(f"      Text: {snippet}...")

        print("-" * 60)

    print("\nRetrieval test complete!")


if __name__ == "__main__":
    main()
