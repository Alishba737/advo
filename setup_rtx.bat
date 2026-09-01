@echo off
setlocal EnableDelayedExpansion

echo ============================================================
echo  ADVO - One-Click Setup for RTX Laptop
echo ============================================================
echo.

set REPO_URL=https://github.com/Alishba737/advo.git
set PROJECT_DIR=%USERPROFILE%\advo
set BRANCH=main

REM ─── Step 1: Check Git ────────────────────────────────────
echo [1/8] Checking Git...
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   X Git not found. Please install Git first:
    echo     https://git-scm.com/download/win
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('git --version') do echo   OK %%v

REM ─── Step 2: Check Python ────────────────────────────────
echo.
echo [2/8] Checking Python...
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   X Python not found. Please install Python 3.11+:
    echo     https://www.python.org/downloads/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo   OK %%v

REM ─── Step 3: Check Node.js ──────────────────────────────
echo.
echo [3/8] Checking Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   ! Node.js not found. Install from: https://nodejs.org/
    echo     (Needed for Next.js frontend)
) else (
    for /f "tokens=*" %%v in ('node --version') do echo   OK Node.js %%v
)

REM ─── Step 4: Check Docker ───────────────────────────────
echo.
echo [4/8] Checking Docker...
set DOCKER_OK=0
where docker >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('docker --version') do echo   OK %%v
    set DOCKER_OK=1
) else (
    echo   ! Docker not found.
    echo     Install Docker Desktop: https://docker.com/products/docker-desktop/
    echo     ADVO will use in-memory mode without Docker.
)

REM ─── Step 5: Check NVIDIA GPU ──────────────────────────
echo.
echo [5/8] Checking NVIDIA GPU...
set CUDA_OK=0
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%g in ('nvidia-smi --query-gpu^=name^,memory.total --format^=csv^,noheader') do (
        echo   OK GPU: %%g
        set CUDA_OK=1
    )
) else (
    echo   ! No NVIDIA GPU detected. Embeddings will run on CPU.
)

REM ─── Step 6: Clone Repository ────────────────────────────
echo.
echo [6/8] Cloning ADVO repository...
if exist "%PROJECT_DIR%" (
    echo   Project directory already exists: %PROJECT_DIR%
    echo   Pulling latest changes...
    cd /d "%PROJECT_DIR%"
    git pull origin %BRANCH%
    if %ERRORLEVEL% neq 0 (
        echo   X Failed to pull latest changes.
        pause
        exit /b 1
    )
) else (
    echo   Cloning to %PROJECT_DIR%...
    git clone %REPO_URL% "%PROJECT_DIR%"
    if %ERRORLEVEL% neq 0 (
        echo   X Clone failed. Make sure you have access to the repo.
        echo     If prompted, log in to GitHub.
        echo.
        echo   Try: gh auth login
        echo   Then re-run this script.
        pause
        exit /b 1
    )
    cd /d "%PROJECT_DIR%"
)
echo   OK Repository ready.

REM ─── Step 7: Install Python Dependencies ────────────────
echo.
echo [7/8] Installing Python dependencies...
cd /d "%PROJECT_DIR%"
REM Install CUDA PyTorch BEFORE requirements so pip keeps the GPU build
if %CUDA_OK% equ 1 (
    echo   Installing CUDA-enabled PyTorch first...
    pip install torch --index-url https://download.pytorch.org/whl/cu121
    if !ERRORLEVEL! equ 0 (
        echo   OK CUDA PyTorch installed. bge-m3 will run on your RTX GPU.
    ) else (
        echo   ! CUDA PyTorch install failed. CPU build will be used instead.
    )
)
pip install -r packages\requirements.txt
if %ERRORLEVEL% neq 0 (
    echo   X Failed to install some dependencies. Check errors above.
) else (
    echo   OK Python dependencies installed.
)

REM ─── Step 8: Environment Setup ──────────────────────────
echo.
echo [8/8] Setting up environment...

REM Create .env from template if it doesn't exist
if not exist "%PROJECT_DIR%\.env" (
    copy "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env" >nul
    echo   Created .env from template.
    echo.
    echo   *** IMPORTANT: Edit %PROJECT_DIR%\.env and add your DASHSCOPE_API_KEY ***
    echo.
) else (
    echo   .env already exists.
)

REM Start Docker services if Docker is available
if %DOCKER_OK% equ 1 (
    echo.
    echo   Starting Docker services (Qdrant, PostgreSQL, Redis)...
    cd /d "%PROJECT_DIR%"
    docker compose up -d
    if %ERRORLEVEL% equ 0 (
        echo   OK Docker services running.
    ) else (
        echo   ! Docker services failed. Make sure Docker Desktop is running.
        echo     ADVO will fall back to in-memory mode.
    )
) else (
    echo.
    echo   Skipping Docker (in-memory mode will be used).
)

REM ─── Done! ──────────────────────────────────────────────
echo.
echo ============================================================
echo  ADVO Setup Complete!
echo ============================================================
echo.
echo  Project location: %PROJECT_DIR%
echo.
echo  NEXT STEPS:
echo.
echo  1. Add your DashScope API key to .env:
echo     notepad "%PROJECT_DIR%\.env"
echo     Get key from: https://dashscope.console.aliyun.com/
echo.
echo  2. Start the API server:
echo     cd "%PROJECT_DIR%"
echo     uvicorn packages.api.main:app --reload --host 0.0.0.0 --port 8000
echo.
echo  3. Open in Qoder and say "continue with ADVO"
echo.
echo  4. Test the RAG pipeline:
echo     cd "%PROJECT_DIR%"
echo     python packages\rag\test_retrieval.py
echo.
echo  5. (Later) Start the frontend:
echo     cd "%PROJECT_DIR%\apps\web"
echo     npm run dev
echo.
echo ============================================================
pause
