import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Coffee, Brain, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDraggable } from "@/hooks/useDraggable";

type Phase = "focus" | "break";

const FOCUS_SEC = 25 * 60;
const BREAK_SEC = 5 * 60;

/**
 * Compact Pomodoro widget pinned to the corner of the Study Room.
 * Local-only, no persistence yet — focus is the lifecycle the student
 * needs in the moment.
 */
export function PomodoroWidget() {
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(FOCUS_SEC);
  const [running, setRunning] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          // switch phase
          const nextPhase: Phase = phase === "focus" ? "break" : "focus";
          setPhase(nextPhase);
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(nextPhase === "break" ? "Focus done — take a break" : "Break over — back to it");
            }
          } catch { /* noop */ }
          return nextPhase === "focus" ? FOCUS_SEC : BREAK_SEC;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [running, phase]);

  function reset() {
    setRunning(false);
    setRemaining(phase === "focus" ? FOCUS_SEC : BREAK_SEC);
  }

  function start() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setRunning((r) => !r);
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const total = phase === "focus" ? FOCUS_SEC : BREAK_SEC;
  const pct = ((total - remaining) / total) * 100;

  const collapsedDrag = useDraggable({ storageKey: "studyvault:pomodoro-pos-collapsed", defaultPos: { right: 16, bottom: 16 } });
  const expandedDrag = useDraggable({ storageKey: "studyvault:pomodoro-pos", defaultPos: { right: 16, bottom: 16 } });

  if (collapsed) {
    return (
      <div ref={collapsedDrag.containerRef} style={collapsedDrag.style} className="z-30">
        <button
          onPointerDown={collapsedDrag.handleProps.onPointerDown}
          onClick={(e) => { if (!collapsedDrag.dragging) setCollapsed(false); e.preventDefault(); }}
          className="flex items-center gap-2 border border-foreground bg-background px-3 py-2 font-mono text-xs font-bold uppercase tracking-widest shadow-[4px_4px_0_var(--foreground)]"
          style={collapsedDrag.handleProps.style}
          title="Open pomodoro (drag to move)"
        >
          {phase === "focus" ? <Brain className="size-3.5" /> : <Coffee className="size-3.5" />}
          {mm}:{ss}
        </button>
      </div>
    );
  }

  return (
    <div ref={expandedDrag.containerRef} style={expandedDrag.style} className="z-30 w-[200px] border border-foreground bg-background shadow-[6px_6px_0_var(--foreground)]">
      <div
        className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest select-none"
        onPointerDown={expandedDrag.handleProps.onPointerDown}
        style={expandedDrag.handleProps.style}
      >
        <span className="flex items-center gap-1.5">
          <GripVertical className="size-3 text-muted-foreground" />
          {phase === "focus" ? <Brain className="size-3" /> : <Coffee className="size-3" />}
          {phase === "focus" ? "Focus" : "Break"}
        </span>
        <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground" aria-label="Minimize">
          –
        </button>
      </div>
      <div className="p-3 text-center">
        <div className="font-mono text-3xl font-black tabular-nums">
          {mm}:{ss}
        </div>
        <div className="mt-2 h-1 w-full bg-surface-2">
          <div
            className={cn("h-full transition-all", phase === "focus" ? "bg-primary" : "bg-success")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={start}
            className="grid size-8 place-items-center border border-foreground bg-foreground text-background"
            aria-label={running ? "Pause" : "Start"}
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button
            onClick={reset}
            className="grid size-8 place-items-center border border-border bg-surface-1"
            aria-label="Reset"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
