"""Speech-to-text via the DashScope realtime WebSocket (qwen3-asr-flash-realtime).

Protocol (verified against the workspace endpoint):
  1. Connect to  wss://…/api-ws/v1/realtime?model=qwen3-asr-flash-realtime
     with an `Authorization: Bearer <key>` header.
  2. session.update — set input_audio_format "pcm" and the transcription model.
  3. Stream `input_audio_buffer.append` events with base64 PCM chunks.
  4. `input_audio_buffer.commit`.
  5. Read events; the final transcript arrives in
     `conversation.item.input_audio_transcription.completed`.
"""

import asyncio
import base64
import json
import uuid

import aiohttp

from packages.shared.config import cfg

# base64 characters per append event (~300ms of 16kHz 16-bit mono)
_CHUNK_B64 = 24000
# pause between chunks — 10x real-time. Tested: faster (burst) makes the
# server VAD truncate the tail of the audio; slower just adds latency.
_PACE_S = 0.055
# seconds of server silence before we decide all segments are transcribed
_QUIET_S = 4


class TranscriptionError(RuntimeError):
    """Raised when the realtime ASR session fails."""


def _event_id() -> str:
    return "event_" + uuid.uuid4().hex[:24]


async def transcribe_pcm(
    pcm: bytes,
    sample_rate: int | None = None,
    api_key: str | None = None,
) -> str:
    """Transcribe raw 16-bit mono PCM audio and return the text.

    Args:
        pcm: raw PCM bytes (16-bit little-endian, mono).
        sample_rate: defaults to cfg.voice.sample_rate (16000).
        api_key: defaults to the configured DashScope key.
    """
    sample_rate = sample_rate or cfg.voice.sample_rate
    api_key = api_key or cfg.dashscope.api_key
    if not api_key:
        raise TranscriptionError("DASHSCOPE_API_KEY not set")

    url = f"{cfg.voice.realtime_ws_url}?model={cfg.voice.asr_model}"
    headers = {"Authorization": f"Bearer {api_key}", "User-Agent": "advo/0.1.0"}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(url, headers=headers, heartbeat=20) as ws:
                # configure the session
                await ws.send_str(
                    json.dumps(
                        {
                            "event_id": _event_id(),
                            "type": "session.update",
                            "session": {
                                "input_audio_format": "pcm",
                                "input_audio_transcription": {
                                    "model": cfg.voice.asr_transcription_model,
                                },
                            },
                        }
                    )
                )

                # stream the audio as base64 chunks
                b64 = base64.b64encode(pcm).decode()
                for i in range(0, len(b64), _CHUNK_B64):
                    await ws.send_str(
                        json.dumps(
                            {
                                "event_id": _event_id(),
                                "type": "input_audio_buffer.append",
                                "audio": b64[i : i + _CHUNK_B64],
                            }
                        )
                    )
                    # pace the upload — see _PACE_S note above
                    await asyncio.sleep(_PACE_S)
                await ws.send_str(
                    json.dumps(
                        {"event_id": _event_id(), "type": "input_audio_buffer.commit"}
                    )
                )

                # collect events; the server VAD may split the audio into
                # several items, each with its own `…transcription.completed`
                # event — accumulate them all. End when the session goes
                # quiet (all segments transcribed) or the server closes.
                transcripts: list[str] = []
                while True:
                    try:
                        msg = await asyncio.wait_for(ws.receive(), timeout=_QUIET_S)
                    except asyncio.TimeoutError:
                        break  # quiet period — no more segments
                    if msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.CLOSE):
                        break
                    if msg.type != aiohttp.WSMsgType.TEXT:
                        continue
                    data = json.loads(msg.data)
                    event = data.get("type", "")
                    if event == "conversation.item.input_audio_transcription.completed":
                        piece = (data.get("transcript") or "").strip()
                        if piece:
                            transcripts.append(piece)
                    elif event == "error":
                        raise TranscriptionError(
                            f"ASR session error: {str(data.get('error', {}))[:300]}"
                        )
                    elif event in ("session.finished", "session.end"):
                        break
                return " ".join(transcripts).strip()
    except aiohttp.WSServerHandshakeError as e:
        raise TranscriptionError(f"ASR connection failed (HTTP {e.status})") from e
    except asyncio.TimeoutError as e:
        raise TranscriptionError("ASR timed out") from e
