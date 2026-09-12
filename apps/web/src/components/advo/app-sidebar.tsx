"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Scale,
  User,
  GraduationCap,
  Plus,
  BookOpen,
  FolderOpen,
  Settings,
  Trash2,
  ChevronDown,
  Search,
  PanelLeft,
  PanelRight,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useRole, type UserMode } from "@/components/providers/role-provider";
import {
  fetchSessions,
  newSessionId,
  deleteSession,
  type SessionInfo,
} from "@/lib/api";
import { fetchProjects, formatWhen, type Project } from "@/lib/projects-api";
import {
  getSessionProject,
  getProjectSessions,
  removeSessionProject,
} from "@/lib/session-projects";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ROLE_TABS: Array<{
  key: UserMode;
  label: string;
  icon: typeof User;
}> = [
  { key: "citizen", label: "Citizen", icon: User },
  { key: "student", label: "Student", icon: GraduationCap },
  { key: "lawyer", label: "Lawyer", icon: Scale },
];





const SESSION_MODE_KEY = "advo-session-modes";

function getSessionModes(): Record<string, UserMode> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_MODE_KEY) ?? "{}") as Record<
      string,
      UserMode
    >;
  } catch {
    return {};
  }
}

function setSessionMode(sessionId: string, mode: UserMode) {
  if (typeof window === "undefined") return;
  const modes = getSessionModes();
  modes[sessionId] = mode;
  window.localStorage.setItem(SESSION_MODE_KEY, JSON.stringify(modes));
}

function SidebarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar() {
  const { mode, setMode } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get("session");
  const activeProjectId = searchParams.get("project");
  const [collapsed, setCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("advo-sidebar") : null;
    if (stored === "collapsed") setCollapsed(true);
  }, []);

  // Load sessions from backend
  useEffect(() => {
    setSessionsLoading(true);
    fetchSessions()
      .then((data) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  // Refresh sessions when window regains focus (after a chat in another tab)
  useEffect(() => {
    const onFocus = () => {
      fetchSessions().then(setSessions).catch(() => {});
      fetchProjects(mode).then(setProjects).catch(() => setProjects([]));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [mode]);

  // Load projects for current role
  useEffect(() => {
    fetchProjects(mode).then(setProjects).catch(() => setProjects([]));
  }, [mode]);

  // Refresh sessions/projects when the active chat/project changes so a newly
  // started project chat appears without a manual refresh.
  useEffect(() => {
    fetchSessions().then(setSessions).catch(() => {});
    fetchProjects(mode).then(setProjects).catch(() => setProjects([]));
  }, [activeSessionId, activeProjectId, mode]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("advo-sidebar", next ? "collapsed" : "expanded");
      }
      return next;
    });
  };

  const startNewChat = () => {
    const id = newSessionId();
    setSessionMode(id, mode);
    // Navigate with explicit session so page.tsx opens a fresh chat
    if (typeof window !== "undefined") {
      window.location.href = `/?session=${encodeURIComponent(id)}`;
    }
  };

  const switchRole = (newMode: UserMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    const id = newSessionId();
    setSessionMode(id, newMode);
    if (typeof window !== "undefined") {
      window.location.href = `/?session=${encodeURIComponent(id)}`;
    }
  };

  const sessionModes = getSessionModes();
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase());
    const sessionMode = sessionModes[s.id];
    // Show sessions created in this role, plus untagged sessions (back-compat)
    const matchesRole = !sessionMode || sessionMode === mode;
    return matchesSearch && matchesRole;
  });

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <TooltipProvider>
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
          collapsed ? "w-16 items-center px-2" : "w-64 px-0",
        )}
      >
        {collapsed ? (
          // ────────────────────────────────
          // Collapsed rail
          // ────────────────────────────────
          <>
            {/* Brand icon + expand toggle */}
            <div className="flex h-14 items-center justify-center">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Expand sidebar"
              >
                <PanelRight className="size-4" />
              </button>
            </div>

            {/* New chat icon */}
            <SidebarTooltip label="New chat">
              <button
                type="button"
                onClick={startNewChat}
                className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:border-primary/50 hover:bg-secondary"
              >
                <Plus className="size-4" />
              </button>
            </SidebarTooltip>

            {/* Role icons */}
            <div className="mt-3 flex w-full flex-col items-center gap-2">
              {ROLE_TABS.map((role) => {
                const Icon = role.icon;
                const active = mode === role.key;
                return (
                  <SidebarTooltip key={role.key} label={role.label}>
                    <button
                      type="button"
                      onClick={() => switchRole(role.key)}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-lg transition-colors",
                        active
                          ? "bg-card text-primary shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  </SidebarTooltip>
                );
              })}
            </div>

            {/* Shared nav */}
            <div className="mt-4 flex w-full flex-col items-center gap-2">
              {mode === "lawyer" && (
                <SidebarTooltip label="Law Library">
                  <Link
                    href="/laws"
                    className="flex size-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <BookOpen className="size-4" />
                  </Link>
                </SidebarTooltip>
              )}
              <SidebarTooltip label="Projects">
                <Link
                  href="/projects"
                  className="flex size-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <FolderOpen className="size-4" />
                </Link>
              </SidebarTooltip>
            </div>

            <div className="flex-1" />

            {/* User avatar */}
            <div className="mb-3">
              <SidebarTooltip label="Zain · Free plan">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  Z
                </span>
              </SidebarTooltip>
            </div>
          </>
        ) : (
          // ────────────────────────────────
          // Expanded sidebar
          // ────────────────────────────────
          <>
            {/* Brand + collapse toggle */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Scale className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-tight">ADVO</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    AI Legal Assistant · Pakistan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="size-4" />
              </button>
            </div>

            {/* Role tabs */}
            <div className="flex gap-1 px-3 pb-3">
              {ROLE_TABS.map((role) => {
                const Icon = role.icon;
                const active = mode === role.key;
                return (
                  <button
                    key={role.key}
                    type="button"
                    onClick={() => switchRole(role.key)}
                    className={cn(
                      "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition-colors",
                      active
                        ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
                    {role.label}
                  </button>
                );
              })}
            </div>

            {/* New chat */}
            <div className="px-3 pb-2">
              <button
                type="button"
                onClick={startNewChat}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-secondary"
              >
                <Plus className="size-4" />
                New chat
              </button>
            </div>

            {/* Search */}
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
                <Search className="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search chats…"
                  className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Nav */}
            <nav className="px-3">
              <p className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Workspace
              </p>
              <div className="space-y-0.5">
                {mode === "lawyer" && (
                  <Link
                    href="/laws"
                    className="sidebar-item flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-foreground/80"
                  >
                    <BookOpen className="size-3.5 text-muted-foreground" />
                    Law Library
                  </Link>
                )}
              </div>
            </nav>

            {/* Projects */}
            <div className="mt-4 flex min-h-0 shrink-0 flex-col px-3">
              <div className="flex items-center justify-between rounded px-1 pb-1.5">
                <button
                  type="button"
                  onClick={() => setProjectsOpen((v) => !v)}
                  className="flex flex-1 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <FolderOpen className="size-3" />
                  Projects
                  <ChevronDown
                    className={cn("size-3 transition-transform", !projectsOpen && "-rotate-90")}
                  />
                </button>
                <Link
                  href="/projects/new"
                  className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="New project"
                >
                  <Plus className="size-3" />
                </Link>
              </div>
              {projectsOpen && (
                <div className="-mx-1 space-y-0.5">
                  {filteredProjects.length === 0 && (
                    <p className="px-2 py-2 text-[11px] text-muted-foreground">
                      No projects yet
                    </p>
                  )}
                  <ProjectTree
                    projects={filteredProjects}
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    activeProjectId={activeProjectId}
                    onChange={() => {
                      fetchSessions().then(setSessions).catch(() => {});
                    }}
                  />
                </div>
              )}
            </div>

            {/* History */}
            <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center justify-between rounded px-1 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <span>Recent chats</span>
                <ChevronDown
                  className={cn("size-3 transition-transform", !historyOpen && "-rotate-90")}
                />
              </button>
              {historyOpen && (
                <div className="-mx-1 flex-1 space-y-0.5 overflow-y-auto pb-2">
                  {sessionsLoading ? (
                    <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Loading chats…
                    </div>
                  ) : filteredSessions.length === 0 ? (
                    <p className="px-2 py-3 text-[11px] text-muted-foreground">
                      No conversations yet
                    </p>
                  ) : (
                    filteredSessions.map((h) => (
                      <Link
                        key={h.id}
                        href={`/?session=${h.id}`}
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                          activeSessionId === h.id && !activeProjectId
                            ? "bg-secondary text-foreground"
                            : "text-foreground/75 hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] text-foreground/75">
                            {h.title || "Untitled chat"}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {formatWhen(h.updated)} · {h.message_count} messages
                          </span>
                        </span>
                        <Trash2 className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100" />
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Footer / user */}
            <div className="border-t border-sidebar-border p-3">
              <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 sidebar-item">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                  Z
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">Zain</p>
                  <p className="truncate text-[10px] text-muted-foreground">Free plan</p>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </TooltipProvider>
  );
}

function ProjectTree({
  projects,
  sessions,
  activeSessionId,
  activeProjectId,
  onChange,
}: {
  projects: Project[];
  sessions: SessionInfo[];
  activeSessionId: string | null;
  activeProjectId: string | null;
  onChange?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (activeProjectId) initial.add(activeProjectId);
    return initial;
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;
    try {
      await deleteSession(sessionId);
      removeSessionProject(sessionId);
      onChange?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-1">
      {projects.map((project) => {
        const projectSessionIds = getProjectSessions(project.id);
        const projectSessions: SessionInfo[] = [];
        for (const sid of projectSessionIds) {
          const s = sessionMap.get(sid);
          if (s) {
            projectSessions.push(s);
          } else if (sid === activeSessionId) {
            // Session was just created and the backend hasn't persisted metadata
            // yet; show a pending placeholder so it appears without a refresh.
            projectSessions.push({
              id: sid,
              title: "New chat",
              message_count: 0,
              updated: new Date().toISOString(),
            });
          }
        }
        projectSessions.sort(
          (a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime(),
        );

        const hasActiveSession = projectSessions.some((s) => s.id === activeSessionId);
        const isExpanded = expanded.has(project.id) || activeProjectId === project.id || hasActiveSession;
        const isProjectActive = activeProjectId === project.id;

        return (
          <div key={project.id} className="py-0.5">
            <div
              className={cn(
                "group flex items-center gap-1 rounded-lg pr-1",
                isProjectActive && "bg-secondary",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(project.id)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={isExpanded ? "Collapse project" : "Expand project"}
              >
                <ChevronDown
                  className={cn("size-3.5 transition-transform", !isExpanded && "-rotate-90")}
                />
              </button>
              <Link
                href={`/projects/${project.id}`}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                  isProjectActive
                    ? "text-foreground"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground",
                )}
              >
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                <span className="block truncate text-[13px]">{project.name}</span>
              </Link>
            </div>
            {isExpanded && (
              <div className="ml-3 mt-1 border-l border-border pl-3">
                {projectSessions.length === 0 && (
                  <p className="px-2 py-2 text-[11px] text-muted-foreground">No chats yet</p>
                )}
                {projectSessions.map((s) => {
                  const active = s.id === activeSessionId;
                  const pending = !sessionMap.has(s.id);
                  return (
                    <Link
                      key={s.id}
                      href={`/?project=${encodeURIComponent(project.id)}&session=${encodeURIComponent(s.id)}`}
                      className={cn(
                        "group flex items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-foreground/70 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          pending ? "bg-muted-foreground/50" : "bg-amber-400",
                        )}
                      />
                      <span
                        className={cn(
                          "block flex-1 truncate text-[12px]",
                          pending && "italic text-muted-foreground",
                        )}
                      >
                        {s.title || "Untitled chat"}
                      </span>
                      {!pending && (
                        <Trash2
                          onClick={(e) => handleDelete(e, s.id)}
                          className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <Link
        href="/projects"
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <span className="text-primary">+</span> View all projects
      </Link>
    </div>
  );
}
