import { format, subDays, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { getDb } from "@/db/schema";
import { getStreak } from "./progressService";

export interface DayActivity {
  date: string;
  seconds: number;
  resources: { id: string; name: string; type: string }[];
}

export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  totalSeconds: number;
  daysActive: number;
  streak: number;
  resourcesStudied: { id: string; name: string; type: string; seconds: number }[];
  resourcesCompleted: { id: string; name: string; type: string }[];
  dueFlashcards: number;
  weakAreas: { id: string; name: string; score: number | null }[];
  dailyBreakdown: DayActivity[];
}

export async function getWeeklyRecap(endDate?: Date): Promise<WeeklyRecap> {
  const db = getDb();
  const end = endDate ?? new Date();
  const start = startOfWeek(end, { weekStartsOn: 1 }); // Monday
  const startMs = start.getTime();
  const endMs = end.getTime();
  const startStr = format(start, "yyyy-MM-dd");
  const endStr = format(end, "yyyy-MM-dd");

  const [sessions, resources, progress, flashcards] = await Promise.all([
    db.study_sessions.toArray(),
    db.resources.toArray(),
    db.progress.toArray(),
    db.flashcards.toArray(),
  ]);

  // Filter sessions to this week
  const weekSessions = sessions.filter((s) => {
    const d = new Date(s.date);
    return isWithinInterval(d, { start, end });
  });

  // Total study time
  const totalSeconds = weekSessions.reduce((sum, s) => sum + (s.totalTimeSeconds ?? 0), 0);

  // Days active (sessions with >30s)
  const activeDates = new Set(
    weekSessions.filter((s) => (s.totalTimeSeconds ?? 0) > 30).map((s) => s.date),
  );
  const daysActive = activeDates.size;

  // Resources studied this week
  const studiedIds = new Set(weekSessions.flatMap((s) => s.resourcesStudied ?? []));
  const resourceMap = new Map(resources.map((r) => [r.id, r]));

  // Per-resource time tracking
  const timeByResource = new Map<string, number>();
  for (const s of weekSessions) {
    for (const rid of s.resourcesStudied ?? []) {
      const prev = timeByResource.get(rid) ?? 0;
      timeByResource.set(rid, prev + (s.totalTimeSeconds ?? 0));
    }
  }

  const resourcesStudied = Array.from(studiedIds)
    .map((id) => {
      const r = resourceMap.get(id);
      return r ? { id, name: r.name, type: r.type, seconds: timeByResource.get(id) ?? 0 } : null;
    })
    .filter(Boolean) as { id: string; name: string; type: string; seconds: number }[];

  // Resources completed this week
  const completedIds = progress
    .filter(
      (p) =>
        p.status === "completed" &&
        p.completedAt &&
        p.completedAt >= startMs &&
        p.completedAt <= endMs,
    )
    .map((p) => p.resourceId);

  const resourcesCompleted = completedIds
    .map((id) => {
      const r = resourceMap.get(id);
      return r ? { id, name: r.name, type: r.type } : null;
    })
    .filter(Boolean) as { id: string; name: string; type: string }[];

  // Due flashcards
  const now = Date.now();
  const dueFlashcards = flashcards.filter((c) => c.dueAt <= now).length;

  // Weak areas: resources with low quiz scores (<60%) or in-progress but not completed
  const weakAreas = progress
    .filter((p) => {
      const r = resourceMap.get(p.resourceId);
      if (!r) return false;
      // Low quiz score
      if (p.quizScore != null && p.quizScore < 60) return true;
      // In progress for >7 days but not completed
      if (p.status === "in_progress" && p.timeSpentSeconds > 0 && p.timeSpentSeconds < 300)
        return true;
      return false;
    })
    .map((p) => {
      const r = resourceMap.get(p.resourceId);
      return {
        id: p.resourceId,
        name: r?.name ?? "Unknown",
        score: p.quizScore,
      };
    })
    .slice(0, 5);

  // Daily breakdown
  const dailyBreakdown: DayActivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = subDays(end, i);
    const dayStr = format(day, "yyyy-MM-dd");
    const daySessions = weekSessions.filter((s) => s.date === dayStr);
    const daySeconds = daySessions.reduce((sum, s) => sum + (s.totalTimeSeconds ?? 0), 0);
    const dayResourceIds = new Set(daySessions.flatMap((s) => s.resourcesStudied ?? []));
    const dayResources = Array.from(dayResourceIds)
      .map((id) => resourceMap.get(id))
      .filter(Boolean)
      .map((r) => ({ id: r!.id, name: r!.name, type: r!.type }));
    dailyBreakdown.push({ date: dayStr, seconds: daySeconds, resources: dayResources });
  }

  const streak = await getStreak();

  return {
    weekStart: startStr,
    weekEnd: endStr,
    totalSeconds,
    daysActive,
    streak,
    resourcesStudied: resourcesStudied.sort((a, b) => b.seconds - a.seconds),
    resourcesCompleted,
    dueFlashcards,
    weakAreas,
    dailyBreakdown,
  };
}
