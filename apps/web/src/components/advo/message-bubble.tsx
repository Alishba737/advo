"use client";

import { memo, useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Scale, AlertTriangle, Volume2, Square, Loader2, ShieldAlert } from "lucide-react";

import type { ChatMessage, Confidence } from "@/lib/api";
import { synthesizeSpeech } from "@/lib/api";
import { CitationList } from "@/components/advo/citation-card";
import { cn } from "@/lib/utils";

/** Reduce markdown to clean spoken text (headings, tables, code, links). */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\|([^\n]*)\|/g, "$1 ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`~_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text-to-speech control for one assistant message. */
const SpeakButton = memo(function SpeakButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    audioRef.current = null;
    setState("idle");
  }, []);

  const play = useCallback(async () => {
    if (state === "playing") {
      stop();
      return;
    }
    setState("loading");
    try {
      const wav = await synthesizeSpeech(text);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stop();
      audio.onerror = () => stop();
      await audio.play();
      setState("playing");
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }, [state, stop, text]);

  return (
    <button
      type="button"
      onClick={play}
      aria-label={state === "playing" ? "Stop reading aloud" : "Read aloud"}
      title={state === "error" ? "Speech synthesis failed" : "Read aloud"}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        state === "playing" && "bg-muted text-foreground",
        state === "error" && "text-destructive",
      )}
    >
      {state === "loading" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : state === "playing" ? (
        <Square className="size-3" />
      ) : (
        <Volume2 className="size-3.5" />
      )}
    </button>
  );
});

/** Markdown renderer tuned for ADVO's legal answers (tables, quotes, headings). */
function Markdown({ content }: { content: string }) {
  return (
    <div className="advo-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => (
            <h2 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />
          ),
          h2: (props) => (
            <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0" {...props} />
          ),
          h3: (props) => (
            <h4 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0" {...props} />
          ),
          p: (props) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props} />,
          ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="leading-relaxed" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="my-3 border-l-2 border-primary/40 bg-muted/40 py-1 pl-4 text-muted-foreground italic"
              {...props}
            />
          ),
          a: (props) => (
            <a
              className="font-medium text-primary underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          table: (props) => (
            <div className="my-3 overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border-b bg-muted/60 px-3 py-2 font-semibold whitespace-nowrap"
              {...props}
            />
          ),
          td: (props) => <td className="border-b px-3 py-2 align-top" {...props} />,
          tr: (props) => <tr className="last:[&>td]:border-b-0" {...props} />,
          pre: (props) => (
            <pre
              className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed"
              {...props}
            />
          ),
          code: (props) => (
            <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props} />
          ),
          hr: () => <hr className="my-4 border-t" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Advisory banner for high-stakes queries (arrest, eviction, custody…). */
function HighRiskBanner() {
  return (
    <div className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong className="font-semibold">This looks like a serious legal matter.</strong>{" "}
        ADVO provides legal information, not legal advice — please consult a qualified
        lawyer before taking any action or missing any deadline.
      </span>
    </div>
  );
}

const CONFIDENCE_STYLES: Record<
  Confidence,
  { dot: string; label: string; tip: string }
> = {
  high: {
    dot: "bg-emerald-500",
    label: "High confidence",
    tip: "All cited sections were verified against the retrieved legal sources.",
  },
  medium: {
    dot: "bg-amber-500",
    label: "Medium confidence",
    tip: "Some cited sections were verified against retrieved sources — check the badge on each source.",
  },
  low: {
    dot: "bg-rose-500",
    label: "Low confidence",
    tip: "No verified citations — this answer is not grounded in retrieved legal text. Verify independently.",
  },
};

/** Grounding confidence chip derived from citation verification. */
function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  const s = CONFIDENCE_STYLES[confidence];
  return (
    <span
      title={s.tip}
      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/** One chat message — user right-aligned bubble, assistant full-width with citations. */
export const MessageBubble = memo(function MessageBubble({
  message,
}: {
  message: ChatMessage;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Scale className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {message.toolStatus && (
          <div
            className={cn(
              "mb-2 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs text-muted-foreground"
            )}
          >
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            {message.toolStatus}
          </div>
        )}

        {message.content ? (
          <div className="rounded-2xl rounded-tl-md border bg-card px-4 py-3 text-sm">
            <Markdown content={message.content} />
            {message.status !== "streaming" && (
              <div className="mt-2 flex items-center justify-between border-t pt-2">
                <SpeakButton text={stripMarkdown(message.content)} />
              </div>
            )}
          </div>
        ) : (
          !message.toolStatus && (
            <div className="flex items-center gap-1.5 px-1 py-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          )
        )}

        {message.status === "error" && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" />
            {message.content || "Something went wrong. Is the backend running?"}
          </div>
        )}

        {message.status === "done" && message.highRisk && <HighRiskBanner />}

        {message.status === "done" && message.confidence && (
          <div className="mt-2">
            <ConfidenceChip confidence={message.confidence} />
          </div>
        )}

        {message.status === "done" && message.citations?.length ? (
          <CitationList citations={message.citations} />
        ) : null}
      </div>
    </div>
  );
});
