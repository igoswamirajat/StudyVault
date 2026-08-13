import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type Progress, type FocusHistory } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { getStreak, getHeatmapData, getTodaySeconds } from "@/services/progressService";
import { useSettings } from "@/hooks/useSettings";
import { formatDuration } from "@/lib/format-time";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { Flame, Target, CheckCircle2, Clock, Star, Trophy, Sparkles, CheckSquare, Square } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/progress")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <ProgressPage />
    </ClientOnly>
  ),
});

function ProgressPage() {
  const { settings } = useSettings();
  const resources = (useLiveQuery(() => getDb().resources.toArray(), []) ?? []);
  const days = (useLiveQuery(() => getDb().days.orderBy("number").toArray(), []) ?? []);
  const progress = useLiveQuery(() => getDb().progress.toArray(), [], [] as Progress[]);

  const [streak, setStreak] = useState(0);
  const [todaySec, setTodaySec] = useState(0);
  const [heatmap, setHeatmap] = useState<{ date: string; seconds: number }[]>([]);
  const [focusHistory, setFocusHistory] = useState<FocusHistory[]>([]);
  const [stats, setStats] = useState({ xp: 0, level: 1, levelName: "Novice", nextLevelXp: 100, stars: 0 });

  useEffect(() => {
    import("@/services/progressService").then((mod) => {
      mod.getStreak().then(setStreak);
      mod.getTodaySeconds().then(setTodaySec);
      mod.getHeatmapData(90).then(setHeatmap);
      mod.getGamificationStats().then(setStats);
      getDb().focus_history.orderBy("date").reverse().limit(14).toArray().then(setFocusHistory);
    });
  }, [progress, days]);

  const completed = progress.filter((p) => p.status === "completed").length;
  const total = resources.length;
  const completePct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const goalMinutes = (settings.dailyGoalMinutes as number) ?? 60;
  const goalProgress = Math.min(100, Math.round((todaySec / 60 / goalMinutes) * 100));

  const topTime = useMemo(() => {
    return resources
      .map((r) => ({
        name: r.name.length > 28 ? r.name.slice(0, 25) + "…" : r.name,
        seconds: progress.find((p) => p.resourceId === r.id)?.timeSpentSeconds ?? 0,
      }))
      .filter((x) => x.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10);
  }, [resources, progress]);

  const todayDay = days.find((d) => {
    const dr = resources.filter((r) => r.dayAssignment === d.number);
    const done = dr.filter((r) => progress.find((p) => p.resourceId === r.id)?.status === "completed").length;
    return done < dr.length;
  });

  const xpPct = Math.min(100, Math.round((stats.xp / stats.nextLevelXp) * 100));

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
          <p className="text-sm text-muted-foreground">Your learning at a glance.</p>
        </div>
        
        {/* Player Profile Header */}
        <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-surface-1 p-5 shadow-sm md:w-[380px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Trophy className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold tracking-tight">
                  Level {stats.level}: <span className="text-primary">{stats.levelName}</span>
                </div>
                <div className="text-xs text-muted-foreground">Keep studying to level up!</div>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-warning/10 px-3 py-1 text-sm font-bold text-warning">
              <Star className="size-4 fill-warning" />
              <span>{stats.stars}</span>
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>{stats.xp} XP</span>
              <span>{stats.nextLevelXp} XP</span>
            </div>
            <ProgressBar value={xpPct} className="h-2 bg-surface-3" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CheckCircle2 className="size-4 text-primary" />}
          label="Total progress"
          value={`${completed}/${total}`}
          sub={
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={completePct} className="h-1.5" />
              <span className="text-[10px] tabular-nums text-muted-foreground">{completePct}%</span>
            </div>
          }
        />
        <StatCard
          icon={<Target className="size-4 text-primary" />}
          label="Today's goal"
          value={`${Math.floor(todaySec / 60)} / ${goalMinutes} min`}
          sub={
            <div className="mt-2">
              <ProgressBar value={goalProgress} className="h-1.5" />
            </div>
          }
        />
        <StatCard
          icon={<Flame className="size-4 text-warning" />}
          label="Study streak"
          value={`🔥 ${streak} days`}
          sub={<p className="mt-2 text-xs text-muted-foreground">Keep it going!</p>}
        />
        <StatCard
          icon={<Clock className="size-4 text-primary" />}
          label="Time today"
          value={formatDuration(todaySec)}
          sub={
            <p className="mt-2 text-xs text-muted-foreground">
              {todayDay ? `On ${todayDay.title}` : "All done!"}
            </p>
          }
        />
      </div>

      <section className="rounded-xl border border-border bg-surface-1 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">By day</h2>
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">No days yet. Create some in the Organizer.</p>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {days.map((d) => {
              const dr = resources.filter((r) => r.dayAssignment === d.number);
              const done = dr.filter((r) => progress.find((p) => p.resourceId === r.id)?.status === "completed").length;
              const pct = dr.length > 0 ? Math.round((done / dr.length) * 100) : 0;
              return (
                <AccordionItem key={d.number} value={`d${d.number}`}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex w-full items-center justify-between pr-4">
                      <span>{d.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {done}/{dr.length} · {pct}%
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ProgressBar value={pct} className="mb-3 h-1.5" />
                    <ul className="space-y-1 text-xs">
                      {dr.map((r) => {
                        const p = progress.find((x) => x.resourceId === r.id);
                        return (
                          <li key={r.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-surface-2">
                            <span className="truncate">{r.name}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {p?.status === "completed" ? "✓" : p?.status === "in_progress" ? "…" : "—"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Activity (90 days)
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Less</span>
            <div className="flex gap-1">
              <div className="size-3 rounded-sm bg-surface-3" />
              <div className="size-3 rounded-sm bg-primary/30" />
              <div className="size-3 rounded-sm bg-primary/60" />
              <div className="size-3 rounded-sm bg-primary" />
            </div>
            <span>More</span>
          </div>
        </div>
        <TooltipProvider>
          <Heatmap data={heatmap} />
        </TooltipProvider>
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Focus History</h2>
        {focusHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No focus tasks recorded yet. Add items to your Focus Box!</p>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {focusHistory.map((fh) => {
              const completedTasks = fh.tasks.filter(t => t.done).length;
              const totalTasks = fh.tasks.length;
              const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              return (
                <AccordionItem key={fh.date} value={fh.date}>
                  <AccordionTrigger className="text-sm">
                    <div className="flex w-full items-center justify-between pr-4">
                      <span>{new Date(fh.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <span className="text-xs text-muted-foreground">
                        {completedTasks}/{totalTasks} · {pct}%
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ProgressBar value={pct} className="mb-3 h-1.5" />
                    <ul className="space-y-2 text-sm">
                      {fh.tasks.map((task, i) => (
                        <li key={task.id || i} className="flex items-start gap-2">
                          {task.done ? <CheckSquare className="mt-0.5 size-4 text-primary" /> : <Square className="mt-0.5 size-4 text-muted-foreground" />}
                          <span className={task.done ? "text-muted-foreground line-through" : ""}>{task.text}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-1 p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top 10 by time</h2>
        {topTime.length === 0 ? (
          <p className="text-sm text-muted-foreground">No study time recorded yet.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topTime} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 4 }}>
                <XAxis type="number" tickFormatter={(v) => formatDuration(v)} stroke="oklch(0.66 0.024 270)" fontSize={11} />
                <YAxis dataKey="name" type="category" width={180} stroke="oklch(0.66 0.024 270)" fontSize={11} />
                <RechartsTooltip
                  cursor={{ fill: 'var(--surface-2)' }}
                  contentStyle={{ background: "var(--background)", border: "1px solid var(--border)", borderRadius: "6px", fontSize: 12 }}
                  formatter={(v) => [formatDuration(Number(v)), "Time Studied"]}
                />
                <Bar dataKey="seconds" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub}
    </div>
  );
}

function Heatmap({ data }: { data: { date: string; seconds: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.seconds));
  const weeks: { date: string; seconds: number }[][] = [];
  let cur: { date: string; seconds: number }[] = [];
  for (const d of data) {
    cur.push(d);
    if (cur.length === 7) {
      weeks.push(cur);
      cur = [];
    }
  }
  if (cur.length) weeks.push(cur);
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
      {weeks.map((w, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          {w.map((d) => {
            const intensity = d.seconds / max;
            const bg = d.seconds === 0
              ? "bg-surface-3/50 hover:bg-surface-3"
              : intensity > 0.66
                ? "bg-primary hover:bg-primary/90"
                : intensity > 0.33
                  ? "bg-primary/60 hover:bg-primary/70"
                  : "bg-primary/30 hover:bg-primary/40";
            return (
              <Tooltip key={d.date}>
                <TooltipTrigger asChild>
                  <div
                    className={`size-3.5 rounded-[3px] transition-colors ${bg} cursor-pointer`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <span className="font-semibold">{d.seconds > 0 ? formatDuration(d.seconds) : "No activity"}</span>
                  <span className="ml-2 text-muted-foreground">{new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
