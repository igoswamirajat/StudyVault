import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ClientOnly } from "@/components/common/ClientOnly";
import { getDb, type Resource, type Note, type FolderRow } from "@/db/schema";
import {
  Network,
  Search,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Lock,
  CheckCircle2,
  CircleDot,
  Circle,
  Map as MapIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  aiGenerateLearningJourney,
  isAiConfigured,
  type LearningJourney,
  type JourneyPhase,
} from "@/services/aiService";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graph")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading graph…</div>}>
      <GraphPage />
    </ClientOnly>
  ),
});

type ViewMode = "graph" | "journey";

/* ───────────────────── Graph types ───────────────────── */
type NodeKind = "resource" | "note" | "summary" | "folder";
interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  ref?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface GEdge {
  a: string;
  b: string;
  kind: "note→resource" | "summary→resource" | "folder→resource";
}

/* ───────────────────── Main page ───────────────────── */
function GraphPage() {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<ViewMode>("graph");
  const [journey, setJourney] = useState<LearningJourney | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => {
    const db = getDb();
    Promise.all([db.resources.toArray(), db.notes.toArray(), db.folders.toArray()]).then(
      ([r, n, f]) => {
        setResources(r);
        setNotes(n);
        setFolders(f);
      },
    );
    isAiConfigured().then(setAiAvailable);
  }, []);

  const handleGenerateJourney = useCallback(async () => {
    setJourneyLoading(true);
    try {
      const result = await aiGenerateLearningJourney();
      setJourney(result);
      setView("journey");
      toast.success("Learning journey generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate journey");
    } finally {
      setJourneyLoading(false);
    }
  }, []);

  /* ── Graph build ── */
  const { nodes, edges } = useMemo(() => {
    const W = 1000, H = 700, cx = W / 2, cy = H / 2;
    const ns: GNode[] = [];
    const es: GEdge[] = [];

    folders.forEach((f, i) => {
      const a = (i / Math.max(folders.length, 1)) * Math.PI * 2;
      ns.push({
        id: `f:${f.path}`,
        label: f.name || "Root",
        kind: "folder",
        x: cx + Math.cos(a) * 320,
        y: cy + Math.sin(a) * 220,
        vx: 0,
        vy: 0,
      });
    });

    resources.forEach((r, i) => {
      const a = (i / Math.max(resources.length, 1)) * Math.PI * 2 + 0.3;
      ns.push({
        id: `r:${r.id}`,
        label: r.name,
        kind: "resource",
        ref: `/study/${r.id}`,
        x: cx + Math.cos(a) * 180,
        y: cy + Math.sin(a) * 130,
        vx: 0,
        vy: 0,
      });
      if (r.folderPath) {
        const fid = `f:${r.folderPath}`;
        if (ns.some((n) => n.id === fid)) {
          es.push({ a: fid, b: `r:${r.id}`, kind: "folder→resource" });
        }
      }
    });

    notes.forEach((nt, i) => {
      const a = (i / Math.max(notes.length, 1)) * Math.PI * 2 + 0.7;
      const kind: NodeKind = nt.isSummary ? "summary" : "note";
      ns.push({
        id: `n:${nt.id}`,
        label: nt.title || (nt.isSummary ? "Summary" : "Note"),
        kind,
        ref: nt.resourceId ? `/study/${nt.resourceId}` : `/notes`,
        x: cx + Math.cos(a) * 280,
        y: cy + Math.sin(a) * 320,
        vx: 0,
        vy: 0,
      });
      if (nt.resourceId) {
        es.push({
          a: `n:${nt.id}`,
          b: `r:${nt.resourceId}`,
          kind: nt.isSummary ? "summary→resource" : "note→resource",
        });
      }
    });

    return { nodes: ns, edges: es };
  }, [resources, notes, folders]);

  const positioned = useMemo(() => {
    const ns = nodes.map((n) => ({ ...n }));
    const idx = new Map(ns.map((n, i) => [n.id, i]));
    const W = 1000, H = 700, cx = W / 2, cy = H / 2;
    for (let step = 0; step < 80; step++) {
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const f = 800 / d2;
          a.vx += dx * f; a.vy += dy * f;
          b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      for (const e of edges) {
        const i = idx.get(e.a), j = idx.get(e.b);
        if (i == null || j == null) continue;
        const a = ns[i], b = ns[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const k = 0.02 * (d - 120);
        const fx = (dx / d) * k, fy = (dy / d) * k;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      for (const n of ns) {
        n.vx += (cx - n.x) * 0.005; n.vy += (cy - n.y) * 0.005;
        n.vx *= 0.78; n.vy *= 0.78;
        n.x += n.vx; n.y += n.vy;
      }
    }
    return ns;
  }, [nodes, edges]);

  const matchesQ = (n: GNode) =>
    !query.trim() || n.label.toLowerCase().includes(query.toLowerCase());

  const colorFor = (k: NodeKind) =>
    k === "resource"
      ? "var(--primary)"
      : k === "summary"
        ? "#F59E0B"
        : k === "note"
          ? "#22D3EE"
          : "var(--foreground)";

  const isActive = (id: string) => {
    if (!hover) return true;
    if (id === hover) return true;
    return edges.some((e) => (e.a === hover && e.b === id) || (e.b === hover && e.a === id));
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Knowledge graph
          </p>
          <h1 className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">
            <Network className="size-6" /> Mind map
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {resources.length} resources · {notes.filter((n) => n.isSummary).length} summaries ·{" "}
            {notes.filter((n) => !n.isSummary).length} notes · {folders.length} folders
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setView("graph")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                view === "graph" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Network className="size-3.5" /> Graph
            </button>
            <button
              onClick={() => setView("journey")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                view === "journey" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MapIcon className="size-3.5" /> Journey
            </button>
          </div>

          {/* AI Journey button */}
          <Button
            size="sm"
            variant={aiAvailable ? "default" : "outline"}
            disabled={journeyLoading || !aiAvailable}
            onClick={() => void handleGenerateJourney()}
            title={!aiAvailable ? "Configure AI in Settings → AI first" : "Generate AI learning journey"}
            className="gap-1.5"
          >
            {journeyLoading ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {journeyLoading ? "Generating…" : "AI Journey"}
            {!aiAvailable && <span className="ml-1 text-[10px] opacity-60">(needs AI setup)</span>}
          </Button>

          {view === "graph" && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter nodes…"
                className="h-10 w-52 pl-9"
              />
            </div>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === "graph" ? (
          <motion.div
            key="graph"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Legend />
            <div className="mt-3 overflow-hidden border border-border bg-surface-1 shadow-[6px_6px_0_var(--foreground)]">
              <svg
                ref={svgRef}
                viewBox="0 0 1000 700"
                className="block h-[70vh] w-full"
                role="img"
                aria-label="Knowledge graph of resources, notes, and folders"
              >
                {edges.map((e, i) => {
                  const a = positioned.find((n) => n.id === e.a);
                  const b = positioned.find((n) => n.id === e.b);
                  if (!a || !b) return null;
                  const dim = hover && !(isActive(a.id) && isActive(b.id));
                  return (
                    <line
                      key={i}
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={e.kind === "summary→resource" ? "#F59E0B" : e.kind === "note→resource" ? "#22D3EE" : "currentColor"}
                      strokeOpacity={dim ? 0.08 : 0.5}
                      strokeWidth={e.kind === "summary→resource" ? 2 : 1}
                    />
                  );
                })}
                {positioned.map((n) => {
                  const dim = !matchesQ(n) || (hover ? !isActive(n.id) : false);
                  const r = n.kind === "folder" ? 10 : n.kind === "resource" ? 9 : 6;
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      opacity={dim ? 0.18 : 1}
                      onMouseEnter={() => setHover(n.id)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => n.ref && navigate({ to: n.ref })}
                      style={{ cursor: n.ref ? "pointer" : "default" }}
                    >
                      <circle r={r} fill={colorFor(n.kind)} stroke="var(--foreground)" strokeWidth={1.5} />
                      <text x={r + 4} y={4} className="pointer-events-none fill-foreground font-mono" style={{ fontSize: 10 }}>
                        {n.label.length > 32 ? n.label.slice(0, 32) + "…" : n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            {nodes.length === 0 && (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Import resources and add notes to populate the graph.
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="journey"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <JourneyView journey={journey} resources={resources} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────── Journey view ───────────────────── */
function JourneyView({
  journey,
  resources,
}: {
  journey: LearningJourney | null;
  resources: Resource[];
}) {
  if (!journey) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="rounded-full border border-dashed border-border p-6">
          <MapIcon className="size-10 text-muted-foreground/40" />
        </div>
        <div>
          <p className="font-medium">No learning journey yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Click <strong>AI Journey</strong> to generate a personalized study roadmap based on your
            resources and progress.
          </p>
        </div>
      </div>
    );
  }

  const resourceMap = new Map(resources.map((r) => [r.id, r]));

  return (
    <div className="space-y-4">
      {journey.reasoning && (
        <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
          <span className="mr-2 font-medium text-foreground">AI reasoning:</span>
          {journey.reasoning}
        </div>
      )}

      <div className="relative space-y-4">
        {/* Vertical line connector */}
        <div className="absolute left-[22px] top-8 bottom-8 w-px bg-border" />

        {journey.phases
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((phase, phaseIdx) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              phaseIndex={phaseIdx}
              resourceMap={resourceMap}
            />
          ))}
      </div>
    </div>
  );
}

function PhaseCard({
  phase,
  phaseIndex,
  resourceMap,
}: {
  phase: JourneyPhase;
  phaseIndex: number;
  resourceMap: Map<string, Resource>;
}) {
  const [open, setOpen] = useState(phaseIndex === 0);

  const completedCount = phase.resources.filter((r) => r.status === "completed").length;
  const total = phase.resources.length;
  const pct = total ? Math.round((completedCount / total) * 100) : 0;

  const phaseColors = [
    "bg-primary/10 border-primary/20 text-primary",
    "bg-amber-500/10 border-amber-500/20 text-amber-600",
    "bg-cyan-500/10 border-cyan-500/20 text-cyan-600",
    "bg-violet-500/10 border-violet-500/20 text-violet-600",
    "bg-rose-500/10 border-rose-500/20 text-rose-600",
    "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
  ];
  const colorClass = phaseColors[phaseIndex % phaseColors.length];

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: phaseIndex * 0.08, type: "spring", stiffness: 200, damping: 22 }}
      className="relative pl-12"
    >
      {/* Phase dot */}
      <div
        className={cn(
          "absolute left-3 top-4 flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
          colorClass,
        )}
      >
        {phaseIndex + 1}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface-1 shadow-sm">
        {/* Phase header */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{phase.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{phase.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium">{pct}%</p>
              <p className="text-[10px] text-muted-foreground">
                {completedCount}/{total} done
              </p>
            </div>
            {/* Mini progress bar */}
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <ChevronRight
              className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")}
            />
          </div>
        </button>

        {/* Resources list */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-border border-t border-border">
                {phase.resources.map((r, i) => {
                  const resource = resourceMap.get(r.id);
                  return (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5",
                        r.status === "locked" && "opacity-40",
                      )}
                    >
                      <StatusIcon status={r.status} />
                      <div className="min-w-0 flex-1">
                        {resource && r.status !== "locked" ? (
                          <Link
                            to="/study/$resourceId"
                            params={{ resourceId: resource.id }}
                            className="text-sm font-medium hover:underline underline-offset-2"
                          >
                            {r.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">{r.title}</span>
                        )}
                        {r.reason && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{r.reason}</p>
                        )}
                      </div>
                      <StatusBadge status={r.status} />
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="size-4 shrink-0 text-success" />;
  if (status === "in-progress") return <CircleDot className="size-4 shrink-0 text-primary" />;
  if (status === "locked") return <Lock className="size-3.5 shrink-0 text-muted-foreground" />;
  return <Circle className="size-4 shrink-0 text-muted-foreground/60" />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-success/10 text-success",
    "in-progress": "bg-primary/10 text-primary",
    locked: "bg-muted text-muted-foreground",
    available: "bg-border text-foreground/70",
  };
  const label: Record<string, string> = {
    completed: "Done",
    "in-progress": "In progress",
    locked: "Locked",
    available: "Available",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        map[status] ?? "bg-border text-muted-foreground",
      )}
    >
      {label[status] ?? status}
    </span>
  );
}

/* ───────────────────── Legend ───────────────────── */
function Legend() {
  const items = [
    { label: "Folder", color: "var(--foreground)" },
    { label: "Resource", color: "var(--primary)" },
    { label: "Summary", color: "#F59E0B" },
    { label: "Note", color: "#22D3EE" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-widest text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full border border-foreground" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
