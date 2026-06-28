import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClientOnly } from "@/components/common/ClientOnly";
import { getDb, type Resource, type Note, type FolderRow } from "@/db/schema";
import { Network, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/graph")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading graph…</div>}>
      <GraphPage />
    </ClientOnly>
  ),
});

type NodeKind = "resource" | "note" | "summary" | "folder";
interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  ref?: string; // navigate target
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
}
interface GEdge {
  a: string;
  b: string;
  kind: "note→resource" | "summary→resource" | "folder→resource" | "tag→tag";
}

function GraphPage() {
  const navigate = useNavigate();
  const [resources, setResources] = useState<Resource[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const db = getDb();
    Promise.all([
      db.resources.toArray(),
      db.notes.toArray(),
      db.folders.toArray(),
    ]).then(([r, n, f]) => {
      setResources(r);
      setNotes(n);
      setFolders(f);
    });
  }, []);

  // Build graph
  const { nodes, edges } = useMemo(() => {
    const W = 1000;
    const H = 700;
    const cx = W / 2;
    const cy = H / 2;
    const ns: GNode[] = [];
    const es: GEdge[] = [];

    // Folders ring
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

    // Resources mid ring
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

    // Notes outer ring
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

  // Cheap force sim (a few ticks) for layout stability
  const positioned = useMemo(() => {
    const ns = nodes.map((n) => ({ ...n }));
    const idx = new Map(ns.map((n, i) => [n.id, i]));
    const W = 1000, H = 700, cx = W / 2, cy = H / 2;
    for (let step = 0; step < 80; step++) {
      // repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.01;
          const f = 800 / d2;
          const fx = dx * f, fy = dy * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      // springs (edges)
      for (const e of edges) {
        const i = idx.get(e.a); const j = idx.get(e.b);
        if (i == null || j == null) continue;
        const a = ns[i], b = ns[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const target = 120;
        const k = 0.02 * (d - target);
        const fx = (dx / d) * k, fy = (dy / d) * k;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
      // center pull + integrate
      for (const n of ns) {
        n.vx += (cx - n.x) * 0.005;
        n.vy += (cy - n.y) * 0.005;
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
    return edges.some(
      (e) => (e.a === hover && e.b === id) || (e.b === hover && e.a === id),
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter nodes…"
            className="h-10 w-64 pl-9"
          />
        </div>
      </header>

      <Legend />

      <div className="overflow-hidden border border-border bg-surface-1 shadow-[6px_6px_0_var(--foreground)]">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 700"
          className="block h-[70vh] w-full"
          role="img"
          aria-label="Knowledge graph of resources, notes, and folders"
        >
          {/* Edges */}
          {edges.map((e, i) => {
            const a = positioned.find((n) => n.id === e.a);
            const b = positioned.find((n) => n.id === e.b);
            if (!a || !b) return null;
            const dim = hover && !(isActive(a.id) && isActive(b.id));
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={
                  e.kind === "summary→resource"
                    ? "#F59E0B"
                    : e.kind === "note→resource"
                      ? "#22D3EE"
                      : "currentColor"
                }
                strokeOpacity={dim ? 0.08 : 0.5}
                strokeWidth={e.kind === "summary→resource" ? 2 : 1}
              />
            );
          })}
          {/* Nodes */}
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
                <circle
                  r={r}
                  fill={colorFor(n.kind)}
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                />
                <text
                  x={r + 4}
                  y={4}
                  className="pointer-events-none fill-foreground font-mono"
                  style={{ fontSize: 10 }}
                >
                  {n.label.length > 32 ? n.label.slice(0, 32) + "…" : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {nodes.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Import resources and add notes to populate the graph.
        </p>
      )}
    </div>
  );
}

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
