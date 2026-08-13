import { getDb } from "@/db/schema";
import { generateFullBackupData, importFullBackup } from "./exportService";

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

export async function checkBackupPermission(): Promise<"granted" | "prompt" | "denied"> {
  const row = await getDb().settings.get(BACKUP_HANDLE_KEY);
  if (!row || !row.value) return "denied";
  const handle = row.value as FileSystemDirectoryHandle;
  try {
    const anyHandle = handle as any;
    return (await anyHandle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  } catch {
    return "denied";
  }
}

export async function requestBackupPermission(): Promise<boolean> {
  const row = await getDb().settings.get(BACKUP_HANDLE_KEY);
  if (!row || !row.value) return false;
  const handle = row.value as FileSystemDirectoryHandle;
  try {
    const anyHandle = handle as any;
    const perm = await anyHandle.requestPermission?.({ mode: "readwrite" });
    return perm === "granted";
  } catch {
    return false;
  }
}

export async function getBackupHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await getDb().settings.get(BACKUP_HANDLE_KEY);
  if (!row || !row.value) return null;
  const handle = row.value as FileSystemDirectoryHandle;
  
  const state = await checkBackupPermission();
  if (state === "granted") return handle;
  
  // Try to request it (will fail if not triggered by user gesture, but we try)
  const granted = await requestBackupPermission();
  return granted ? handle : null;
}

export async function performAutoBackup(): Promise<{ success: boolean; error?: string }> {
  const dir = await getBackupHandle();
  if (!dir) return { success: false, error: "No backup folder configured or permission denied" };

  try {
    const data = await generateFullBackupData();
    
    // Auto backup shouldn't save backup directory handles
    if (data.settings) {
      data.settings = data.settings.filter(
        (s) => s.key !== BACKUP_HANDLE_KEY && s.key !== "offlineDirectoryHandle",
      );
    }

    const jsonString = JSON.stringify(data, null, 2);

    const fileHandle = await dir.getFileHandle(BACKUP_FILENAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(jsonString);
    await writable.close();
    await getDb().settings.put({ key: "lastBackupAt", value: Date.now() });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Write failed" };
  }
}

export async function checkForNewerBackup(): Promise<{ hasNewer: boolean; backupAt?: string; file?: File }> {
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
      return { hasNewer: true, backupAt: new Date(backupTime).toLocaleString(), file };
    }
  } catch {
    // missing or corrupted
  }
  return { hasNewer: false };
}

export async function importFromBackupFolder(): Promise<{ success: boolean; error?: string }> {
  const dir = await getBackupHandle();
  if (!dir) return { success: false, error: "No backup folder" };

  try {
    const fileHandle = await dir.getFileHandle(BACKUP_FILENAME);
    const file = await fileHandle.getFile();
    await importFullBackup(file);
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
