"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, BookOpen, ExternalLink, Loader2 } from "lucide-react";

import { fetchLaws, type LawCategory, type LawAct } from "@/lib/api";

export default function LawsPage() {
  const [data, setData] = useState<LawCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchLaws()
      .then((library) => setData(library.categories))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return data;
    return data
      .map((cat) => ({
        ...cat,
        acts: cat.acts.filter(
          (act) =>
            act.name.toLowerCase().includes(q) ||
            act.year.includes(q) ||
            act.category.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.name.toLowerCase().includes(q) || cat.acts.length > 0);
  }, [data, query]);

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Law Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Official sources for Pakistani statutes
        </p>
      </div>

      {/* Search */}
      <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search acts by name or year…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Content */}
      <div className="mt-6 space-y-7 pb-8">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading law library…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No results found for &quot;{query}&quot;
          </p>
        )}

        {filtered.map((cat) => (
          <section key={cat.name}>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <BookOpen className="size-3.5" />
              {cat.name}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.acts.map((act) => (
                <ActCard key={act.name} act={act} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ActCard({ act }: { act: LawAct }) {
  return (
    <a
      href={act.official_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40"
    >
      <h3 className="text-sm font-medium text-foreground">{act.name}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {act.year || "Year unknown"} · {act.category}
      </p>
      <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-primary">
        <ExternalLink className="size-3" />
        View official source
      </div>
    </a>
  );
}
