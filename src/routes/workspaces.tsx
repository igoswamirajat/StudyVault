import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, ArrowRight, Trash2, LogIn, Sparkles } from "lucide-react";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Workspace,
  listWorkspaces,
  createWorkspace,
  setActiveWorkspace,
  deleteWorkspace,
  getActiveWorkspaceId,
} from "@/services/workspaceService";
import { resetDbCache } from "@/db/schema";
import { toast } from "sonner";

export const Route = createFileRoute("/workspaces")({
  component: () => (
    <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
      <WorkspacesPage />
    </ClientOnly>
  ),
});

function WorkspacesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = () => {
    setList(listWorkspaces());
    setActiveId(getActiveWorkspaceId());
  };
  useEffect(refresh, []);

  function open(id: string) {
    setActiveWorkspace(id);
    resetDbCache();
    const ws = listWorkspaces().find((w) => w.id === id);
    toast.success(`Switched to ${ws?.name ?? "workspace"}`);
    // Full reload so Dexie + every live query reattaches to the right DB.
    window.location.assign("/library");
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give your workspace a name");
      return;
    }
    const ws = createWorkspace(trimmed);
    setName("");
    setActiveWorkspace(ws.id);
    resetDbCache();
    toast.success(`Created ${ws.name}`);
    window.location.assign("/onboarding");
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Delete workspace "${label}" and all its data? This cannot be undone.`)) return;
    await deleteWorkspace(id);
    toast.success("Workspace deleted");
    refresh();
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-10 sm:px-8">
        <div className="mb-8 flex items-center gap-3 border-b border-border pb-5">
          <span className="grid size-11 place-items-center bg-foreground" aria-hidden="true">
            <span className="size-4 bg-primary" />
          </span>
          <div>
            <p className="text-lg font-extrabold uppercase tracking-tight">StudyVault</p>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Choose a workspace
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="border border-border bg-surface-1 p-6 shadow-[10px_10px_0_var(--foreground)] sm:p-8"
        >
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Sign in
          </p>
          <h1 className="mb-2 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            Pick or create a workspace
          </h1>
          <p className="mb-6 max-w-xl text-sm text-muted-foreground">
            Each workspace has its own Drive folder, library, notes, flashcards, and progress.
            Use separate workspaces to keep courses (or accounts) from mixing.
          </p>

          {/* Existing list */}
          {list.length > 0 && (
            <div className="mb-6 space-y-2">
              {list.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between gap-3 border border-border bg-background p-3"
                >
                  <button
                    onClick={() => open(w.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid size-9 shrink-0 place-items-center border border-border bg-surface-2 font-mono text-xs uppercase">
                      {w.name.slice(0, 2)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{w.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {w.id === activeId ? "Current · " : ""}
                        Created {new Date(w.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => open(w.id)}>
                    <LogIn className="mr-1 size-3.5" /> Open
                  </Button>
                  <button
                    onClick={() => remove(w.id, w.name)}
                    className="grid size-9 place-items-center border border-border bg-surface-1 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${w.name}`}
                    title="Delete workspace"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Create */}
          <div className="border-t border-border pt-5">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {list.length === 0 ? "Create your first workspace" : "New workspace"}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder='e.g. "DSA Cohort" or "Personal"'
                className="h-11"
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
              />
              <Button onClick={create} className="h-11" disabled={!name.trim()}>
                <Plus className="mr-1 size-4" /> Create
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </div>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <Sparkles className="mr-1 inline size-3" /> Each workspace stores data in its own
              local database. Deleting one wipes only that workspace.
            </p>
          </div>

          {activeId && list.length > 0 && (
            <div className="mt-6 flex justify-end">
              <Button variant="outline" onClick={() => navigate({ to: "/library" })}>
                Back to library
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
