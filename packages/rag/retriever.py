"""Hybrid retriever — vector search + BM25 + graph expansion + reranking."""

from __future__ import annotations

import math
from collections import defaultdict

from packages.shared.config import cfg
from packages.shared.models import LegalChunk, RetrievalResult
from packages.rag.embeddings import Embedder
from packages.rag.vector_store import VectorStore
from packages.rag.graph import KnowledgeGraph


class BM25Index:
    """Simple BM25 keyword index for legal texts."""

    def __init__(self, k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b
        self.docs: list[dict] = []
        self.doc_freqs: dict[str, int] = defaultdict(int)
        self.avg_dl: float = 0
        self._built = False

    def build(self, documents: list[dict]) -> None:
        """Build index from list of {chunk_id, text, ...} dicts."""
        self.docs = documents
        total_len = 0

        for doc in documents:
            tokens = self._tokenize(doc["text"])
            doc["_tokens"] = tokens
            doc["_term_freq"] = defaultdict(int)
            unique_terms = set()
            for token in tokens:
                doc["_term_freq"][token] += 1
                unique_terms.add(token)
            for term in unique_terms:
                self.doc_freqs[term] += 1
            total_len += len(tokens)

        self.avg_dl = total_len / max(len(documents), 1)
        self._built = True

    def search(self, query: str, top_k: int = 10) -> list[tuple[dict, float]]:
        """Search BM25 index, return top_k results with scores."""
        if not self._built:
            return []

        query_tokens = self._tokenize(query)
        n = len(self.docs)
        scores: list[tuple[int, float]] = []

        for idx, doc in enumerate(self.docs):
            score = 0.0
            dl = len(doc["_tokens"])
            for term in query_tokens:
                tf = doc["_term_freq"].get(term, 0)
                if tf == 0:
                    continue
                df = self.doc_freqs.get(term, 0)
                idf = math.log((n - df + 0.5) / (df + 0.5) + 1)
                tf_norm = (tf * (self.k1 + 1)) / (
                    tf + self.k1 * (1 - self.b + self.b * dl / self.avg_dl)
                )
                score += idf * tf_norm
            if score > 0:
                scores.append((idx, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return [(self.docs[idx], score) for idx, score in scores[:top_k]]

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Simple whitespace + lowercase tokenization."""
        return text.lower().split()


class Retriever:
    """Hybrid retriever combining vector search, BM25, and graph expansion."""

    def __init__(
        self,
        embedder: Embedder,
        vector_store: VectorStore,
        knowledge_graph: KnowledgeGraph,
    ) -> None:
        self.embedder = embedder
        self.vs = vector_store
        self.kg = knowledge_graph
        self.bm25 = BM25Index()
        self._bm25_docs: list[dict] = []

    def build_bm25_index(self, chunks: list[LegalChunk]) -> None:
        """Build BM25 index from chunks (call after ingestion)."""
        self._bm25_docs = [
            {"chunk_id": c.id, "text": c.text, "act_name": c.act_name,
             "section_number": c.section_number, "graph_node_id": c.graph_node_id}
            for c in chunks
        ]
        self.bm25.build(self._bm25_docs)
        print(f"  BM25 index built with {len(self._bm25_docs)} documents")

    def retrieve(
        self,
        query: str,
        top_k: int | None = None,
        domain_filter: list[str] | None = None,
    ) -> list[RetrievalResult]:
        """Full retrieval pipeline:
        1. Vector search
        2. BM25 keyword search
        3. Merge + deduplicate
        4. Graph expansion
        5. Score fusion + final ranking
        """
        top_k = top_k or cfg.rag.top_k_final
        candidates: dict[str, RetrievalResult] = {}

        # --- Step 1: Vector Search ---
        query_vector = self.embedder.embed_query(query)
        vector_results = self.vs.search(
            query_vector,
            top_k=cfg.rag.top_k_candidates,
            domain_filter=domain_filter,
        )
        for r in vector_results:
            chunk = self._dict_to_chunk(r)
            candidates[r["chunk_id"]] = RetrievalResult(
                chunk=chunk,
                score=r["score"] * cfg.rag.vector_weight,
                source="vector",
            )

        # --- Step 2: BM25 Search ---
        bm25_results = self.bm25.search(query, top_k=cfg.rag.top_k_candidates)
        for doc, score in bm25_results:
            cid = doc["chunk_id"]
            # Normalize BM25 score to 0-1 range
            norm_score = min(score / 10.0, 1.0)
            if cid in candidates:
                candidates[cid].score += norm_score * cfg.rag.bm25_weight
            else:
                candidates[cid] = RetrievalResult(
                    chunk=LegalChunk(
                        id=cid,
                        text=doc["text"],
                        act_name=doc["act_name"],
                        section_number=doc.get("section_number"),
                        graph_node_id=doc.get("graph_node_id"),
                    ),
                    score=norm_score * cfg.rag.bm25_weight,
                    source="bm25",
                )

        # --- Step 3: Graph Expansion ---
        expanded: dict[str, RetrievalResult] = {}
        for cid, result in candidates.items():
            node_id = result.chunk.graph_node_id
            if not node_id:
                continue

            neighbors = self.kg.get_neighbors(
                node_id, hops=cfg.rag.graph_expansion_hops
            )
            for neighbor_node, relation_path, distance in neighbors:
                # Fetch chunks for this graph node from vector store
                neighbor_chunks = self.vs.get_by_graph_node_id(neighbor_node.id)
                for nc in neighbor_chunks:
                    nc_id = nc["chunk_id"]
                    if nc_id not in candidates and nc_id not in expanded:
                        expanded[nc_id] = RetrievalResult(
                            chunk=self._dict_to_chunk(nc),
                            score=0.3 / distance,  # Decay by distance
                            source="graph_expansion",
                            graph_path=[node_id, relation_path, neighbor_node.id],
                        )

        # Merge expanded results
        candidates.update(expanded)

        # --- Step 4: Final Ranking ---
        ranked = sorted(candidates.values(), key=lambda r: r.score, reverse=True)
        return ranked[:top_k]

    @staticmethod
    def _dict_to_chunk(d: dict) -> LegalChunk:
        return LegalChunk(
            id=d.get("chunk_id", ""),
            text=d.get("text", ""),
            act_name=d.get("act_name", ""),
            section_number=d.get("section_number"),
            jurisdiction=d.get("jurisdiction", "Pakistan"),
            domain_tags=d.get("domain_tags", []),
            graph_node_id=d.get("graph_node_id"),
            source_file=d.get("source_file"),
        )
