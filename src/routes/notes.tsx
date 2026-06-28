import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type Note } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search, Trash2, FileText, Download } from "lucide-react";
import { createNote, updateNote, deleteNote } from "@/services/notesService";
import { TipTapEditor } from "@/components/notes/TipTapEditor";
import { formatDistanceToNow } from "date-fns";
import { saveAs } from "file-saver";
import { useRef } from "react";

export const Route = createFileRoute("/notes")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <NotesPage />
    </ClientOnly>
  ),
});

function NotesPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [savedAt, setSavedAt] = useState<number>(Date.now());
  const debRef = useRef<number | null>(null);

  const notes = useLiveQuery(() => getDb().notes.orderBy("updatedAt").reverse().toArray(), [], [] as Note[]);
  const filtered = useMemo(() => {
    if (!q.trim()) return notes;
    const s = q.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(s) || n.contentMarkdown.toLowerCase().includes(s));
  }, [notes, q]);

  const active = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId]);

  async function handleNew() {
    const n = await createNote({ title: "Untitled", isGlobal: true });
    setActiveId(n.id);
  }

  function handleChange(json: string, md: string) {
    if (!active) return;
    if (debRef.current) window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(async () => {
      await updateNote(active.id, { content: json, contentMarkdown: md });
      setSavedAt(Date.now());
    }, 800);
  }

  async function handleDelete() {
    if (!active) return;
    if (!window.confirm("Delete this note?")) return;
    await deleteNote(active.id);
    setActiveId(null);
  }

  function exportNote() {
    if (!active) return;
    const md = `# ${active.title}\n\n${active.contentMarkdown}`;
    saveAs(new Blob([md], { type: "text/markdown" }), `${active.title || "note"}.md`);
  }

  return (
    <div className="grid h-[calc(100vh-48px)] grid-cols-[320px_1fr]">
      <aside className="flex flex-col border-r border-border bg-surface-1/40">
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Notes</h2>
            <Button size="sm" variant="ghost" onClick={handleNew}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-7 text-xs" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No notes yet.</p>
          )}
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className={`mb-0.5 flex w-full items-start gap-2 rounded p-2 text-left text-xs ${
                active?.id === n.id ? "bg-accent" : "hover:bg-accent/60"
              }`}
            >
              <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{n.title || "Untitled"}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {n.contentMarkdown.slice(0, 60) || "Empty note"}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(n.updatedAt)} ago
                </p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex flex-col overflow-hidden">
        {active ? (
          <>
            <div className="flex items-center justify-between border-b border-border p-3">
              <input
                value={active.title}
                onChange={(e) => updateNote(active.id, { title: e.target.value })}
                className="flex-1 bg-transparent text-lg font-semibold focus:outline-none"
                placeholder="Note title"
              />
              <span className="mx-3 text-xs text-muted-foreground">
                Saved {formatDistanceToNow(savedAt)} ago
              </span>
              <Button size="sm" variant="ghost" onClick={exportNote}>
                <Download className="mr-1 size-3.5" /> Export
              </Button>
              <Button size="icon" variant="ghost" onClick={handleDelete} aria-label="Delete note">
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <TipTapEditor value={active.content} onChange={handleChange} maxHeightClassName="max-h-[65vh]" />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <FileText className="mb-3 size-10" />
            <p className="mb-3 text-sm">Select a note or create a new one.</p>
            <Button onClick={handleNew}>
              <Plus className="mr-1 size-4" /> New note
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
