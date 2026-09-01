"""Qdrant vector store — supports Docker Qdrant and in-memory mode."""

from __future__ import annotations

from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    FilterSelector,
)

from packages.shared.config import cfg
from packages.shared.models import LegalChunk


class VectorStore:
    """Qdrant-backed vector store for legal chunks."""

    def __init__(self) -> None:
        if cfg.qdrant.use_memory:
            print("  Qdrant: using in-memory mode (no Docker)")
            self.client = QdrantClient(":memory:")
        else:
            print(f"  Qdrant: connecting to {cfg.qdrant.url}")
            self.client = QdrantClient(
                url=cfg.qdrant.url,
                api_key=cfg.qdrant.api_key,
            )

        self.collection = cfg.qdrant.collection_name
        self.vector_size = cfg.qdrant.vector_size
        self._ensure_collection()

    def _ensure_collection(self) -> None:
        """Create collection if it doesn't exist."""
        collections = [c.name for c in self.client.get_collections().collections]
        if self.collection not in collections:
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE,
                ),
            )
            print(f"  Created collection '{self.collection}' (dim={self.vector_size})")

    def upsert_chunks(
        self,
        chunks: list[LegalChunk],
        embeddings: list[list[float]],
    ) -> int:
        """Insert chunks with their embeddings into Qdrant."""
        assert len(chunks) == len(embeddings), "Chunks and embeddings must match"

        points = []
        for chunk, vector in zip(chunks, embeddings):
            points.append(
                PointStruct(
                    id=hash(chunk.id) & 0xFFFFFFFF,  # Qdrant needs unsigned int IDs
                    vector=vector,
                    payload={
                        "chunk_id": chunk.id,
                        "text": chunk.text,
                        "act_name": chunk.act_name,
                        "section_number": chunk.section_number,
                        "jurisdiction": chunk.jurisdiction,
                        "chunk_type": chunk.chunk_type,
                        "domain_tags": chunk.domain_tags,
                        "graph_node_id": chunk.graph_node_id,
                        "source_file": chunk.source_file,
                    },
                )
            )

        # Batch upsert
        batch_size = 100
        inserted = 0
        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            self.client.upsert(collection_name=self.collection, points=batch)
            inserted += len(batch)

        print(f"  Upserted {inserted} chunks into Qdrant")
        return inserted

    def search(
        self,
        query_vector: list[float],
        top_k: int = 10,
        domain_filter: list[str] | None = None,
        act_filter: str | None = None,
    ) -> list[dict]:
        """Search for similar chunks by vector similarity."""
        query_filter = None
        conditions = []

        if domain_filter:
            # Match any of the domain tags
            for domain in domain_filter:
                conditions.append(
                    FieldCondition(
                        key="domain_tags",
                        match=MatchValue(value=domain),
                    )
                )

        if act_filter:
            conditions.append(
                FieldCondition(
                    key="act_name",
                    match=MatchValue(value=act_filter),
                )
            )

        if conditions:
            query_filter = Filter(should=conditions if len(conditions) > 1 else conditions)

        results = self.client.query_points(
            collection_name=self.collection,
            query=query_vector,
            limit=top_k,
            query_filter=query_filter,
        ).points

        return [
            {
                "chunk_id": r.payload.get("chunk_id"),
                "text": r.payload.get("text"),
                "act_name": r.payload.get("act_name"),
                "section_number": r.payload.get("section_number"),
                "jurisdiction": r.payload.get("jurisdiction"),
                "chunk_type": r.payload.get("chunk_type"),
                "domain_tags": r.payload.get("domain_tags", []),
                "graph_node_id": r.payload.get("graph_node_id"),
                "source_file": r.payload.get("source_file"),
                "score": r.score,
            }
            for r in results
        ]

    def get_by_graph_node_id(self, node_id: str) -> list[dict]:
        """Retrieve all chunks linked to a specific graph node."""
        results = self.client.scroll(
            collection_name=self.collection,
            scroll_filter=Filter(
                must=[
                    FieldCondition(
                        key="graph_node_id",
                        match=MatchValue(value=node_id),
                    )
                ]
            ),
            limit=10,
        )

        return [
            {
                "chunk_id": r.payload.get("chunk_id"),
                "text": r.payload.get("text"),
                "act_name": r.payload.get("act_name"),
                "section_number": r.payload.get("section_number"),
                "domain_tags": r.payload.get("domain_tags", []),
                "graph_node_id": r.payload.get("graph_node_id"),
            }
            for r in results[0]
        ]

    def collection_info(self) -> dict:
        """Get collection stats."""
        info = self.client.get_collection(self.collection)
        return {
            "name": self.collection,
            "points_count": info.points_count,
            "status": info.status.value,
        }
