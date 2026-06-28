import { getDb, type StudySession } from "@/db/schema";

/** YYYY-MM-DD in local tz. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Consecutive-day streak using study_sessions. Streak resets if today
 * has no session AND yesterday also had none (so today is counted as
 * "still alive" until midnight even with no activity yet).
 */
export async function computeStreak(): Promise<{ current: number; longest: number; today: number }> {
  const all = (await getDb().study_sessions.toArray()) as StudySession[];
  const days = new Set(all.map((s) => s.date));
  const todayKey = dayKey(new Date());
  const minsToday = Math.round(
    all.filter((s) => s.date === todayKey).reduce((acc, s) => acc + (s.totalTimeSeconds || 0), 0) / 60,
  );

  // Walk backwards from today.
  let current = 0;
  const cursor = new Date();
  // Allow today to be empty without breaking yesterday's streak.
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (days.has(dayKey(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest historical streak.
  const sorted = Array.from(days).sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const d = new Date(k + "T00:00:00");
    if (prev) {
      const diff = Math.round((d.getTime() - prev.getTime()) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = d;
  }

  return { current, longest, today: minsToday };
}
