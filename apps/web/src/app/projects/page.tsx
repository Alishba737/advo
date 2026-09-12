"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Plus, FileText, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRole } from "@/components/providers/role-provider";
import {
  fetchProjects,
  deleteProject,
  formatWhen,
  type Project,
} from "@/lib/projects-api";

export default function ProjectsPage() {
  const { mode } = useRole();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await fetchProjects(mode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [mode]);

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize documents and chat sessions around your legal matters.
          </p>
        </div>
        <Button asChild className="gap-1.5">
          <Link href="/projects/new">
            <Plus className="size-4" />
            New Project
          </Link>
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Project list */}
      <div className="mt-6 space-y-3 pb-8">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
            <FolderOpen className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No projects yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a project to bundle reference documents with chat sessions.
            </p>
          </div>
        )}

        {projects.map((p) => (
          <div
            key={p.id}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderOpen className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-medium">{p.name}</h3>
              <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="size-3" />
                  {p.documents.length} documents
                </span>
                <span>· Updated {formatWhen(p.updatedAt)}</span>
              </p>
            </div>
            <Link
              href={`/projects/${p.id}`}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground"
            >
              Open
            </Link>
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label={`Delete ${p.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Create dialog */}
    </div>
  );
}
