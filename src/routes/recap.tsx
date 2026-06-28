import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Button } from "@/components/ui/button";
import { Download, FileText, CalendarDays, Sparkles } from "lucide-react";
import { exportSummariesMarkdownPack, exportSummariesPdf } from "@/services/exportService";
import { formatDuration } from "@/lib/format-time";

export const Route = createFileRoute("/recap")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <RecapPage />
    </ClientOnly>
  ),
});

function RecapPage() {
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, -1 = yesterday
  const resources = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const notes = useLiveQuery(() => getDb().notes.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => getDb().study_sessions.toArray(), []) ?? [];
  const progress = useLiveQuery(() => getDb().progress.toArray(), []) ?? [];

  const target = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);
  const dateStr = format(target, "yyyy-MM-dd");

  const todaySessions = sessions.filter((s) => s.date === dateStr);
  const studiedIds = new Set<string>(todaySessions.flatMap((s) => s.resourcesStudied));

  // Also include resources whose progress completedAt is today
  for (const p of progress) {
    if (p.completedAt && format(new Date(p.completedAt), "yyyy-MM-dd") === dateStr) {
      studiedIds.add(p.resourceId);
    }
  }

  const studiedResources = resources.filter((r) => studiedIds.has(r.id));
  const totalSeconds = todaySessions.reduce((s, x) => s + x.totalTimeSeconds, 0);
  const resourceSummary = (id: string) => notes.find((n) => n.resourceId === id && n.isSummary);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Daily Recap</h1>
          <p className="text-sm text-muted-foreground">
            {format(target, "EEEE, PPP")} · {studiedResources.length} resources ·{" "}
            {formatDuration(totalSeconds)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDayOffset((o) => o - 1)}>
            ← Prev
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDayOffset(0)} disabled={dayOffset === 0}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDayOffset((o) => o + 1)} disabled={dayOffset >= 0}>
            Next →
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={exportSummariesMarkdownPack}>
          <Download className="mr-2 size-4" /> Markdown pack
        </Button>
        <Button variant="outline" size="sm" onClick={exportSummariesPdf}>
          <FileText className="mr-2 size-4" /> PDF of all summaries
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/flashcards">
            <Sparkles className="mr-2 size-4" /> Review flashcards
          </Link>
        </Button>
      </div>

      {studiedResources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-3 size-8 opacity-50" />
          No study activity for this day. Open a resource to start tracking.
        </div>
      ) : (
        <div className="space-y-4">
          {studiedResources.map((r) => {
            const s = resourceSummary(r.id);
            const md = (s?.contentMarkdown || "").replace(/\n{3,}/g, "\n\n").trim();
            return (
              <article key={r.id} className="rounded-xl border border-border bg-surface-1 p-5">
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{r.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {r.type}
                      {r.dayAssignment ? ` · Day ${r.dayAssignment}` : ""}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/study/$resourceId" params={{ resourceId: r.id }}>
                      Open →
                    </Link>
                  </Button>
                </header>
                {md ? (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-foreground/90">
                    {md.length > 1200 ? md.slice(0, 1200) + "\n\n…(truncated)" : md}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">No summary written yet.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
