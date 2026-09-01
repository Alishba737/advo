"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RotateCcw, Scale, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/advo/mode-toggle";
import { MessageBubble } from "@/components/advo/message-bubble";
import { ChatInput, type AttachedDoc } from "@/components/advo/chat-input";
import { SessionHistory } from "@/components/advo/session-history";
import {
  fetchSessionMessages,
  getSessionId,
  newSessionId,
  streamChat,
  type ChatMessage,
  type SessionInfo,
  type UserMode,
} from "@/lib/api";
import { FOLLOW_UPS, MODES } from "@/lib/modes";
import { cn } from "@/lib/utils";

const MODE_STORAGE_KEY = "advo-mode";
const DOC_CONTEXT_KEY = "advo-doc-context";

function isMode(value: string | null): value is UserMode {
  return value === "citizen" || value === "student" || value === "lawyer";
}

export function ChatView() {
  const params = useSearchParams();

  const [mode, setMode] = useState<UserMode>("citizen");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState("default");
  const [attachedDoc, setAttachedDoc] = useState<AttachedDoc | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Initialize mode (URL param → localStorage → default) ──
  useEffect(() => {
    const urlMode = params.get("mode");
    if (isMode(urlMode)) {
      setMode(urlMode);
      window.localStorage.setItem(MODE_STORAGE_KEY, urlMode);
      return;
    }
    const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (isMode(stored)) setMode(stored);
  }, [params]);

  // ── Session + document context ──
  useEffect(() => {
    setSessionId(getSessionId());
    try {
      const raw = sessionStorage.getItem(DOC_CONTEXT_KEY);
      if (raw) setAttachedDoc(JSON.parse(raw) as AttachedDoc);
    } catch {
      // ignore malformed context
    }
  }, []);

  // ── Auto-scroll while messages grow ──
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleModeChange = useCallback((next: UserMode) => {
    setMode(next);
    window.localStorage.setItem(MODE_STORAGE_KEY, next);
  }, []);

  const updateLast = useCallback((patch: Partial<ChatMessage>) => {
    setMessages((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], ...patch };
      return next;
    });
  }, []);

  const sendMessage = useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? input).trim();
      if (!text || streaming) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        status: "streaming",
        toolStatus: null,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat({
          message: text,
          sessionId,
          userMode: mode,
          documentIds: attachedDoc ? [attachedDoc.id] : undefined,
          signal: controller.signal,
          onEvent: (event) => {
            switch (event.type) {
              case "token":
                setMessages((prev) => {
                  if (!prev.length) return prev;
                  const next = [...prev];
                  const last = next[next.length - 1];
                  next[next.length - 1] = { ...last, content: last.content + event.content };
                  return next;
                });
                break;
              case "tool_call":
                updateLast({ toolStatus: event.content });
                break;
              case "tool_result":
                // Keep the current status until real tokens arrive
                break;
              case "done":
                updateLast({
                  status: "done",
                  toolStatus: null,
                  citations: event.citations ?? [],
                  confidence: event.confidence ?? undefined,
                  highRisk: event.high_risk ?? undefined,
                });
                break;
              case "error":
                updateLast({ status: "error", toolStatus: null, content: event.content });
                break;
            }
          },
        });
        // Finalize if the stream ended without an explicit done event
        updateLast({ status: "done", toolStatus: null });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          updateLast({ status: "done", toolStatus: null });
        } else {
          updateLast({
            status: "error",
            toolStatus: null,
            content: (err as Error).message,
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, sessionId, mode, attachedDoc, updateLast]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleNewChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(newSessionId());
    setInput("");
  }, []);

  const handleSelectSession = useCallback(
    async (session: SessionInfo) => {
      if (streaming || session.id === sessionId) {
        setHistoryOpen(false);
        return;
      }
      abortRef.current?.abort();
      setHistoryOpen(false);
      setSessionId(session.id);
      window.localStorage.setItem("advo-session-id", session.id);
      try {
        const msgs = await fetchSessionMessages(session.id);
        setMessages(
          msgs
            .filter((m) => m.role !== "system")
            .map((m) => ({
              id: crypto.randomUUID(),
              role: m.role as "user" | "assistant",
              content: m.content,
              status: "done" as const,
            })),
        );
      } catch {
        setMessages([]);
      }
    },
    [streaming, sessionId],
  );

  const handleRemoveDoc = useCallback(() => {
    setAttachedDoc(null);
    sessionStorage.removeItem(DOC_CONTEXT_KEY);
  }, []);

  const modeConfig = MODES[mode];
  const lastMessage = messages[messages.length - 1];
  const showFollowUps =
    lastMessage?.role === "assistant" && lastMessage.status === "done" && !streaming;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-3xl flex-col px-0 sm:px-6">
      {/* Chat toolbar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 sm:px-0">
        <ModeToggle mode={mode} onChange={handleModeChange} disabled={streaming} />
        <span className="hidden truncate text-xs text-muted-foreground md:inline">
          {modeConfig.heading}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setHistoryOpen(true)}
          disabled={streaming}
          aria-label="Open chat history"
        >
          <History className="size-3.5" />
          History
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-muted-foreground"
          onClick={handleNewChat}
          disabled={streaming}
        >
          <RotateCcw className="size-3.5" />
          New chat
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-4 pt-4 pb-6 sm:px-0">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 py-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Scale className="size-7" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                {modeConfig.heading}
              </h1>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {modeConfig.longDescription}
              </p>
            </div>
            <div className="flex max-w-lg flex-col gap-2">
              {modeConfig.starterQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => sendMessage(question)}
                  className={cn(
                    "rounded-xl border bg-card px-4 py-2.5 text-left text-sm transition-colors",
                    "hover:border-primary/40 hover:bg-muted/50"
                  )}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {showFollowUps && (
              <div className="flex flex-wrap gap-2 pl-10">
                {FOLLOW_UPS[mode].map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => sendMessage(question)}
                    className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Chat history panel */}
      <SessionHistory
        open={historyOpen}
        currentSessionId={sessionId}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleSelectSession}
      />

      {/* Composer */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={() => sendMessage()}
        onStop={handleStop}
        streaming={streaming}
        attachedDoc={attachedDoc}
        onRemoveDoc={handleRemoveDoc}
      />
    </div>
  );
}
