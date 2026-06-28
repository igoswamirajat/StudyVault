import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type Note, type Resource } from "@/db/schema";
import type { Editor } from "@tiptap/react";
import { TipTapEditor } from "./TipTapEditor";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Clock, Sparkles, FileText, Link2, BookmarkPlus } from "lucide-react";
import {
  createNote,
  updateNote,
  deleteNote,
  getOrCreateSummary,
  appendHighlightToSummary,
  findBacklinks,
} from "@/services/notesService";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { onHighlight, onViewerState } from "@/lib/viewer-bus";
import { Link as RouterLink } from "@tanstack/react-router";

interface Props {
  resource: Resource | null;
  resourceId: string | null;
  dayNumber: number | null;
  onSeekVideo?: (sec: number) => void;
  getVideoTime?: () => number | null;
}

type TabKey = "summary" | "notes" | "day" | "all";

export function NotesPanel({ resource, resourceId, dayNumber, onSeekVideo, getVideoTime }: Props) {
  const [tab, setTab] = useState<TabKey>("summary");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [page, setPage] = useState<number | undefined>();
  const editorRef = useRef<Editor | null>(null);
  const timerRef = useRef<number | null>(null);

  // Ensure a summary note exists for this resource
  useEffect(() => {
    if (!resource) {
      setSummaryId(null);
      return;
    }
    let cancelled = false;
    void getOrCreateSummary(resource).then((n) => {
      if (!cancelled) setSummaryId(n.id);
    });
    return () => {
      cancelled = true;
    };
  }, [resource]);

  // Track viewer page from PDF
  useEffect(() => {
    return onViewerState((s) => {
      if (resourceId && s.resourceId === resourceId && s.page != null) setPage(s.page);
    });
  }, [resourceId]);

  // Listen for "Save to Summary" highlights from viewers
  useEffect(() => {
    return onHighlight(async (p) => {
      if (!resourceId || p.resourceId !== resourceId) return;
      await appendHighlightToSummary(p.resourceId, p.text, { page: p.page, time: p.time ?? null });
      setTab("summary");
    });
  }, [resourceId]);

  // Live queries
  const summary = useLiveQuery(
    () => (summaryId ? getDb().notes.get(summaryId) : Promise.resolve(undefined as Note | undefined)),
    [summaryId],
  ) as Note | undefined;


  const resourceNotes = (useLiveQuery(
    () =>
      resourceId
        ? getDb()
            .notes.where("resourceId")
            .equals(resourceId)
            .filter((n) => !n.isSummary)
            .reverse()
            .sortBy("updatedAt")
        : Promise.resolve([] as Note[]),
    [resourceId],
  ) ?? []) as Note[];

  const dayNotes = (useLiveQuery(
    () =>
      dayNumber != null
        ? getDb().notes.where("dayNumber").equals(dayNumber).reverse().sortBy("updatedAt")
        : Promise.resolve([] as Note[]),
    [dayNumber],
  ) ?? []) as Note[];

  const allNotes = (useLiveQuery(() => getDb().notes.orderBy("updatedAt").reverse().toArray(), []) ?? []) as Note[];

  const list = tab === "notes" ? resourceNotes : tab === "day" ? dayNotes : tab === "all" ? allNotes : [];
  const active = useMemo(() => list.find((n) => n.id === activeId) ?? list[0] ?? null, [list, activeId]);

  // Backlinks for the current resource (search other notes for [[Resource Name]])
  const [backlinks, setBacklinks] = useState<Note[]>([]);
  useEffect(() => {
    if (!resource || tab !== "summary") {
      setBacklinks([]);
      return;
    }
    let cancelled = false;
    void findBacklinks(resource.name, summaryId ?? undefined).then((b) => {
      if (!cancelled) setBacklinks(b);
    });
    return () => {
      cancelled = true;
    };
  }, [resource, summaryId, tab, summary?.updatedAt]);

  async function handleNew() {
    const linkedTimestamp = tab === "notes" && getVideoTime ? getVideoTime() : null;
    const n = await createNote({
      resourceId: tab === "notes" ? resourceId : null,
      dayNumber: tab === "day" ? dayNumber : null,
      isGlobal: tab === "all",
      title:
        linkedTimestamp != null
          ? `📌 Note at ${Math.floor(linkedTimestamp / 60)}:${String(Math.floor(linkedTimestamp % 60)).padStart(2, "0")}`
          : "Untitled",
      linkedTimestamp: linkedTimestamp ?? null,
    });
    setActiveId(n.id);
  }

  function scheduleSave(id: string, json: string, md: string) {
    setSaved(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      await updateNote(id, { content: json, contentMarkdown: md });
      setSaved(true);
    }, 600);
  }

  async function handleDelete() {
    if (!active) return;
    if (!window.confirm("Delete this note?")) return;
    await deleteNote(active.id);
    setActiveId(null);
  }

  // Helpers for the Summary editor toolbar
  function insertText(text: string) {
    const ed = editorRef.current;
    if (!ed) return;
    ed.chain().focus().insertContent(text).run();
  }
  function insertTimestamp() {
    const t = getVideoTime?.();
    if (t == null) return;
    insertText(`[${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}] `);
  }
  function insertPage() {
    if (page == null) return;
    insertText(`(p.${page}) `);
  }
  function insertLink() {
    if (!resource) return;
    const name = window.prompt("Link to resource name (use [[name]] syntax):", resource.name);
    if (name) insertText(`[[${name}]] `);
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
          <TabsList className="h-8 bg-transparent">
            <TabsTrigger value="summary" className="gap-1 text-xs" disabled={!resource}>
              <Sparkles className="size-3" /> Summary
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs" disabled={!resourceId}>
              Notes
            </TabsTrigger>
            <TabsTrigger value="day" className="text-xs" disabled={dayNumber == null}>
              Day
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
          </TabsList>
          {tab !== "summary" && (
            <Button size="sm" variant="ghost" onClick={handleNew}>
              <Plus className="size-3.5" />
            </Button>
          )}
        </div>

        {/* SUMMARY TAB */}
        <TabsContent value="summary" className="flex flex-1 flex-col overflow-y-auto p-0">
          {summary ? (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center gap-1">
                {getVideoTime && (
                  <Button size="sm" variant="outline" onClick={insertTimestamp} className="h-7 text-[11px]">
                    <Clock className="mr-1 size-3" /> Timestamp
                  </Button>
                )}
                {page != null && (
                  <Button size="sm" variant="outline" onClick={insertPage} className="h-7 text-[11px]">
                    <FileText className="mr-1 size-3" /> Page {page}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={insertLink} className="h-7 text-[11px]">
                  <Link2 className="mr-1 size-3" /> [[link]]
                </Button>
                <span className="ml-auto text-[10px] text-muted-foreground">{saved ? "Saved" : "Saving…"}</span>
              </div>

              <TipTapEditor
                key={summary.id}
                value={summary.content}
                onChange={(json, md) => scheduleSave(summary.id, json, md)}
                onReady={(ed) => (editorRef.current = ed)}
                placeholder="Capture takeaways, highlights, and connections here…"
                maxHeightClassName="max-h-[45vh]"
              />

              {/* Backlinks */}
              <div className="border-t border-border pt-3">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Linked from
                </p>
                {backlinks.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    No backlinks yet. Use <span className="font-mono">[[{resource?.name}]]</span> in any other note to
                    link here.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {backlinks.map((b) => (
                      <li key={b.id} className="text-xs">
                        {b.resourceId ? (
                          <RouterLink
                            to="/study/$resourceId"
                            params={{ resourceId: b.resourceId }}
                            className="text-foreground underline-offset-2 hover:underline"
                          >
                            <BookmarkPlus className="mr-1 inline size-3" />
                            {b.title}
                          </RouterLink>
                        ) : (
                          <span className="text-muted-foreground">{b.title}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground">
                Updated {formatDistanceToNow(summary.updatedAt)} ago · Highlights from the viewer land here
                automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
              {resource ? "Preparing summary…" : "Open a resource to see its Summary."}
            </div>
          )}
        </TabsContent>

        {/* LIST-STYLE TABS */}
        {(["notes", "day", "all"] as TabKey[]).map((k) => (
          <TabsContent key={k} value={k} className="flex flex-1 flex-col overflow-hidden p-0">
            <div className="flex h-32 shrink-0 flex-col gap-0.5 overflow-y-auto border-b border-border p-2">
              {list.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">No notes here yet. Click + to start typing.</p>
              )}
              {list.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  className={`flex items-center justify-between rounded px-2 py-1 text-left text-xs ${
                    active?.id === n.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60"
                  }`}
                >
                  <span className="truncate">{n.title || "Untitled"}</span>
                  {n.linkedTimestamp != null && onSeekVideo && (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeekVideo(n.linkedTimestamp ?? 0);
                      }}
                      className="ml-2 flex items-center gap-0.5 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] text-primary"
                    >
                      <Clock className="size-2.5" />
                      {Math.floor(n.linkedTimestamp / 60)}:
                      {String(Math.floor(n.linkedTimestamp % 60)).padStart(2, "0")}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {active ? (
              <div className="flex flex-1 flex-col overflow-y-auto p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <input
                    value={active.title}
                    onChange={(e) => updateNote(active.id, { title: e.target.value })}
                    className="min-w-0 flex-1 truncate bg-transparent text-sm font-semibold focus:outline-none"
                    placeholder="Title"
                  />
                  <span className="shrink-0 text-[10px] text-muted-foreground">{saved ? "Saved" : "Saving…"}</span>
                  <Button size="icon" variant="ghost" onClick={handleDelete} aria-label="Delete">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <TipTapEditor
                  key={active.id}
                  value={active.content}
                  onChange={(json, md) => scheduleSave(active.id, json, md)}
                  maxHeightClassName="max-h-[40vh]"
                />
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Updated {formatDistanceToNow(active.updatedAt)} ago
                </p>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
                Select a note or click + to create one.
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
