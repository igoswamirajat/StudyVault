import { format, differenceInCalendarDays, subDays } from "date-fns";
import { getDb, type Progress, type StudySession } from "@/db/schema";

export async function getOrCreateProgress(resourceId: string): Promise<Progress> {
  const db = getDb();
  const existing = await db.progress.get(resourceId);
  if (existing) return existing;
  const res = await db.resources.get(resourceId);
  const fresh: Progress = {
    resourceId,
    dayNumber: res?.dayAssignment ?? null,
    status: "not_started",
    completedAt: null,
    timeSpentSeconds: 0,
    videoProgressSeconds: 0,
    quizScore: null,
  };
  await db.progress.put(fresh);
  return fresh;
}

export async function setStatus(resourceId: string, status: Progress["status"]) {
  const p = await getOrCreateProgress(resourceId);
  p.status = status;
  if (status === "completed") p.completedAt = Date.now();
  await getDb().progress.put(p);
}

export async function addTimeSpent(resourceId: string, seconds: number) {
  const p = await getOrCreateProgress(resourceId);
  p.timeSpentSeconds += seconds;
  if (p.status === "not_started") p.status = "in_progress";
  await getDb().progress.put(p);
}

export async function startSession(): Promise<number> {
  const session: StudySession = {
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: Date.now(),
    endTime: null,
    resourcesStudied: [],
    totalTimeSeconds: 0,
  };
  return (await getDb().study_sessions.add(session)) as number;
}

export async function endSession(id: number, resourcesStudied: string[], totalSeconds: number) {
  const db = getDb();
  const s = await db.study_sessions.get(id);
  if (!s) return;
  s.endTime = Date.now();
  s.resourcesStudied = Array.from(new Set([...(s.resourcesStudied ?? []), ...resourcesStudied]));
  s.totalTimeSeconds = totalSeconds;
  await db.study_sessions.put(s);
}

export async function getTodaySeconds(): Promise<number> {
  const today = format(new Date(), "yyyy-MM-dd");
  const sessions = await getDb().study_sessions.where("date").equals(today).toArray();
  return sessions.reduce((acc, s) => acc + (s.totalTimeSeconds ?? 0), 0);
}

export async function getStreak(): Promise<number> {
  const sessions = await getDb().study_sessions.toArray();
  const dates = new Set(sessions.filter((s) => (s.totalTimeSeconds ?? 0) > 30).map((s) => s.date));
  let streak = 0;
  let cursor = new Date();
  while (dates.has(format(cursor, "yyyy-MM-dd"))) {
    streak++;
    cursor = subDays(cursor, 1);
  }
  // Allow today gap (if no session today but yesterday): start from yesterday
  if (streak === 0) {
    cursor = subDays(new Date(), 1);
    while (dates.has(format(cursor, "yyyy-MM-dd"))) {
      streak++;
      cursor = subDays(cursor, 1);
    }
  }
  return streak;
}

export async function getHeatmapData(days = 90): Promise<{ date: string; seconds: number }[]> {
  const sessions = await getDb().study_sessions.toArray();
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + (s.totalTimeSeconds ?? 0));
  }
  const out: { date: string; seconds: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    out.push({ date: d, seconds: byDate.get(d) ?? 0 });
  }
  return out;
}

export function daysSince(timestamp: number): number {
  return differenceInCalendarDays(new Date(), timestamp);
}
