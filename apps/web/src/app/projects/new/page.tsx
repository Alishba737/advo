"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/components/providers/role-provider";
import { createProject } from "@/lib/projects-api";

export default function NewProjectPage() {
  const { mode } = useRole();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const project = await createProject(name.trim(), mode, description.trim(), instructions.trim());
      router.push(`/projects/${project.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Create failed");
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto px-4 py-6 sm:px-6">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to projects
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Create project</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Organize documents and instructions around a legal matter.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Project name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tenancy Dispute Case"
            className="mt-1.5"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short goal or context for this project"
            className="mt-1.5"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground">
            Instructions
          </label>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Add custom instructions — e.g., tone, focus areas, output format..."
            rows={6}
            className="mt-1.5 resize-none"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            These instructions will be included in every chat inside this project.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => router.push("/projects")}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || creating} className="gap-1.5">
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create project
          </Button>
        </div>
      </form>
    </div>
  );
}
