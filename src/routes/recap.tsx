import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, useEffect } from "react";
import { format, subWeeks } from "date-fns";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  CalendarDays,
  Sparkles,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  exportSummariesMarkdownPack,
  exportSummariesPdf,
  exportWeeklyRecapHtml,
  formatRecapHtml,
} from "@/services/exportService";
import { getWeeklyRecap, type WeeklyRecap } from "@/services/recapService";
import { formatDuration } from "@/lib/format-time";
import { toast } from "sonner";

export const Route = createFileRoute("/recap")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <RecapPage />
    </ClientOnly>
  ),
});

type ViewMode = "daily" | "weekly";

function RecapPage() {
  const [view, setView] = useState<ViewMode>("daily");
  const [dayOffset, setDayOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [copied, setCopied] = useState(false);
  const [weeklyRecap, setWeeklyRecap] = useState<WeeklyRecap | null>(null);

  const resources = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const notes = useLiveQuery(() => getDb().notes.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => getDb().study_sessions.toArray(), []) ?? [];
  const progress = useLiveQuery(() => getDb().progress.toArray(), []) ?? [];

  useEffect(() => {
    if (view !== "weekly") return;
    const endDate = subWeeks(new Date(), weekOffset);
    getWeeklyRecap(endDate).then(setWeeklyRecap);
  }, [view, weekOffset]);

  const dailyDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);
  const dateStr = format(dailyDate, "yyyy-MM-dd");

  const todaySessions = sessions.filter((s) => s.date === dateStr);
  const studiedIds = new Set<string>(todaySessions.flatMap((s) => s.resourcesStudied));

  for (const p of progress) {
    if (p.completedAt && format(new Date(p.completedAt), "yyyy-MM-dd") === dateStr) {
      studiedIds.add(p.resourceId);
    }
  }

  const studiedResources = resources.filter((r) => studiedIds.has(r.id));
  const totalSeconds = todaySessions.reduce((s, x) => s + x.totalTimeSeconds, 0);
  const resourceSummary = (id: string) => notes.find((n) => n.resourceId === id && n.isSummary);

  async function handleCopyWeekly() {
    if (!weeklyRecap) return;
    const html = formatRecapHtml(weeklyRecap);
    await navigator.clipboard.writeText(html);
    setCopied(true);
    toast.success("Recap HTML copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Study Recap</h1>
          <p className="text-sm text-muted-foreground">
            {view === "daily"
              ? `${format(dailyDate, "EEEE, PPP")} · ${studiedResources.length} resources · ${formatDuration(totalSeconds)}`
              : weeklyRecap
                ? `${format(new Date(weeklyRecap.weekStart), "MMM d")} – ${format(new Date(weeklyRecap.weekEnd), "MMM d")} · ${weeklyRecap.daysActive}/7 days · ${formatDuration(weeklyRecap.totalSeconds)}`
                : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border">
            <button
              onClick={() => setView("daily")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "daily"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setView("weekly")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "weekly"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              Weekly
            </button>
          </div>
        </div>
      </div>

      {view === "daily" ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDayOffset((o) => o - 1)}>
            <ChevronLeft className="mr-1 size-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDayOffset(0)}
            disabled={dayOffset === 0}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDayOffset((o) => o + 1)}
            disabled={dayOffset >= 0}
          >
            Next <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronLeft className="mr-1 size-4" /> Prev Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
            disabled={weekOffset === 0}
          >
            Next Week <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {view === "weekly" && weeklyRecap && (
          <>
            <Button variant="outline" size="sm" onClick={handleCopyWeekly}>
              {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
              {copied ? "Copied!" : "Copy HTML"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportWeeklyRecapHtml(weeklyRecap)}>
              <Download className="mr-2 size-4" /> Download HTML
            </Button>
          </>
        )}
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

      {view === "daily" ? (
        <>
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
        </>
      ) : (
        <>
          {!weeklyRecap ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              <CalendarDays className="mx-auto mb-3 size-8 opacity-50" />
              Loading weekly recap…
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-surface-1 p-4 text-center">
                  <div className="text-2xl font-bold text-primary">
                    {formatDuration(weeklyRecap.totalSeconds)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Study Time</div>
                </div>
                <div className="rounded-xl border border-border bg-surface-1 p-4 text-center">
                  <div className="text-2xl font-bold text-success">{weeklyRecap.daysActive}/7</div>
                  <div className="mt-1 text-xs text-muted-foreground">Days Active</div>
                </div>
                <div className="rounded-xl border border-border bg-surface-1 p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-500">{weeklyRecap.streak}🔥</div>
                  <div className="mt-1 text-xs text-muted-foreground">Day Streak</div>
                </div>
              </div>

              <div className="flex gap-6 text-sm text-muted-foreground">
                <span>
                  📖 <strong>{weeklyRecap.resourcesStudied.length}</strong> resources studied
                </span>
                <span>
                  ✅ <strong>{weeklyRecap.resourcesCompleted.length}</strong> completed
                </span>
                <span>
                  🃏 <strong>{weeklyRecap.dueFlashcards}</strong> flashcards due
                </span>
              </div>

              {/* Daily Breakdown */}
              <div>
                <h2 className="mb-3 text-base font-semibold">Daily Breakdown</h2>
                <div className="space-y-2">
                  {weeklyRecap.dailyBreakdown.map((d, i) => {
                    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                    return (
                      <div
                        key={d.date}
                        className="flex items-center gap-4 rounded-lg border border-border bg-surface-1 px-4 py-2.5"
                      >
                        <span className="w-8 text-xs font-medium text-muted-foreground">
                          {dayNames[i]}
                        </span>
                        <span className="w-20 text-xs text-muted-foreground">
                          {format(new Date(d.date), "MMM d")}
                        </span>
                        <span className="w-20 text-right text-xs tabular-nums">
                          {d.seconds > 0 ? formatDuration(d.seconds) : "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {d.resources.length > 0 ? d.resources.map((r) => r.name).join(", ") : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Resources */}
              {weeklyRecap.resourcesStudied.length > 0 && (
                <div>
                  <h2 className="mb-3 text-base font-semibold">Top Resources</h2>
                  <div className="space-y-1">
                    {weeklyRecap.resourcesStudied.slice(0, 10).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface-1 px-4 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{r.type}</p>
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatDuration(r.seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weak Areas */}
              {weeklyRecap.weakAreas.length > 0 && (
                <div>
                  <h2 className="mb-3 text-base font-semibold">Areas to Review</h2>
                  <div className="space-y-1">
                    {weeklyRecap.weakAreas.map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2"
                      >
                        <span className="text-sm">{w.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {w.score != null ? `${w.score}%` : "In progress"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
