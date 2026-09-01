"""ADVO Setup Script — One-command setup for a new machine.

Usage:
    python setup.py

This script:
1. Checks prerequisites (Python, Docker, CUDA)
2. Installs Python dependencies
3. Starts Docker services (Qdrant, Postgres, Redis)
4. Creates .env from template if missing
5. Installs CUDA PyTorch when an NVIDIA GPU is present (CPU build otherwise)
"""

import os
import subprocess
import shutil
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
REQUIREMENTS = PROJECT_ROOT / "packages" / "requirements.txt"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"
ENV_FILE = PROJECT_ROOT / ".env"


def run(cmd: str, check: bool = True) -> bool:
    """Run a shell command, return success."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=300)
        if check and result.returncode != 0:
            print(f"  ✗ Command failed: {cmd}")
            print(f"    {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"  ✗ Error running '{cmd}': {e}")
        return False


def check_python():
    print("\n[1/6] Checking Python...")
    version = sys.version_info
    if version.major >= 3 and version.minor >= 11:
        print(f"  ✓ Python {version.major}.{version.minor}.{version.micro}")
        return True
    print(f"  ✗ Python 3.11+ required (found {version.major}.{version.minor})")
    return False


def check_docker():
    print("\n[2/6] Checking Docker...")
    if shutil.which("docker"):
        result = subprocess.run(["docker", "--version"], capture_output=True, text=True)
        print(f"  ✓ {result.stdout.strip()}")
        return True
    print("  ✗ Docker not found. Install Docker Desktop: https://docker.com/products/docker-desktop")
    return False


def check_cuda():
    print("\n[3/6] Checking NVIDIA CUDA...")
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            gpu_info = result.stdout.strip()
            print(f"  ✓ GPU: {gpu_info}")
            return True
    except Exception:
        pass
    print("  ⚠ No NVIDIA GPU detected. Embeddings will run on CPU.")
    return False


def install_deps(cuda_available: bool):
    print("\n[4/6] Installing Python dependencies...")
    if cuda_available:
        print("  Installing CUDA-enabled PyTorch first...")
        if run("pip install torch --index-url https://download.pytorch.org/whl/cu121"):
            print("  ✓ CUDA PyTorch installed — embeddings will use the GPU")
        else:
            print("  ⚠ CUDA PyTorch install failed — CPU build will be used")
    success = run(f"pip install -r {REQUIREMENTS}")
    if success:
        print("  ✓ Dependencies installed")
    return success


def setup_env():
    print("\n[5/6] Setting up environment...")
    if ENV_FILE.exists():
        print(f"  ✓ .env already exists")
        return True
    if ENV_EXAMPLE.exists():
        shutil.copy(ENV_EXAMPLE, ENV_FILE)
        print(f"  ✓ Created .env from template")
        print(f"  ⚠ Edit .env and add your DASHSCOPE_API_KEY")
    else:
        print("  ✗ .env.example not found")
        return False
    return True


def start_docker():
    print("\n[6/6] Starting Docker services...")
    compose_file = PROJECT_ROOT / "docker-compose.yml"
    if not compose_file.exists():
        print("  ✗ docker-compose.yml not found")
        return False
    success = run("docker compose up -d")
    if success:
        print("  ✓ Qdrant, Postgres, Redis running")
    return success


def main():
    print("=" * 60)
    print("ADVO — Project Setup")
    print("=" * 60)

    checks = {
        "Python": check_python(),
        "Docker": check_docker(),
        "CUDA": check_cuda(),
    }

    if not checks["Python"]:
        sys.exit(1)

    install_deps(checks["CUDA"])
    setup_env()

    if checks["Docker"]:
        start_docker()
    else:
        print("\n  Skipping Docker (will use in-memory mode)")

    print("\n" + "=" * 60)
    print("Setup complete!")
    print("=" * 60)
    print()

    if not ENV_FILE.exists() or "sk-xxx" in ENV_FILE.read_text():
        print("  NEXT: Edit .env and add your DASHSCOPE_API_KEY")
        print("        Get it from: https://dashscope.console.aliyun.com/")
        print()

    print("  Then start the API server:")
    print("    cd advo")
    print("    uvicorn packages.api.main:app --reload --host 0.0.0.0 --port 8000")
    print()
    print("  Then start the frontend:")
    print("    cd apps/web")
    print("    npm run dev")
    print()


if __name__ == "__main__":
    main()
