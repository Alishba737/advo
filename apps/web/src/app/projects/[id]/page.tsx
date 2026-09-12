"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  FileText,
  Loader2,
  Trash2,
  Upload,
  Save,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchSessions, newSessionId, type SessionInfo } from "@/lib/api";
import {
  getProject,
  updateProject,
  addProjectDocument,
  removeProjectDocument,
  formatWhen,
  type Project,
  type ProjectDocument,
} from "@/lib/projects-api";
import { rememberSessionProject, getProjectSessions } from "@/lib/session-projects";

function ProjectDetailPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get("session");

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [description, setDescription] = useState("");
  const [saved, setSaved] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [prompt, setPrompt] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProject(id)
      .then((p) => {
        if (cancelled) return;
        if (!p) {
          router.push("/projects");
          return;
        }
        setProject(p);
        setInstructions(p.instructions ?? "");
        setDescription(p.description ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        alert(err instanceof Error ? err.message : "Failed to load project");
        router.push("/projects");
      })
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const loadSessions = () => {
    fetchSessions()
      .then((all) => {
        const projectSessionIds = new Set(getProjectSessions(id));
        const projectSessions = all
          .filter((s) => projectSessionIds.has(s.id))
          .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
        setSessions(projectSessions);
      })
      .catch(() => setSessions([]));
  };

  useEffect(() => {
    loadSessions();
  }, [id]);

  const handleSave = async () => {
    if (!project) return;
    try {
      const updated = await updateProject(id, { description, instructions });
      if (updated) {
        setProject(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;
    setUploading(true);
    try {
      const updated = await addProjectDocument(project.id, file);
      if (updated) setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveDoc = async (docId: string) => {
    if (!project) return;
    try {
      const updated = await removeProjectDocument(project.id, docId);
      if (updated) setProject(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Remove failed");
    }
  };

  const startChat = (text?: string) => {
    if (!project) return;
    const sessionId = newSessionId();
    rememberSessionProject(sessionId, project.id);
    const url = new URL("/", window.location.origin);
    url.searchParams.set("project", project.id);
    url.searchParams.set("session", sessionId);
    if (text?.trim()) url.searchParams.set("prompt", text.trim());
    router.push(url.pathname + url.search);
  };

  const handleSend = () => {
    if (!prompt.trim()) return;
    startChat(prompt);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="flex h-full">
      {/* Main hub */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/projects" className="hover:text-foreground">
              Projects
            </Link>
            <span>/</span>
            <span className="text-foreground">{project.name}</span>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Project description / goal"
              className="mt-2 border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
            />
          </div>

          {/* Composer */}
          <div className="mb-8 rounded-[1.5rem] border border-border bg-card p-3 shadow-lg">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="How can ADVO help you with this project?"
              rows={2}
              className="w-full resize-none border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                Project context is active
              </span>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!prompt.trim()}
                className="h-8 gap-1 rounded-full px-3 text-xs"
              >
                <ArrowUp className="size-3.5" />
                Chat
              </Button>
            </div>
          </div>

          {/* Recents */}
          <div>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recents</h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No chats yet. Type a message above to start one.
              </p>
            ) : (
              <div className="space-y-1">
                {sessions.map((s) => (
                  <Link
                    key={s.id}
                    href={`/?project=${encodeURIComponent(project.id)}&session=${encodeURIComponent(s.id)}`}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors",
                      activeSessionId === s.id
                        ? "bg-secondary text-foreground"
                        : "hover:bg-muted/70",
                    )}
                  >
                    <span className="text-sm">{s.title || "Untitled chat"}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatWhen(s.updated)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar: Instructions + Context */}
      <aside className="hidden w-80 border-l border-border bg-card/30 px-4 py-6 lg:block">
        {/* Instructions */}
        <div className="mb-6 rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Instructions</h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleSave}
              className="h-7 gap-1 text-xs"
            >
              <Save className="size-3" />
              {saved ? "Saved" : "Save"}
            </Button>
          </div>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Add custom instructions for this project..."
            rows={6}
            className="resize-none bg-transparent text-sm"
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Included in every chat inside this project.
          </p>
        </div>

        {/* Context */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Context</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || project.documents.length >= 5}
              className="h-7 gap-1 text-xs"
            >
              {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
              Upload
            </Button>
          </div>

          {project.documents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <FileText className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No documents yet</p>
              <p className="text-xs text-muted-foreground">
                Upload PDFs, DOCX, or TXT files to ground the chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {project.documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} onRemove={() => handleRemoveDoc(doc.id)} />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}>
      <ProjectDetailPageContent />
    </Suspense>
  );
}

function DocumentRow({ doc, onRemove }: { doc: ProjectDocument; onRemove: () => void }) {
  return (
    <div className="group flex items-start gap-2.5 rounded-lg border border-border bg-card p-3">
      <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">{doc.filename}</p>
        <p className="text-[10px] text-muted-foreground">{doc.text_length.toLocaleString()} chars</p>
        <p className="text-[10px] text-muted-foreground">Uploaded {formatWhen(doc.uploadedAt)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        aria-label="Remove document"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
