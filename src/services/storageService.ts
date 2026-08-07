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
    db.youtube_playlists.clear(),
    db.notebooks.clear(),
    db.notebook_cells.clear(),
  ]);

  notifySettingsChanged();
}

/** Reset only Drive resources. Other sources remain available in this workspace. */
export async function resetDriveCache(): Promise<void> {
  const db = getDb();
  const resources = await db.resources.toArray();
  const driveIds = resources
    .filter((resource) => (resource.source ?? (resource.driveId ? "drive" : "local")) === "drive")
    .map((resource) => resource.id);
  const driveIdSet = new Set(driveIds);
  const driveFolders = (await db.folders.toArray()).filter((folder) => folder.source === "drive");
  await db.transaction(
    "rw",
    [
      db.resources,
      db.folders,
      db.days,
      db.progress,
      db.video_progress,
      db.pdf_annotations,
      db.bookmarks,
    ],
    async () => {
      for (const id of driveIds) {
        await db.resources.delete(id);
        await db.progress.delete(id);
        await db.video_progress.delete(id);
        await db.pdf_annotations.where("resourceId").equals(id).delete();
        await db.bookmarks.where("resourceId").equals(id).delete();
      }
      for (const folder of driveFolders) await db.folders.delete(folder.path);
      for (const day of await db.days.toArray()) {
        const stillUsed = resources.some(
          (resource) => resource.dayAssignment === day.number && !driveIdSet.has(resource.id),
        );
        if (!stillUsed) await db.days.delete(day.number);
      }
    },
  );
  await db.settings.delete("driveId");
  await db.settings.delete("driveFolderUrl");
  if (resources.every((resource) => driveIdSet.has(resource.id))) {
    await db.settings.delete("appInitialized");
  }
  notifySettingsChanged();
}
