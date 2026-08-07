import { getDb } from "@/db/schema";

const BACKUP_HANDLE_KEY = "backupDirectoryHandle";
const BACKUP_FILENAME = "studyvault-backup.json";

interface WindowWithFS extends Window {
  showDirectoryPicker?: (opts?: {
    mode?: "read" | "readwrite";
  }) => Promise<FileSystemDirectoryHandle>;
}

export function isBackupSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as WindowWithFS).showDirectoryPicker === "function"
  );
}

export async function pickBackupFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!isBackupSupported()) return null;
  const handle = await (window as WindowWithFS).showDirectoryPicker!({ mode: "readwrite" });
  const db = getDb();
  await db.settings.put({ key: BACKUP_HANDLE_KEY, value: handle });
  await db.settings.put({ key: "autoBackupEnabled", value: true });
  return handle;
}

export async function getBackupHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await getDb().settings.get(BACKUP_HANDLE_KEY);
  if (!row) return null;
  const handle = row.value as FileSystemDirectoryHandle;
  if (!handle) return null;
  try {
    const anyHandle = handle as unknown as {
      queryPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
      requestPermission?: (opts: { mode: "readwrite" }) => Promise<PermissionState>;
    };
    const perm = (await anyHandle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    if (perm !== "granted") {
      const req = (await anyHandle.requestPermission?.({ mode: "readwrite" })) ?? "denied";
      if (req !== "granted") return null;
    }
    return handle;
  } catch {
    return null;
  }
}

export async function performAutoBackup(): Promise<{ success: boolean; error?: string }> {
  const dir = await getBackupHandle();
  if (!dir) return { success: false, error: "No backup folder configured or permission denied" };

  const db = getDb();
  const data = {
    version: 1,
    backupAt: new Date().toISOString(),
    resources: await db.resources.toArray(),
    days: await db.days.toArray(),
    notes: await db.notes.toArray(),
    progress: await db.progress.toArray(),
    study_sessions: await db.study_sessions.toArray(),
    video_progress: await db.video_progress.toArray(),
    pdf_annotations: await db.pdf_annotations.toArray(),
    bookmarks: await db.bookmarks.toArray(),
    quizzes: await db.quizzes.toArray(),
    flashcards: await db.flashcards.toArray(),
    folders: await db.folders.toArray(),
    youtube_playlists: await db.youtube_playlists.toArray(),
    notebooks: await db.notebooks.toArray(),
    notebook_cells: await db.notebook_cells.toArray(),
    settings: (await db.settings.toArray()).filter(
      (s) => s.key !== BACKUP_HANDLE_KEY && s.key !== "offlineDirectoryHandle",
    ),
  };

  try {
    const fileHandle = await dir.getFileHandle(BACKUP_FILENAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    await db.settings.put({ key: "lastBackupAt", value: Date.now() });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Write failed" };
  }
}

export async function checkForNewerBackup(): Promise<{ hasNewer: boolean; backupAt?: string }> {
  const dir = await getBackupHandle();
  if (!dir) return { hasNewer: false };

  try {
    const fileHandle = await dir.getFileHandle(BACKUP_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    const backupTime = new Date(data.backupAt).getTime();
    const lastBackupRow = await getDb().settings.get("lastBackupAt");
    const lastKnown = (lastBackupRow?.value as number) ?? 0;
    if (backupTime > lastKnown + 60_000) {
      return { hasNewer: true, backupAt: data.backupAt };
    }
    return { hasNewer: false };
  } catch {
    return { hasNewer: false };
  }
}

export async function importFromBackupFolder(): Promise<{ success: boolean; error?: string }> {
  const dir = await getBackupHandle();
  if (!dir) return { success: false, error: "No backup folder" };

  try {
    const fileHandle = await dir.getFileHandle(BACKUP_FILENAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const data = JSON.parse(text);
    const db = getDb();

    await db.transaction(
      "rw",
      [
        db.resources,
        db.days,
        db.notes,
        db.progress,
        db.study_sessions,
        db.video_progress,
        db.pdf_annotations,
        db.bookmarks,
        db.quizzes,
        db.flashcards,
        db.folders,
        db.settings,
        db.youtube_playlists,
        db.notebooks,
        db.notebook_cells,
      ],
      async () => {
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
          db.youtube_playlists.clear(),
          db.notebooks.clear(),
          db.notebook_cells.clear(),
        ]);
        if (data.resources) await db.resources.bulkPut(data.resources);
        if (data.days) await db.days.bulkPut(data.days);
        if (data.notes) await db.notes.bulkPut(data.notes);
        if (data.progress) await db.progress.bulkPut(data.progress);
        if (data.study_sessions) await db.study_sessions.bulkPut(data.study_sessions);
        if (data.video_progress) await db.video_progress.bulkPut(data.video_progress);
        if (data.pdf_annotations) await db.pdf_annotations.bulkPut(data.pdf_annotations);
        if (data.bookmarks) await db.bookmarks.bulkPut(data.bookmarks);
        if (data.quizzes) await db.quizzes.bulkPut(data.quizzes);
        if (data.flashcards) await db.flashcards.bulkPut(data.flashcards);
        if (data.folders) await db.folders.bulkPut(data.folders);
        if (data.settings) await db.settings.bulkPut(data.settings);
        if (data.youtube_playlists) await db.youtube_playlists.bulkPut(data.youtube_playlists);
        if (data.notebooks) await db.notebooks.bulkPut(data.notebooks);
        if (data.notebook_cells) await db.notebook_cells.bulkPut(data.notebook_cells);
      },
    );
    await db.settings.put({ key: "lastBackupAt", value: Date.now() });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Import failed" };
  }
}

export async function disableAutoBackup(): Promise<void> {
  const db = getDb();
  await db.settings.put({ key: "autoBackupEnabled", value: false });
  await db.settings.delete(BACKUP_HANDLE_KEY);
}
