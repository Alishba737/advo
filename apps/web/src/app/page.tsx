"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Scale,
  Paperclip,
  Mic,
  ArrowUp,
  ShieldAlert,
  BookOpen,
  FileText,
  Sparkles,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { useRole, type UserMode } from "@/components/providers/role-provider";
import {
  streamChat,
  fetchSessionMessages,
  uploadDocument,
  transcribeAudio,
  getSessionId,
  newSessionId,
  type Citation,
  type StreamEvent,
  type SessionMessage,
} from "@/lib/api";
import { useSpeechRecorder } from "@/lib/use-speech-recorder";
import { getProject, type Project } from "@/lib/projects-api";
import { rememberSessionProject } from "@/lib/session-projects";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  highRisk?: boolean;
  attachments?: { id: string; filename: string }[];
  streaming?: boolean;
  error?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Welcome content per role
// ─────────────────────────────────────────────────────────────

const WELCOME: Record<
  UserMode,
  { heading: string; sub: string; starters: string[]; chips: string[] }
> = {
  citizen: {
    heading: "Everyday legal help",
    sub: "Get clear, jargon-free explanations of Pakistani law — contracts, tenancy, family matters — with the exact sections cited.",
    starters: [
      "What makes a contract valid in Pakistan?",
      "What are my rights as a tenant in Pakistan?",
      "What should I check before signing an employment contract?",
      "How do I file a consumer complaint about a defective product?",
    ],
    chips: ["Tenant rights", "Contract validity", "Consumer complaint", "Employment contract"],
  },
  student: {
    heading: "Study & exam prep",
    sub: "Structured breakdowns with statutory text, section-by-section analysis, and exam-ready frameworks.",
    starters: [
      "Explain the essentials of a valid contract with section numbers.",
      "Compare coercion and undue influence under the Contract Act.",
      "What is the difference between void and voidable agreements?",
      "Summarize the rules regarding contingent contracts.",
    ],
    chips: ["Valid contract", "Coercion vs undue influence", "Void vs voidable", "Contingent contracts"],
  },
  lawyer: {
    heading: "Technical precision",
    sub: "Dense, citation-first analysis with precise statutory language and interpretive notes.",
    starters: [
      "Elements of free consent under ss. 13–22 of the Contract Act 1872.",
      "Framework for analyzing breach-of-contract remedies.",
      "Jurisdictional limits for specific performance in Pakistan.",
      "How does the Qanun-e-Shahadat treat electronic evidence?",
    ],
    chips: ["Free consent ss. 13–22", "Breach remedies", "Specific performance", "Qanun-e-Shahadat"],
  },
};

const FOLLOW_UPS: Record<UserMode, string[]> = {
  citizen: ["Explain that in simpler terms", "What should I do next?", "Show me the exact legal text"],
  student: ["Give me an exam-style framework", "Compare the related sections", "What are common exam traps here?"],
  lawyer: ["Cite the relevant statutory text", "What are the practical pitfalls?", "Any recent amendments?"],
};

const SESSION_MODE_KEY = "advo-session-modes";

function rememberSessionMode(sessionId: string, mode: UserMode) {
  if (typeof window === "undefined") return;
  const stored = window.localStorage.getItem(SESSION_MODE_KEY);
  const modes = stored ? (JSON.parse(stored) as Record<string, UserMode>) : {};
  modes[sessionId] = mode;
  window.localStorage.setItem(SESSION_MODE_KEY, JSON.stringify(modes));
}

// ─────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────

function HomePageContent() {
  const { mode } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; filename: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const welcome = WELCOME[mode];

  // Initialize session id:
  // - If a session is passed in the URL, open that existing chat.
  // - Otherwise always start a fresh chat on app load / refresh.
  useEffect(() => {
    const fromUrl = searchParams.get("session");
    if (fromUrl) {
      setSessionId(fromUrl);
    } else {
      setSessionId(newSessionId());
    }
  }, [searchParams]);

  // Load project context if opening a chat from a Project page.
  // The backend will automatically include the project's instructions and
  // documents on every message while activeProjectId is set.
  useEffect(() => {
    const projectId = searchParams.get("project");
    if (!projectId) {
      setActiveProjectId(null);
      setAttachments([]);
      return;
    }
    setActiveProjectId(projectId);
    if (sessionId) {
      rememberSessionProject(sessionId, projectId);
    }
    getProject(projectId)
      .then((project: Project | null) => {
        if (!project) return;
        const docs = project.documents.map((d) => ({ id: d.id, filename: d.filename }));
        setAttachments(docs);
      })
      .catch(() => {
        // ignore — backend will also reject invalid project_id when sending
      });
  }, [searchParams, sessionId]);

  // Load existing messages when session id changes
  useEffect(() => {
    if (!sessionId) return;
    setMessages([]);
    setThinking(true);
    fetchSessionMessages(sessionId)
      .then((data: SessionMessage[]) => {
        const loaded: UIMessage[] = data
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m, i) => ({
            id: `${sessionId}-${i}`,
            role: m.role as "user" | "assistant",
            content: m.content,
          }));
        setMessages(loaded);
      })
      .catch(() => {
        // ignore — new sessions may not exist yet on first message
      })
      .finally(() => setThinking(false));
  }, [sessionId]);

  // Scroll to bottom as messages grow
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const handleNewChat = useCallback(() => {
    const id = newSessionId();
    setSessionId(id);
    setMessages([]);
    router.replace(`/?session=${encodeURIComponent(id)}`);
  }, [router]);

  const send = useCallback(
    async (text?: string) => {
      const content = (text ?? input).trim();
      if (!content || thinking) return;

      rememberSessionMode(sessionId, mode);

      const userMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        attachments: attachments.length ? attachments : undefined,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      const currentAttachments = attachments;
      // Keep project documents visible across messages; clear ad-hoc uploads.
      setAttachments(activeProjectId ? currentAttachments : []);
      setThinking(true);

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat({
          message: content,
          sessionId,
          userMode: mode,
          documentIds: currentAttachments.map((a) => a.id),
          projectId: activeProjectId ?? undefined,
          signal: controller.signal,
          onEvent: (event: StreamEvent) => {
            if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              );
            } else if (event.type === "tool_call") {
              // Optional: surface tool status in UI
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        streaming: false,
                        citations: event.citations ?? undefined,

                        highRisk: event.high_risk ?? undefined,
                      }
                    : m,
                ),
              );
              setThinking(false);
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, streaming: false, error: true, content: event.content }
                    : m,
                ),
              );
              setThinking(false);
            }
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not reach ADVO backend.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, error: true, content: message }
              : m,
          ),
        );
        setThinking(false);
      } finally {
        abortRef.current = null;
      }
    },
    [input, thinking, attachments, mode, sessionId, activeProjectId],
  );

  // Auto-send a prompt passed from the project hub (e.g. ?prompt=...).
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (!prompt || !sessionId || thinking || messages.length > 0) return;
    send(prompt);
    const url = new URL(window.location.href);
    url.searchParams.delete("prompt");
    router.replace(url.pathname + url.search);
  }, [searchParams, sessionId, thinking, messages.length, send, router]);

  const hasMessages = messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const showFollowUps =
    lastMessage?.role === "assistant" && !lastMessage.streaming && !thinking;

  return (
    <div className="flex h-full w-full flex-col">
      {!hasMessages ? (
        <EmptyChatState
          mode={mode}
          welcome={welcome}
          input={input}
          setInput={setInput}
          attachments={attachments}
          setAttachments={setAttachments}
          send={send}
          onAttach={setAttachments}
        />
      ) : (
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 sm:px-6">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto py-6">
            {messages.map((message) =>
              message.role === "user" ? (
                <UserBubble key={message.id} message={message} />
              ) : (
                <AssistantBubble key={message.id} message={message} />
              ),
            )}
            {thinking && (
              <div className="flex items-center gap-2 pl-1 text-sm text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
                <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
                <span className="ml-1 text-xs">Searching legal database…</span>
              </div>
            )}
            {showFollowUps && (
              <div className="flex flex-wrap gap-2 pl-10">
                {FOLLOW_UPS[mode].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bottom composer */}
          <div className="pb-4">
            <Composer
              variant="bottom"
              input={input}
              setInput={setInput}
              attachments={attachments}
              setAttachments={setAttachments}
              send={send}
              thinking={thinking}
              onAttach={setAttachments}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Empty chat state
// ─────────────────────────────────────────────────────────────

function EmptyChatState({
  mode,
  welcome,
  input,
  setInput,
  attachments,
  setAttachments,
  send,
  onAttach,
}: {
  mode: UserMode;
  welcome: (typeof WELCOME)[UserMode];
  input: string;
  setInput: (v: string) => void;
  attachments: { id: string; filename: string }[];
  setAttachments: (v: { id: string; filename: string }[]) => void;
  send: (text?: string) => void;
  onAttach: (v: { id: string; filename: string }[]) => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
      {/* Greeting */}
      <div className="mb-6 flex items-center gap-3 text-4xl font-medium tracking-tight sm:text-5xl">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-12">
          <Scale className="size-6 sm:size-7" />
        </span>
        <span>Hey there, Zain</span>
      </div>

      {/* Big centered composer */}
      <div className="w-full max-w-2xl">
        <Composer
          variant="centered"
          input={input}
          setInput={setInput}
          attachments={attachments}
          setAttachments={setAttachments}
          send={send}
          thinking={false}
          onAttach={onAttach}
        />
      </div>

      {/* Suggestion chips */}
      <div className="mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2">
        {welcome.chips.map((chip, i) => {
          const Icon = [BookOpen, Sparkles, FileText, ShieldAlert][i % 4];
          return (
            <button
              key={chip}
              type="button"
              onClick={() => send(welcome.starters[i] ?? chip)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Icon className="size-3" />
              {chip}
            </button>
          );
        })}
      </div>

      {/* Feature badges */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {[
          { icon: BookOpen, label: "Cited answers" },
          { icon: FileText, label: "Document analysis" },
          { icon: Sparkles, label: roleLabel(mode) },
        ].map((f) => (
          <span
            key={f.label}
            className="flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground"
          >
            <f.icon className="size-3" />
            {f.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function roleLabel(mode: UserMode) {
  switch (mode) {
    case "citizen":
      return "Citizen mode";
    case "student":
      return "Student mode";
    case "lawyer":
      return "Lawyer mode";
  }
}

// ─────────────────────────────────────────────────────────────
// Composer
// ─────────────────────────────────────────────────────────────

interface ComposerProps {
  variant: "centered" | "bottom";
  input: string;
  setInput: (v: string) => void;
  attachments: { id: string; filename: string }[];
  setAttachments: (v: { id: string; filename: string }[]) => void;
  send: (text?: string) => void;
  thinking: boolean;
  onAttach: (v: { id: string; filename: string }[]) => void;
}

function Composer({
  variant,
  input,
  setInput,
  attachments,
  setAttachments,
  send,
  thinking,
  onAttach,
}: ComposerProps) {
  const isCentered = variant === "centered";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const { recording, error: micError, start, stop } = useSpeechRecorder();

  const handleMicClick = async () => {
    if (transcribing) return;
    setVoiceError(null);
    if (recording) {
      const pcm = await stop();
      if (!pcm) return;
      setTranscribing(true);
      try {
        const { text } = await transcribeAudio(pcm);
        if (text) {
          setInput(input ? `${input} ${text}`.trim() : text);
        } else {
          setVoiceError("No speech detected — try again.");
        }
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : "Transcription failed");
      } finally {
        setTranscribing(false);
      }
    } else {
      try {
        await start();
      } catch {
        // recorder sets its own error state
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (attachments.length >= 3) return;

    const file = files[0];
    setUploading(true);
    try {
      const result = await uploadDocument(file);
      onAttach([
        ...attachments,
        { id: result.document_id, filename: result.filename },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      alert(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground/80"
            >
              <FileText className="size-3 text-primary" />
              {a.filename}
              <button
                type="button"
                onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}
                className="ml-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${a.filename}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          "rounded-[1.5rem] border border-border bg-card p-3 shadow-lg transition-shadow focus-within:shadow-xl focus-within:ring-1 focus-within:ring-primary/30",
          isCentered && "p-4",
        )}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="How can ADVO help you today?"
          className={cn(
            "w-full resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground",
            isCentered && "min-h-[56px] py-3 text-base",
          )}
        />

        <div className="mt-1 flex items-center gap-1">
          {/* Left actions */}
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || attachments.length >= 3}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="Attach document"
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            </button>
            <button
              type="button"
              onClick={handleMicClick}
              disabled={thinking || transcribing}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg transition-colors",
                recording || transcribing
                  ? "bg-destructive/10 text-destructive"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-label={recording ? "Stop recording" : transcribing ? "Transcribing" : "Voice input"}
            >
              {transcribing ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
            </button>
          </div>

          {/* Mode badge */}
          <span className="ml-2 hidden items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:flex">
            Chat
          </span>

          {/* Right side: send + disclaimer */}
          <span className="ml-auto hidden pr-2 text-[10px] text-muted-foreground sm:inline">
            Not legal advice
          </span>
          <button
            type="button"
            onClick={() => send()}
            disabled={!input.trim() || thinking}
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-colors",
              input.trim() && !thinking
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground",
            )}
            aria-label="Send message"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>

      {(recording || transcribing || micError || voiceError) && (
        <p
          className={cn(
            "mt-1.5 text-center text-[11px]",
            micError || voiceError ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {micError ?? voiceError ?? (recording ? "Listening… click again to stop." : "Transcribing your voice…")}
        </p>
      )}

      {isCentered && (
        <p className="mt-3 text-center text-[10px] text-muted-foreground">
          ADVO provides AI-generated legal information, not legal advice.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Message bubbles
// ─────────────────────────────────────────────────────────────

function UserBubble({ message }: { message: UIMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-1.5">
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                <FileText className="size-2.5" />
                {a.filename}
              </span>
            ))}
          </div>
        )}
        <div className="rounded-2xl rounded-br-md bg-primary/15 px-4 py-2.5 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ message }: { message: UIMessage }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Scale className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {message.highRisk && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            <p>
              This question involves a high-stakes legal matter. Please consult a qualified lawyer
              for personalized advice.
            </p>
          </div>
        )}
        {message.error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
            <p>{message.content || "Something went wrong. Please try again."}</p>
          </div>
        )}
        {!message.error && (
          <div
            className={cn(
              "advo-markdown text-sm leading-relaxed text-foreground/90",
              message.streaming && "cursor-blink",
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h2 className="mt-4 mb-2 text-base font-semibold">{children}</h2>,
                h2: ({ children }) => <h3 className="mt-4 mb-2 text-base font-semibold">{children}</h3>,
                h3: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold">{children}</h4>,
                p: ({ children }) => <p className="my-2">{children}</p>,
                ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
                    {children}
                  </a>
                ),
                hr: () => <hr className="my-4 border-border" />,
                blockquote: ({ children }) => (
                  <blockquote className="my-3 border-l-2 border-primary/40 pl-4 italic text-muted-foreground">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        {message.citations && !message.streaming && (
          <CitationsBlock citations={message.citations} />
        )}
      </div>
    </div>
  );
}

function CitationsBlock({ citations }: { citations: Citation[] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!citations.length) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <BookOpen className="size-3" />
        References ({citations.length})
        <span className="text-[9px]">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="space-y-1.5">
        {citations.map((c, i) => (
          <button
            key={`${c.act_name}-${c.section ?? i}`}
            type="button"
            onClick={() => setExpanded((prev) => (prev === `${i}` ? null : `${i}`))}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left transition-colors",
              c.verified
                ? "border-emerald-500/20 bg-emerald-500/[0.04] hover:bg-emerald-500/10"
                : "border-amber-500/20 bg-amber-500/[0.04] hover:bg-amber-500/10",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-[10px] font-semibold",
                  c.verified ? "text-emerald-400" : "text-amber-400",
                )}
              >
                {c.verified ? "✓" : "!"}
              </span>
              <span className="text-xs font-medium text-foreground/85">
                {c.act_name}, {c.section ?? "general"}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {expanded === `${i}` ? "▲" : "▼"}
              </span>
            </div>
            {expanded === `${i}` && (
              <p className="mt-1.5 border-l-2 border-border pl-2.5 text-[11px] leading-relaxed text-muted-foreground">
                {c.text_snippet}
              </p>
            )}
          </button>
        ))}
      </div>}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <HomePageContent />
    </Suspense>
  );
}
