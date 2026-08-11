import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Trash2,
  FolderInput,
  X,
  Tag,
  CalendarDays,
  CheckCircle2,
  Brain,
  Layers,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useFileSelection } from "@/hooks/useFileSelection";
import { trashResources, restoreResources, moveResources } from "@/services/fileOpsService";
import { MoveToFolderDialog } from "@/components/files/MoveToFolderDialog";
import { getDb } from "@/db/schema";
import { setStatus } from "@/services/progressService";
import { generateQuizForResource } from "@/services/quizService";
import { aiGenerateFlashcards, aiCanSendMedia } from "@/services/aiService";
import { buildResourceContext, gatherResourceMedia } from "@/services/aiContext";
import { addFlashcards } from "@/services/flashcardService";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function SelectionToolbar() {
  const sel = useFileSelection();
  const [moveOpen, setMoveOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleMarkComplete = useCallback(async () => {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    for (const id of ids) {
      await setStatus(id, "completed");
    }
    toast.success(`Marked ${ids.length} item${ids.length > 1 ? "s" : ""} as completed`);
    sel.clear();
  }, [sel]);

  // Keyboard shortcuts for bulk actions
  useEffect(() => {
    if (sel.count === 0) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setTagOpen(true);
      }
      if (e.key === "d" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setDayOpen(true);
      }
      if (e.key === "m" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleMarkComplete();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sel.count, sel.selected, handleMarkComplete]);

  async function handleDelete() {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    await trashResources(ids);
    const count = ids.length;
    sel.clear();
    toast(`Moved ${count} item${count > 1 ? "s" : ""} to trash`, {
      action: {
        label: "Undo",
        onClick: async () => {
          await restoreResources(ids);
          toast.success("Restored");
        },
      },
      duration: 5000,
    });
  }

  async function handleAddTags(tags: string[]) {
    const ids = Array.from(sel.selected);
    if (!ids.length || !tags.length) return;
    const db = getDb();
    await db.resources.bulkUpdate(ids.map((id) => ({ key: id, changes: { tags } })));
    toast.success(`Tagged ${ids.length} item${ids.length > 1 ? "s" : ""}`);
    setTagOpen(false);
  }

  async function handleMoveToDay(day: number | null) {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    const db = getDb();
    await db.resources.bulkUpdate(ids.map((id) => ({ key: id, changes: { dayAssignment: day } })));
    toast.success(
      day !== null
        ? `Moved ${ids.length} item${ids.length > 1 ? "s" : ""} to Day ${day}`
        : `Cleared day assignment for ${ids.length} item${ids.length > 1 ? "s" : ""}`,
    );
    setDayOpen(false);
  }

  const handleBulkQuiz = useCallback(async () => {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    setBusyAction("quiz");
    const db = getDb();
    let done = 0;
    for (const id of ids) {
      const resource = await db.resources.get(id);
      if (!resource) continue;
      try {
        await generateQuizForResource(resource, { force: true });
        done++;
        toast(`Quiz ${done}/${ids.length} ready`, { id: "bulk-quiz" });
      } catch {
        // skip failed
      }
    }
    toast.success(`${done} quiz${done !== 1 ? "zes" : ""} generated`, { id: "bulk-quiz" });
    setBusyAction(null);
    sel.clear();
  }, [sel]);

  const handleBulkFlashcards = useCallback(async () => {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    setBusyAction("flashcards");
    const db = getDb();
    let done = 0;
    for (const id of ids) {
      const resource = await db.resources.get(id);
      if (!resource) continue;
      try {
        const context = await buildResourceContext(resource, {
          maxChars: 10000,
          includeSiblings: false,
        });
        const media = (await aiCanSendMedia()) ? await gatherResourceMedia(resource) : {};
        const result = await aiGenerateFlashcards(resource.name, context, resource.type, 8, media);
        await addFlashcards(resource.id, result.cards, "ai");
        done++;
        toast(`Flashcards ${done}/${ids.length} done`, { id: "bulk-fc" });
      } catch {
        // skip failed
      }
    }
    toast.success(`${done} set${done !== 1 ? "s" : ""} of flashcards generated`, { id: "bulk-fc" });
    setBusyAction(null);
    sel.clear();
  }, [sel]);

  return (
    <>
      <AnimatePresence>
        {sel.count > 0 && (
          <motion.div
            key="selection-toolbar"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed left-1/2 top-[100px] z-50 -translate-x-1/2"
          >
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 border-2 border-foreground bg-background px-3 py-2 shadow-[4px_4px_0_var(--foreground)]">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
                {sel.count} selected
              </span>
              <div className="mx-1 h-5 w-px bg-border" />

              {/* Move to folder */}
              <button
                onClick={() => setMoveOpen(true)}
                className="inline-flex items-center gap-1 border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-foreground hover:text-background"
              >
                <FolderInput className="size-3" /> Move
              </button>

              {/* Add tags (T) */}
              <Popover open={tagOpen} onOpenChange={setTagOpen}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-foreground hover:text-background">
                    <Tag className="size-3" /> Tag
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-2">
                  <TagInput onSubmit={handleAddTags} />
                </PopoverContent>
              </Popover>

              {/* Move to day (D) */}
              <Popover open={dayOpen} onOpenChange={setDayOpen}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-foreground hover:text-background">
                    <CalendarDays className="size-3" /> Day
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-48 p-2">
                  <DayPicker onSelect={handleMoveToDay} />
                </PopoverContent>
              </Popover>

              {/* Mark complete (M) */}
              <button
                onClick={handleMarkComplete}
                className="inline-flex items-center gap-1 border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-foreground hover:text-background"
              >
                <CheckCircle2 className="size-3" /> Done
              </button>

              {/* Generate quiz */}
              <button
                onClick={() => void handleBulkQuiz()}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1 border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-foreground hover:text-background disabled:opacity-50"
              >
                {busyAction === "quiz" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Brain className="size-3" />
                )}{" "}
                Quiz
              </button>

              {/* Generate flashcards */}
              <button
                onClick={() => void handleBulkFlashcards()}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1 border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-foreground hover:text-background disabled:opacity-50"
              >
                {busyAction === "flashcards" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Layers className="size-3" />
                )}{" "}
                Cards
              </button>

              <div className="mx-1 h-5 w-px bg-border" />

              {/* Delete */}
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1 border border-destructive/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="size-3" /> Delete
              </button>

              {/* Clear */}
              <button
                onClick={() => sel.clear()}
                className="ml-1 grid size-6 place-items-center text-muted-foreground hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MoveToFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onConfirm={async (path) => {
          const ids = Array.from(sel.selected);
          await moveResources(ids, path);
          toast.success(`Moved ${ids.length} item${ids.length > 1 ? "s" : ""}`);
          sel.clear();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tag input sub-component                                           */
/* ------------------------------------------------------------------ */

function TagInput({ onSubmit }: { onSubmit: (tags: string[]) => void }) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const tags = value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length) {
      onSubmit(tags);
      setValue("");
    }
  }, [value, onSubmit]);

  return (
    <div className="flex gap-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="tag1, tag2…"
        className="flex-1 border border-input bg-background px-2 py-1 text-xs"
        autoFocus
      />
      <button
        onClick={handleSubmit}
        className="border border-foreground bg-foreground px-2 py-1 font-mono text-[10px] text-background"
      >
        Add
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Day picker sub-component                                          */
/* ------------------------------------------------------------------ */

function DayPicker({ onSelect }: { onSelect: (day: number | null) => void }) {
  const [days, setDays] = useState<{ number: number }[]>([]);

  useEffect(() => {
    void getDb().days.toArray().then(setDays);
  }, []);

  return (
    <div className="flex flex-wrap gap-1">
      {days.map((d) => (
        <button
          key={d.number}
          onClick={() => onSelect(d.number)}
          className="grid size-8 place-items-center border border-border text-xs hover:bg-surface-2"
        >
          {d.number}
        </button>
      ))}
      <button
        onClick={() => onSelect(null)}
        className="border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-surface-2"
      >
        Clear
      </button>
    </div>
  );
}
