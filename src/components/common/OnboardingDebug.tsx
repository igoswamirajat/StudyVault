import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouterState } from "@tanstack/react-router";
import { Bug, X, Loader2, CheckCircle2, AlertTriangle, GripVertical } from "lucide-react";
import { getAllSettings, SETTINGS_CHANGED_EVENT } from "@/services/storageService";
import { checkDriveHealth, type DriveHealth } from "@/services/driveService";
import { useDraggable } from "@/hooks/useDraggable";

type LogEntry = {
  t: string;
  pathname: string;
  initialized: boolean;
  driveId: string | null;
  appInitialized: boolean;
  decision: string;
};

const LOG_KEY = "studyvault:onboarding-debug-log";
const MAX_LOGS = 20;

export function pushOnboardingDecision(entry: Omit<LogEntry, "t">) {
  if (typeof window === "undefined") return;
  try {
    const prev: LogEntry[] = JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
    const next = [{ ...entry, t: new Date().toLocaleTimeString() }, ...prev].slice(0, MAX_LOGS);
    sessionStorage.setItem(LOG_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("studyvault:onboarding-debug"));
  } catch {
    // ignore
  }
}

export function OnboardingDebugPanel() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<DriveHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const refresh = async () => {
    setSettings(await getAllSettings());
    try {
      setLogs(JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]"));
    } catch {
      setLogs([]);
    }
  };

  const runHealth = async (folderId: string | null, apiKey: string | null) => {
    setHealthLoading(true);
    try {
      const result = await checkDriveHealth(folderId, apiKey);
      setHealth(result);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await refresh();
      const all = await getAllSettings();
      // Run health check on startup so a stale "no folder" decision is visible immediately.
      await runHealth(
        (all.driveId as string | null) ?? null,
        (all.driveApiKey as string | null) ?? null,
      );
    })();
    const handler = () => void refresh();
    window.addEventListener(SETTINGS_CHANGED_EVENT, handler);
    window.addEventListener("studyvault:onboarding-debug", handler);
    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handler);
      window.removeEventListener("studyvault:onboarding-debug", handler);
    };
  }, []);

  const driveId = (settings.driveId as string | null) ?? null;
  const appInitialized = Boolean(settings.appInitialized);
  const apiKey = (settings.driveApiKey as string | null) ?? null;

  const btnDrag = useDraggable({ storageKey: "studyvault:debug-btn-pos", defaultPos: { right: 16, bottom: 16 } });
  const panelDrag = useDraggable({ storageKey: "studyvault:debug-panel-pos", defaultPos: { right: 16, bottom: 72 } });

  return (
    <>
      <div ref={btnDrag.containerRef} style={btnDrag.style} className="z-50">
        <button
          type="button"
          onPointerDown={btnDrag.handleProps.onPointerDown}
          onClick={(e) => { if (!btnDrag.dragging) setOpen((v) => !v); e.preventDefault(); }}
          className="inline-flex h-10 items-center gap-2 border border-foreground bg-background px-3 font-mono text-xs font-bold uppercase tracking-widest shadow-[4px_4px_0_var(--foreground)]"
          style={btnDrag.handleProps.style}
          aria-label="Toggle onboarding debug panel (drag to move)"
        >
          <GripVertical className="size-3 text-muted-foreground" />
          <Bug className="size-3.5" />
          Debug
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.aside
            key="debug-panel"
            ref={panelDrag.containerRef}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.2 }}
            style={panelDrag.style}
            className="z-50 w-[min(420px,calc(100vw-2rem))] border border-foreground bg-background shadow-[8px_8px_0_var(--foreground)]"
          >
            <header
              className="flex items-center justify-between border-b border-border bg-surface-1 px-3 py-2 select-none"
              onPointerDown={panelDrag.handleProps.onPointerDown}
              style={panelDrag.handleProps.style}
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest">
                <GripVertical className="size-3 text-muted-foreground" />
                Onboarding Debug
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-6 place-items-center hover:bg-accent"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </header>

            <div className="grid grid-cols-2 gap-px bg-border">
              <DebugStat label="appInitialized" value={appInitialized ? "true" : "false"} ok={appInitialized} />
              <DebugStat label="driveId" value={driveId ? `${driveId.slice(0, 10)}…` : "—"} ok={!!driveId} />
              <DebugStat label="apiKey" value={apiKey ? "set" : "—"} ok={!!apiKey} muted />
              <DebugStat label="pathname" value={pathname} muted />
            </div>

            <div className="border-t border-border bg-background px-3 py-2">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Drive health check</span>
                {healthLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : health?.ok ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3" /> OK
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <AlertTriangle className="size-3" /> {health ? "Failed" : "Idle"}
                  </span>
                )}
              </div>
              {health && (
                <div className="mt-1 font-mono text-[11px] leading-tight">
                  <div>mode={health.mode} · files={health.fileCount}</div>
                  {health.error && <div className="text-warning">{health.error}</div>}
                  <div className="text-muted-foreground">
                    @ {new Date(health.checkedAt).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>

            <div className="max-h-64 overflow-auto border-t border-border">
              <div className="sticky top-0 border-b border-border bg-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Redirect decisions
              </div>
              {logs.length === 0 ? (
                <p className="px-3 py-4 font-mono text-[11px] text-muted-foreground">No decisions logged yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {logs.map((l, i) => (
                    <li key={i} className="px-3 py-2 font-mono text-[11px] leading-tight">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{l.t}</span>
                        <span>{l.pathname}</span>
                      </div>
                      <div className="mt-0.5 text-foreground">
                        init={String(l.initialized)} · drive={l.driveId ? "✓" : "✗"} · app={String(l.appInitialized)}
                      </div>
                      <div className="mt-0.5 text-primary">→ {l.decision}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2 border-t border-border p-2">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem(LOG_KEY);
                  setLogs([]);
                }}
                className="flex-1 border border-border bg-surface-1 py-1.5 font-mono text-[11px] uppercase tracking-widest hover:bg-accent"
              >
                Clear log
              </button>
              <button
                type="button"
                onClick={() => void runHealth(driveId, apiKey)}
                disabled={healthLoading}
                className="flex-1 border border-border bg-primary py-1.5 font-mono text-[11px] uppercase tracking-widest hover:bg-accent disabled:opacity-50"
              >
                {healthLoading ? "Checking…" : "Re-check Drive"}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function DebugStat({
  label,
  value,
  ok,
  muted,
}: {
  label: string;
  value: string;
  ok?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="bg-background px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={
          "mt-0.5 truncate font-mono text-xs " +
          (muted ? "text-foreground" : ok ? "text-success" : "text-warning")
        }
      >
        {value}
      </div>
    </div>
  );
}
