import { useEffect, useState } from "react";
import { Plus, Target, Trash2, X, GripVertical, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDraggable } from "@/hooks/useDraggable";

interface FocusTask {
  id: string;
  text: string;
  done: boolean;
}

const STORAGE_KEY = "studyvault:focusbox:tasks";
const COLLAPSED_KEY = "studyvault:focusbox:collapsed";

function loadTasks(): FocusTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FocusTask[];
  } catch {
    return [];
  }
}

function saveTasks(tasks: FocusTask[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch { /* noop */ }
}

/**
 * Draggable focus box — small sticky panel for current session intentions.
 * Position + tasks + collapse state all persist across reloads.
 */
export function FocusBox() {
  const [tasks, setTasks] = useState<FocusTask[]>([]);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);

  const drag = useDraggable({
    storageKey: "studyvault:focusbox:pos",
    defaultPos: { right: 16, bottom: 220 },
  });

  useEffect(() => {
    setTasks(loadTasks());
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }

  function addTask() {
    const text = draft.trim();
    if (!text) return;
    setTasks((t) => [...t, { id: crypto.randomUUID(), text, done: false }]);
    setDraft("");
  }

  function toggle(id: string) {
    setTasks((t) => t.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }

  function remove(id: string) {
    setTasks((t) => t.filter((task) => task.id !== id));
  }

  function clearDone() {
    setTasks((t) => t.filter((task) => !task.done));
  }

  if (hidden) return null;

  const remaining = tasks.filter((t) => !t.done).length;

  if (collapsed) {
    return (
      <div ref={drag.containerRef} style={drag.style} className="z-40">
        <div className="flex items-stretch border-2 border-foreground bg-background shadow-[4px_4px_0_var(--foreground)]">
          <button
            {...drag.handleProps}
            className="grid w-6 place-items-center border-r-2 border-foreground bg-foreground text-background"
            aria-label="Drag focus box"
            title="Drag"
          >
            <GripVertical className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex items-center gap-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest text-foreground hover:bg-surface-1"
            title="Open focus box"
          >
            <Target className="size-3.5" />
            Focus
            <span className="inline-grid size-5 place-items-center bg-foreground text-[10px] text-background">
              {remaining}
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={drag.containerRef}
      style={drag.style}
      className="z-40 w-72 border-2 border-foreground bg-background shadow-[6px_6px_0_var(--foreground)]"
    >
      <div
        {...drag.handleProps}
        className={cn(
          "flex items-center justify-between gap-2 border-b-2 border-foreground bg-foreground px-3 py-2 text-background",
          drag.handleProps.style.cursor === "grabbing" ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest">
          <GripVertical className="size-3.5 opacity-70" />
          <Target className="size-3.5" />
          Focus Box
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={toggleCollapsed}
            className="grid size-6 place-items-center hover:bg-background hover:text-foreground"
            aria-label="Collapse"
            title="Collapse"
          >
            <ChevronUp className="size-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setHidden(true)}
            className="grid size-6 place-items-center hover:bg-background hover:text-foreground"
            aria-label="Hide"
            title="Hide for this session"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTask();
              }
            }}
            placeholder="What's your focus?"
            className="h-9 flex-1 border border-input bg-background px-2 text-sm outline-none focus:border-foreground"
          />
          <button
            type="button"
            onClick={addTask}
            className="grid size-9 place-items-center border border-foreground bg-primary text-foreground hover:bg-primary/80"
            aria-label="Add focus task"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {tasks.length === 0 ? (
          <p className="px-1 py-2 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Set 1–3 intentions for this session
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="group flex items-start gap-2 border border-border bg-surface-1 px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggle(task.id)}
                  className="mt-0.5 size-4 shrink-0 accent-foreground"
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 break-words leading-snug",
                    task.done && "text-muted-foreground line-through",
                  )}
                >
                  {task.text}
                </span>
                <button
                  type="button"
                  onClick={() => remove(task.id)}
                  className="grid size-5 shrink-0 place-items-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {tasks.some((t) => t.done) && (
          <button
            type="button"
            onClick={clearDone}
            className="w-full border border-border bg-surface-1 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-surface-2"
          >
            Clear completed
          </button>
        )}
      </div>
    </div>
  );
}
