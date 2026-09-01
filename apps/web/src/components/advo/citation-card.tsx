"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, ChevronDown, ShieldCheck } from "lucide-react";

import type { Citation } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Grounding status badge for one citation. */
function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
      title="This section was found in the retrieved legal sources"
    >
      <ShieldCheck className="size-3" />
      Verified
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
      title="Not found in the retrieved sources — verify independently before relying on this citation"
    >
      <AlertTriangle className="size-3" />
      Unverified
    </span>
  );
}

/** Collapsible source card for one citation (act + section). */
function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  const [open, setOpen] = useState(false);
  const hasSnippet = Boolean(citation.text_snippet?.trim());
  const showBadge = citation.verified === true || citation.verified === false;

  return (
    <div
      data-slot="citation-card"
      className="overflow-hidden rounded-lg border bg-muted/30 text-xs"
    >
      <button
        type="button"
        onClick={() => hasSnippet && setOpen((v) => !v)}
        disabled={!hasSnippet}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left",
          hasSnippet && "hover:bg-muted/60"
        )}
      >
        <BookOpen className="size-3.5 shrink-0 text-primary" />
        <span className="font-medium">
          {citation.act_name || "Statute"}
          {citation.section ? ` — Section ${citation.section}` : ""}
        </span>
        {showBadge && (
          <span className="shrink-0">
            <VerifiedBadge verified={citation.verified === true} />
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          Source {index + 1}
        </span>
        {hasSnippet && (
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>
      {open && hasSnippet && (
        <div className="border-t px-3 py-2 text-muted-foreground leading-relaxed">
          {citation.text_snippet}
        </div>
      )}
    </div>
  );
}

/** Row of citation cards shown under a completed assistant answer. */
export function CitationList({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Sources
      </span>
      {citations.map((c, i) => (
        <CitationCard key={`${c.act_name}-${c.section}-${i}`} citation={c} index={i} />
      ))}
    </div>
  );
}
