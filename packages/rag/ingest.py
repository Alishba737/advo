"""Ingestion script — parses legal texts, builds graph, embeds, and indexes into Qdrant."""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from packages.shared.config import cfg
from packages.shared.models import LegalChunk
from packages.rag.chunker import load_and_parse_directory
from packages.rag.graph import build_graph_from_chunks_and_llm, KnowledgeGraph
from packages.rag.embeddings import create_embedder
from packages.rag.vector_store import VectorStore


def main():
    print("=" * 60)
    print("ADVO Legal RAG — Ingestion Pipeline")
    print("=" * 60)

    # Check configuration
    issues = cfg.validate()
    if issues:
        print("\nConfiguration issues:")
        for issue in issues:
            print(f"  ✗ {issue}")
        print("\nPlease set DASHSCOPE_API_KEY in your .env file.")
        sys.exit(1)

    # Step 1: Parse legal documents
    print("\n[1/5] Parsing legal documents...")
    legal_dir = cfg.legal_data_dir
    txt_files = list(legal_dir.glob("*.txt"))
    if not txt_files:
        print(f"  No .txt files found in {legal_dir}")
        print("  Add Pakistani legal texts as .txt files and re-run.")
        sys.exit(1)

    chunks = load_and_parse_directory(
        legal_dir,
        chunk_size=cfg.rag.chunk_size,
        chunk_overlap=cfg.rag.chunk_overlap,
    )
    print(f"  Total chunks: {len(chunks)}")

    if not chunks:
        print("  No chunks generated. Check your legal text files.")
        sys.exit(1)

    # Step 2: Build knowledge graph
    print("\n[2/5] Building legal knowledge graph...")
    graph_path = cfg.graph_path
    kg = build_graph_from_chunks_and_llm(chunks, graph_path)

    # Step 3: Generate embeddings
    print("\n[3/5] Generating embeddings...")
    embedder = create_embedder()
    texts = [c.text for c in chunks]
    embeddings = embedder.embed(texts)
    print(f"  Generated {len(embeddings)} embeddings (dim={len(embeddings[0])})")

    # Step 4: Index into Qdrant
    print("\n[4/5] Indexing into Qdrant...")
    # Update vector size based on actual embedding dimensions
    cfg.qdrant.vector_size = len(embeddings[0])
    vs = VectorStore()
    vs.upsert_chunks(chunks, embeddings)
    info = vs.collection_info()
    print(f"  Collection stats: {info}")

    # Step 5: Summary
    print("\n[5/5] Ingestion complete!")
    print(f"  Legal texts parsed: {len(txt_files)} files")
    print(f"  Total chunks: {len(chunks)}")
    print(f"  Graph nodes: {len(kg.graph.nodes)}")
    print(f"  Graph edges: {len(kg.graph.edges)}")
    print(f"  Vectors indexed: {info['points_count']}")
    print(f"\n  Ready for retrieval!")


if __name__ == "__main__":
    main()
