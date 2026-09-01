"""Text-to-speech via the DashScope native multimodal-generation API (qwen3-tts-flash).

The API returns a signed OSS URL for the generated WAV; we download it so the
backend can serve the audio bytes directly (no URL leak, no CORS issues).
"""

import json
import urllib.request

from packages.shared.config import cfg


class TTSError(RuntimeError):
    """Raised when speech synthesis fails."""


def synthesize(text: str, voice: str | None = None) -> bytes:
    """Synthesize speech and return WAV audio bytes.

    Args:
        text: the text to speak (cap ~1200 chars ≈ 1 min of speech for latency).
        voice: optional voice name (default cfg.voice.tts_voice, e.g. "Cherry").
    """
    text = text.strip()
    if not text:
        raise TTSError("No text to synthesize")
    voice = voice or cfg.voice.tts_voice
    if not cfg.dashscope.api_key:
        raise TTSError("DASHSCOPE_API_KEY not set")

    payload = {
        "model": cfg.voice.tts_model,
        "input": {"text": text[:1200], "voice": voice},
    }

    req = urllib.request.Request(
        f"{cfg.voice.native_http_url}/services/aigc/multimodal-generation/generation",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {cfg.dashscope.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raise TTSError(f"TTS request failed (HTTP {e.code}): {e.read().decode()[:200]}") from e

    audio_url = (body.get("output", {}).get("audio", {}) or {}).get("url")
    if not audio_url:
        code = body.get("code", body.get("status"))
        raise TTSError(f"TTS returned no audio URL (code={code}, message={body.get('message', '')})")

    # download the generated audio so we can stream it to the client directly
    with urllib.request.urlopen(audio_url, timeout=60) as audio_resp:
        return audio_resp.read()
