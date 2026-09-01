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
    primary_model: str = field(
        default_factory=lambda: os.getenv("DASHSCOPE_PRIMARY_MODEL", "qwen3.8-max")
    )
    fast_model: str = field(
        default_factory=lambda: os.getenv("DASHSCOPE_FAST_MODEL", "qwen3.8-flash")
    )


@dataclass
class VoiceConfig:
    """Voice I/O settings — all models served by the DashScope workspace endpoint.

    STT uses the realtime WebSocket (wss://…/api-ws/v1/realtime?model=…);
    TTS uses the native multimodal-generation HTTP API.
    """

    asr_model: str = field(
        default_factory=lambda: os.getenv("VOICE_ASR_MODEL", "qwen3-asr-flash-realtime")
    )
    asr_transcription_model: str = field(
        default_factory=lambda: os.getenv("VOICE_ASR_TRANSCRIPTION_MODEL", "qwen3-asr-flash")
    )
    tts_model: str = field(
        default_factory=lambda: os.getenv("VOICE_TTS_MODEL", "qwen3-tts-flash")
    )
    tts_voice: str = field(
        default_factory=lambda: os.getenv("VOICE_TTS_VOICE", "Cherry")
    )
    sample_rate: int = 16000

    @property
    def realtime_ws_url(self) -> str:
        """wss realtime endpoint derived from the DashScope base URL.

        https://ws-….ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
          -> wss://ws-….ap-southeast-1.maas.aliyuncs.com/api-ws/v1/realtime
        """
        host = cfg.dashscope.base_url.split("/compatible-mode")[0].replace("https://", "")
        return f"wss://{host}/api-ws/v1/realtime"

    @property
    def native_http_url(self) -> str:
        """Native DashScope API base (…/api/v1) derived from the base URL."""
        return cfg.dashscope.base_url.split("/compatible-mode")[0] + "/api/v1"


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


def resolve_device() -> str:
    """Resolve the compute device for local models.

    DEVICE env var:
      - "auto" (default) → CUDA GPU if torch + CUDA available, else CPU
      - "cuda" / "gpu"   → GPU, but falls back to CPU if unavailable
      - "cpu"            → always CPU
    """
    requested = os.getenv("DEVICE", "auto").strip().lower()

    if requested == "cpu":
        return "cpu"

    cuda_available = False
    try:
        import torch

        cuda_available = torch.cuda.is_available()
    except ImportError:
        pass

    if cuda_available:
        return "cuda"
    if requested in ("cuda", "gpu"):
        print("  DEVICE=cuda requested but CUDA is not available — using CPU")
    return "cpu"


@dataclass
class AppConfig:
    dashscope: DashScopeConfig = field(default_factory=DashScopeConfig)
    qdrant: QdrantConfig = field(default_factory=QdrantConfig)
    rag: RAGConfig = field(default_factory=RAGConfig)
    voice: VoiceConfig = field(default_factory=VoiceConfig)
    embedding_provider: str = field(
        default_factory=lambda: os.getenv("EMBEDDING_PROVIDER", "auto").strip().lower()
    )
    embedding_model: str = field(
        default_factory=lambda: os.getenv("EMBEDDING_MODEL", "BAAI/bge-m3")
    )
    legal_data_dir: Path = DATA_ROOT / "legal"
    graph_path: Path = DATA_ROOT / "legal" / "legal_graph.json"
    _device: str | None = field(default=None, repr=False, compare=False)

    @property
    def device(self) -> str:
        """Compute device for local models — GPU when available, CPU otherwise (cached)."""
        if self._device is None:
            self._device = resolve_device()
        return self._device

    def validate(self) -> list[str]:
        """Return list of missing configuration."""
        issues = []
        if not self.dashscope.api_key:
            issues.append("DASHSCOPE_API_KEY not set in .env")
        return issues


cfg = AppConfig()
