import { format, differenceInCalendarDays, subDays } from "date-fns";
import { getDb, type Progress, type StudySession } from "@/db/schema";

export async function getOrCreateProgress(resourceId: string): Promise<Progress> {
  const db = getDb();
  // Atomic get-or-insert: without the transaction two concurrent callers (e.g.
  // the study-session timer's addTimeSpent racing a setStatus) can both miss the
  // row and insert competing defaults.
  return db.transaction("rw", db.progress, db.resources, async () => {
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
      feynmanScore: null,
    };
    await db.progress.put(fresh);
    return fresh;
  });
}

export async function setStatus(resourceId: string, status: Progress["status"]) {
  const db = getDb();
  await db.transaction("rw", db.progress, db.resources, async () => {
    const p = await getOrCreateProgress(resourceId);
    p.status = status;
    if (status === "completed") p.completedAt = Date.now();
    await db.progress.put(p);
  });
}

export async function addTimeSpent(resourceId: string, seconds: number) {
  const db = getDb();
  await db.transaction("rw", db.progress, db.resources, async () => {
    const p = await getOrCreateProgress(resourceId);
    p.timeSpentSeconds += seconds;
    if (p.status === "not_started") p.status = "in_progress";
    await db.progress.put(p);
  });
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

export interface GamificationStats {
  xp: number;
  level: number;
  levelName: string;
  nextLevelXp: number;
  stars: number;
}

const LEVEL_NAMES = [
  "Novice",
  "Apprentice",
  "Scholar",
  "Adept",
  "Expert",
  "Master",
  "Grandmaster",
  "Sage"
];

export async function getGamificationStats(): Promise<GamificationStats> {
  const db = getDb();
  const progressList = await db.progress.toArray();
  const days = await db.days.toArray();
  const resources = await db.resources.toArray();

  let xp = 0;
  let stars = 0;

  for (const p of progressList) {
    if (p.status === "completed") {
      xp += 15; // Base XP for finishing a resource
    }
    if (p.quizScore !== null) {
      xp += 5; // Taking a quiz
      if (p.quizScore >= 80) stars += 1;
      if (p.quizScore === 100) xp += 10;
    }
    if (p.feynmanScore !== null) {
      xp += 10; // Taking feynman
      if (p.feynmanScore >= 80) stars += 1;
    }
  }

  // Planner Bonus: Check if all resources in a day are completed
  for (const d of days) {
    const dayResources = resources.filter(r => r.dayAssignment === d.number);
    if (dayResources.length > 0) {
      const isCompleted = dayResources.every(r => progressList.find(p => p.resourceId === r.id)?.status === "completed");
      if (isCompleted) {
        xp += 50; // Planner bonus
        stars += 1;
      }
    }
  }

  // XP scaling formula: each level takes progressively more XP
  // Level 1: 0-100
  // Level 2: 100-250
  // Level 3: 250-450
  // Level 4: 450-700
  let level = 1;
  let nextLevelXp = 100;
  let currentLevelBase = 0;
  
  while (xp >= nextLevelXp) {
    level++;
    currentLevelBase = nextLevelXp;
    nextLevelXp = currentLevelBase + (100 + (level - 1) * 50);
  }

  return {
    xp,
    level,
    levelName: LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)],
    nextLevelXp,
    stars
  };
}
