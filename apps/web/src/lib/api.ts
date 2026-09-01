/** ADVO web API client — talks to the FastAPI backend. */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export type UserMode = "citizen" | "student" | "lawyer";

export interface Citation {
  act_name: string;
  section?: string | null;
  text_snippet?: string;
  /** true = matched a retrieved chunk; false = not grounded; undefined = unverified run */
  verified?: boolean | null;
}

export type Confidence = "high" | "medium" | "low";

export interface StreamEvent {
  type: "token" | "tool_call" | "tool_result" | "done" | "error";
  content: string;
  citations?: Citation[] | null;
  confidence?: Confidence | null;
  high_risk?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  /** assistant only: lifecycle of a streamed response */
  status?: "streaming" | "done" | "error";
  /** assistant only: transient label like "Searching legal database..." */
  toolStatus?: string | null;
  /** assistant only: grounding confidence (from citation verification) */
  confidence?: Confidence;
  /** assistant only: user's question matched a high-stakes legal topic */
  highRisk?: boolean;
}

export interface UploadResult {
  document_id: string;
  filename: string;
  text_length: number;
  preview: string;
}

export interface HealthStatus {
  ok: boolean;
  status?: string;
}

// ─── Session helpers ─────────────────────────────────────────

const SESSION_KEY = "advo-session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "default";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function newSessionId(): string {
  const id = crypto.randomUUID();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

// ─── Session history ───────────────────────────────────────

export interface SessionInfo {
  id: string;
  title: string;
  message_count: number;
  updated: string;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** GET /sessions — chat sessions, most recently active first. */
export async function fetchSessions(): Promise<SessionInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/sessions`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { sessions: SessionInfo[] };
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

/** GET /sessions/:id/messages — full message history of one session. */
export async function fetchSessionMessages(
  sessionId: string,
): Promise<SessionMessage[]> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/messages`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Could not load session (${res.status})`);
  }
  const data = (await res.json()) as { messages: SessionMessage[] };
  return data.messages ?? [];
}

// ─── Chat (streaming) ────────────────────────────────────────

export interface StreamChatParams {
  message: string;
  sessionId: string;
  userMode: UserMode;
  documentIds?: string[];
  onEvent: (event: StreamEvent) => void;
  signal?: AbortSignal;
}

/** POST /chat/stream and parse the SSE response with ReadableStream. */
export async function streamChat({
  message,
  sessionId,
  userMode,
  documentIds,
  onEvent,
  signal,
}: StreamChatParams): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      user_mode: userMode,
      document_ids: documentIds?.length ? documentIds : undefined,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Backend returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by a blank line
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const dataLine = part
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine.slice(6)) as StreamEvent);
      } catch {
        // ignore malformed events
      }
    }
  }
}

// ─── Documents ───────────────────────────────────────────────

/** POST /upload — multipart form with a single file. */
export async function uploadDocument(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<UploadResult>;
}

// ─── Health ─────────────────────────────────────────────────

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { status: string };
    return { ok: data.status === "healthy", status: data.status };
  } catch {
    return { ok: false };
  }
}

// ─── Voice ──────────────────────────────────────────────────

export interface TranscriptionResult {
  text: string;
  duration_ms?: number | null;
}

/** POST /voice/transcribe — raw 16-bit mono PCM bytes (binary body). */
export async function transcribeAudio(
  pcm: ArrayBuffer,
  sampleRate = 16000,
): Promise<TranscriptionResult> {
  const res = await fetch(
    `${API_BASE}/voice/transcribe?sample_rate=${sampleRate}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: pcm,
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Transcription failed (${res.status})`);
  }
  return res.json() as Promise<TranscriptionResult>;
}

/** POST /voice/speak — text -> WAV audio bytes. */
export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  // The backend TTS reads at most ~1200 chars (≈1 min of speech); keep the
  // request within that and prefer cutting at a sentence boundary.
  const capped =
    text.length <= 1200
      ? text
      : (() => {
          const slice = text.slice(0, 1200);
          const lastStop = Math.max(
            slice.lastIndexOf(". "),
            slice.lastIndexOf("! "),
            slice.lastIndexOf("? "),
            slice.lastIndexOf("."),
          );
          return lastStop > 600 ? slice.slice(0, lastStop + 1) : slice;
        })();

  const res = await fetch(`${API_BASE}/voice/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: capped }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Speech synthesis failed (${res.status})`);
  }
  return res.arrayBuffer();
}
