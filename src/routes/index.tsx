import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Button } from "@/components/ui/button";
import {
  Play,
  Brain,
  Layers,
  Sun,
  Flame,
  Clock,
  CheckCircle2,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { getStreak, getTodaySeconds, getHeatmapData } from "@/services/progressService";
import { formatDuration } from "@/lib/format-time";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading StudyVault…</div>}>
      <Dashboard />
    </ClientOnly>
  ),
});

function Dashboard() {
  const navigate = useNavigate();
  const resources = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const progress = useLiveQuery(() => getDb().progress.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => getDb().study_sessions.toArray(), []) ?? [];

  const [streak, setStreak] = useState(0);
  const [todaySec, setTodaySec] = useState(0);
  const [weekData, setWeekData] = useState<{ date: string; seconds: number }[]>([]);

  useEffect(() => {
    void getStreak().then(setStreak);
    void getTodaySeconds().then(setTodaySec);
    void getHeatmapData(7).then(setWeekData);
  }, [progress, sessions]);

  const completed = progress.filter((p) => p.status === "completed").length;
  const total = resources.filter((r) => (r.status ?? "active") === "active").length;

  const recentResources = useMemo(() => {
    return resources
      .filter((r) => r.lastOpenedAt && (r.status ?? "active") === "active")
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
      .slice(0, 5);
  }, [resources]);

  const todayGoalMinutes = 60;
  const goalProgress = Math.min(100, Math.round((todaySec / 60 / todayGoalMinutes) * 100));

  const weekMax = Math.max(1, ...weekData.map((d) => d.seconds));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, MMMM d")} · {total} resources · {completed} completed
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Flame className="size-4 text-yellow-500" /> Study Streak
          </div>
          <div className="text-2xl font-bold">{streak} days</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="size-4 text-primary" /> Today
          </div>
          <div className="text-2xl font-bold">{formatDuration(todaySec)}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${goalProgress}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {goalProgress >= 100 ? "Goal reached!" : `${goalProgress}% of daily goal`}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" /> Completed
          </div>
          <div className="text-2xl font-bold">
            {completed}/{total}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {total > 0 ? `${Math.round((completed / total) * 100)}% progress` : "No resources yet"}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl border border-border bg-surface-1 p-4"
        >
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <BookOpen className="size-4 text-primary" /> This Week
          </div>
          <div className="text-2xl font-bold">
            {formatDuration(weekData.reduce((s, d) => s + d.seconds, 0))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {weekData.filter((d) => d.seconds > 0).length}/7 days active
          </p>
        </motion.div>
      </div>

      {/* Weekly Chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-xl border border-border bg-surface-1 p-4"
      >
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          This Week
        </h2>
        <div className="flex items-end gap-2">
          {weekData.map((d) => {
            const height = d.seconds > 0 ? Math.max(8, (d.seconds / weekMax) * 80) : 4;
            const isToday = d.date === format(new Date(), "yyyy-MM-dd");
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {d.seconds > 0 ? formatDuration(d.seconds) : ""}
                </span>
                <div
                  className={`w-full rounded-t-md transition-all ${
                    d.seconds === 0 ? "bg-muted" : isToday ? "bg-primary" : "bg-primary/50"
                  }`}
                  style={{ height: `${height}px` }}
                  title={`${format(new Date(d.date), "EEE MMM d")} — ${formatDuration(d.seconds)}`}
                />
                <span
                  className={`text-[10px] ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}
                >
                  {format(new Date(d.date), "EEE")}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction
            icon={<Play className="size-5" />}
            label="Start Studying"
            description="Continue where you left off"
            onClick={() => navigate({ to: "/study" })}
          />
          <QuickAction
            icon={<Brain className="size-5" />}
            label="Take a Quiz"
            description="Test your knowledge"
            onClick={() => navigate({ to: "/library" })}
          />
          <QuickAction
            icon={<Layers className="size-5" />}
            label="Review Cards"
            description="Flashcard practice"
            onClick={() => navigate({ to: "/flashcards" })}
          />
          <QuickAction
            icon={<Sun className="size-5" />}
            label="Weekly Recap"
            description="See your progress"
            onClick={() => navigate({ to: "/recap" })}
          />
        </div>
      </motion.div>

      {/* Recent Activity */}
      {recentResources.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Activity
            </h2>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link to="/library">
                View all <ChevronRight className="ml-1 size-3" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {recentResources.map((r, i) => {
              const p = progress.find((x) => x.resourceId === r.id);
              const pct = p
                ? p.status === "completed"
                  ? 100
                  : p.timeSpentSeconds > 0
                    ? Math.min(90, Math.round((p.timeSpentSeconds / 3600) * 100))
                    : 0
                : 0;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                >
                  <button
                    onClick={() =>
                      navigate({ to: "/study/$resourceId", params: { resourceId: r.id } })
                    }
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-1 p-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.type}
                        {r.dayAssignment ? ` · Day ${r.dayAssignment}` : ""}
                        {p?.timeSpentSeconds
                          ? ` · ${formatDuration(p.timeSpentSeconds)} studied`
                          : ""}
                      </p>
                    </div>
                    {pct > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              p?.status === "completed" ? "bg-success" : "bg-primary"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                          {p?.status === "completed" ? "✓" : `${pct}%`}
                        </span>
                      </div>
                    )}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {total === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-dashed border-border p-12 text-center"
        >
          <BookOpen className="mx-auto mb-3 size-10 text-muted-foreground/40" />
          <h3 className="text-base font-semibold">Get started</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Import resources from Google Drive to begin studying.
          </p>
          <Button asChild className="mt-4">
            <Link to="/library">Go to Library</Link>
          </Button>
        </motion.div>
      )}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-1 p-4 text-center transition-colors hover:bg-surface-2 hover:shadow-sm"
    >
      <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}
