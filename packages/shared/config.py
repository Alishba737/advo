"""ADVO Shared Configuration — adapts to local or Docker environment."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PACKAGES_ROOT = PROJECT_ROOT / "packages"
DATA_ROOT = PROJECT_ROOT / "data"


@dataclass
class DashScopeConfig:
    api_key: str = field(default_factory=lambda: os.getenv("DASHSCOPE_API_KEY", ""))
    base_url: str = field(
        default_factory=lambda: os.getenv(
            "DASHSCOPE_BASE_URL",
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
    )
    embedding_model: str = field(
        default_factory=lambda: os.getenv("DASHSCOPE_EMBEDDING_MODEL", "text-embedding-v3")
    )


@dataclass
class QdrantConfig:
    """If QDRANT_URL is set, connect to Docker Qdrant. Otherwise use in-memory."""

    url: str | None = field(default_factory=lambda: os.getenv("QDRANT_URL"))
    api_key: str | None = field(default_factory=lambda: os.getenv("QDRANT_API_KEY"))
    collection_name: str = "advo_legal"
    vector_size: int = 1024  # bge-m3 and text-embedding-v3 both output 1024 dims

    @property
    def use_memory(self) -> bool:
        return self.url is None


@dataclass
class RAGConfig:
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k_candidates: int = 10
    top_k_final: int = 6
    graph_expansion_hops: int = 1
    rerank_enabled: bool = True
    bm25_weight: float = 0.3
    vector_weight: float = 0.7


@dataclass
class AppConfig:
    dashscope: DashScopeConfig = field(default_factory=DashScopeConfig)
    qdrant: QdrantConfig = field(default_factory=QdrantConfig)
    rag: RAGConfig = field(default_factory=RAGConfig)
    device: str = field(default_factory=lambda: os.getenv("DEVICE", "cpu"))
    legal_data_dir: Path = DATA_ROOT / "legal"
    graph_path: Path = DATA_ROOT / "legal" / "legal_graph.json"

    def validate(self) -> list[str]:
        """Return list of missing configuration."""
        issues = []
        if not self.dashscope.api_key:
            issues.append("DASHSCOPE_API_KEY not set in .env")
        return issues


cfg = AppConfig()
