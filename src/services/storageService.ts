import { getDb, DEFAULT_SETTINGS, type Setting } from "@/db/schema";

export const SETTINGS_CHANGED_EVENT = "studyvault:settings-changed";

function notifySettingsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT));
  }
}

export async function getSetting<T = unknown>(key: string, fallback?: T): Promise<T> {
  const row = await getDb().settings.get(key);
  if (row === undefined) {
    const def = (DEFAULT_SETTINGS[key] as T | undefined) ?? fallback;
    return def as T;
  }
  return row.value as T;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const row: Setting = { key, value };
  await getDb().settings.put(row);
  notifySettingsChanged();
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await getDb().settings.toArray();
  const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) result[r.key] = r.value;
  return result;
}

export async function resetAllData(): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.resources.clear(),
    db.days.clear(),
    db.notes.clear(),
    db.progress.clear(),
    db.study_sessions.clear(),
    db.video_progress.clear(),
    db.pdf_annotations.clear(),
    db.bookmarks.clear(),
    db.quizzes.clear(),
    db.flashcards.clear(),
    db.folders.clear(),
    db.file_operations_log.clear(),
    db.settings.clear(),
  ]);

  notifySettingsChanged();
}

/** Reset Drive-scan cache for the active workspace only: resources, folders,
 * folder-derived progress + drive connection settings. Keeps notes/flashcards. */
export async function resetDriveCache(): Promise<void> {
  const db = getDb();
  await Promise.all([
    db.resources.clear(),
    db.folders.clear(),
    db.days.clear(),
    db.progress.clear(),
    db.video_progress.clear(),
    db.pdf_annotations.clear(),
    db.bookmarks.clear(),
  ]);
  await db.settings.delete("driveId");
  await db.settings.delete("driveFolderUrl");
  await db.settings.delete("appInitialized");
  notifySettingsChanged();
}
