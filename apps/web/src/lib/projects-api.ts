/** ADVO Projects API client — backed by the FastAPI project store. */

import { API_BASE, type UserMode } from "@/lib/api";

export interface ProjectDocument {
  id: string;
  filename: string;
  text_length: number;
  preview: string;
  uploadedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  role: UserMode;
  documents: ProjectDocument[];
  createdAt: string;
  updatedAt: string;
}

function toCamelCaseProject(raw: Record<string, unknown>): Project {
  const docs = ((raw.documents as Record<string, unknown>[]) || []).map((d) => ({
    id: String(d.id),
    filename: String(d.filename),
    text_length: Number(d.text_length),
    preview: String(d.preview),
    uploadedAt: String(d.uploaded_at),
  }));
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: raw.description ? String(raw.description) : undefined,
    instructions: raw.instructions ? String(raw.instructions) : undefined,
    role: String(raw.role) as UserMode,
    documents: docs,
    createdAt: String(raw.created_at),
    updatedAt: String(raw.updated_at),
  };
}

export async function fetchProjects(role?: UserMode): Promise<Project[]> {
  const url = new URL(`${API_BASE}/projects`);
  if (role) url.searchParams.set("role", role);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch projects (${res.status})`);
  const body = (await res.json()) as { projects: Record<string, unknown>[] };
  return body.projects.map(toCamelCaseProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch project (${res.status})`);
  const body = (await res.json()) as Record<string, unknown>;
  return toCamelCaseProject(body);
}

export async function createProject(
  name: string,
  role: UserMode,
  description?: string,
  instructions?: string,
): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, role, description, instructions }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Create project failed (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return toCamelCaseProject(data);
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, "name" | "description" | "instructions">>,
): Promise<Project | null> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.instructions !== undefined) payload.instructions = updates.instructions;

  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Update project failed (${res.status})`);
  const data = (await res.json()) as Record<string, unknown>;
  return toCamelCaseProject(data);
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete project failed (${res.status})`);
}

export async function addProjectDocument(projectId: string, file: File): Promise<Project> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(projectId)}/documents`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Upload failed (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return toCamelCaseProject(data);
}

export async function removeProjectDocument(projectId: string, documentId: string): Promise<Project | null> {
  const res = await fetch(
    `${API_BASE}/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
    { method: "DELETE" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Remove document failed (${res.status})`);
  const data = (await res.json()) as Record<string, unknown>;
  return toCamelCaseProject(data);
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
