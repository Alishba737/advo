"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Square, Mic, FileText, X, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { transcribeAudio } from "@/lib/api";
import { useSpeechRecorder } from "@/lib/use-speech-recorder";
import { cn } from "@/lib/utils";

export interface AttachedDoc {
  id: string;
  filename: string;
}

/** Chat message composer: textarea, send/stop, doc chip, mic + speech-to-text. */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  disabled,
  attachedDoc,
  onRemoveDoc,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  attachedDoc: AttachedDoc | null;
  onRemoveDoc: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { recording, error: micError, start, stop, cancel } = useSpeechRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!streaming && value.trim()) onSubmit();
    }
  };

  const handleMicClick = async () => {
    if (transcribing) return;
    setSttError(null);
    if (recording) {
      const pcm = stop();
      if (!pcm) return;
      setTranscribing(true);
      try {
        const { text } = await transcribeAudio(pcm);
        if (text) {
          onChange(value ? `${value} ${text}`.trim() : text);
          textareaRef.current?.focus();
        } else {
          setSttError("No speech detected — try again.");
        }
      } catch (err) {
        setSttError(err instanceof Error ? err.message : "Transcription failed");
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

  // Escape cancels an in-progress recording
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, cancel]);

  const micLabel = transcribing
    ? "Transcribing..."
    : recording
      ? "Stop recording (Esc to cancel)"
      : "Voice input";

  return (
    <div className="border-t bg-background/95 backdrop-blur">
      <div className="mx-auto w-full max-w-3xl px-4 py-3 sm:px-6">
        {attachedDoc && (
          <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs">
            <FileText className="size-3.5 shrink-0 text-primary" />
            <span className="truncate font-medium">{attachedDoc.filename}</span>
            <span className="text-muted-foreground">attached</span>
            <button
              type="button"
              onClick={onRemoveDoc}
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label="Detach document"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/30">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a legal question..."
            rows={1}
            disabled={disabled}
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={recording || transcribing ? "destructive" : "ghost"}
                  size="icon"
                  onClick={handleMicClick}
                  disabled={disabled || streaming}
                  aria-label={micLabel}
                  className={cn(recording && "animate-pulse")}
                >
                  {transcribing ? <Loader2 className="animate-spin" /> : <Mic />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{micLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {streaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={onSubmit}
              disabled={disabled || !value.trim()}
              aria-label="Send message"
            >
              <ArrowUp />
            </Button>
          )}
        </div>

        {(recording || transcribing || micError || sttError) && (
          <p
            className={cn(
              "mt-1.5 text-center text-[11px]",
              micError || sttError ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {micError ??
              sttError ??
              (recording
                ? "Listening… click the mic again to transcribe."
                : "Transcribing your voice…")}
          </p>
        )}

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          ADVO can make mistakes — verify citations before relying on them.
        </p>
      </div>
    </div>
  );
}
