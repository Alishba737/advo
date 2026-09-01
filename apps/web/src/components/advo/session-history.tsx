"use client";

import { useEffect, useState } from "react";
import { History, Loader2, MessageSquare, X } from "lucide-react";

import type { SessionInfo } from "@/lib/api";
import { fetchSessions } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Slide-over panel listing past chat sessions. */
export function SessionHistory({
  open,
  currentSessionId,
  onClose,
  onSelect,
}: {
  open: boolean;
  currentSessionId: string;
  onClose: () => void;
  onSelect: (session: SessionInfo) => void;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Chat history">
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close history"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      {/* panel */}
      <div className="absolute top-0 right-0 flex h-full w-80 max-w-[85vw] flex-col border-l bg-card shadow-xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <History className="size-4 text-primary" />
          <span className="text-sm font-semibold">Chat history</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading sessions…
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              No past chats yet.
              <br />
              Your conversations will appear here.
            </p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s)}
                className={cn(
                  "mb-1 flex w-full flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
                  "hover:bg-muted/60",
                  s.id === currentSessionId && "bg-muted",
                )}
              >
                <span className="line-clamp-2 w-full text-sm font-medium">
                  {s.title || "Untitled chat"}
                </span>
                <span className="flex w-full items-center gap-2 text-[11px] text-muted-foreground">
                  <MessageSquare className="size-3" />
                  {s.message_count} messages
                  <span className="ml-auto">{formatWhen(s.updated)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
