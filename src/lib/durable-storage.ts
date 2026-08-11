/**
 * Durable storage for StudyVault workspaces.
 * Reuses the File System Access API patterns from fileSystemService.ts
 * and autoBackupService.ts.
 *
 * Live working set stays in Dexie. This module snapshots Dexie → JSON
 * on disk (user-chosen folder) and hydrates back on workspace open.
 */

import { getDb, resetDbCache } from "@/db/schema";
import { notify } from "./notify";

// ─── Types ───────────────────────────────────────────────────────────────

export interface WorkspaceMeta {
  id: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
  version: number;
}

export interface WorkspaceSnapshot {
  meta: WorkspaceMeta;
  tables: Record<string, unknown[]>;
  exportedAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const ROOT_HANDLE_KEY = "durableRootHandle";
const SNAPSHOT_VERSION = 1;
const DEBOUNCE_MS = 5000;

const TABLE_NAMES = [
  "resources",
  "days",
  "notes",
  "progress",
  "video_progress",
  "study_sessions",
  "pdf_annotations",
  "bookmarks",
  "quizzes",
  "flashcards",
  "folders",
  "file_operations_log",
  "settings",
  "youtube_playlists",
  "notebooks",
  "notebook_cells",
] as const;

// ─── FS support detection (same pattern as fileSystemService.ts) ─────────

interface WindowWithFS extends Window {
  showDirectoryPicker?: (opts?: {
    mode?: "read" | "readwrite";
    id?: string;
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

function isFsSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as WindowWithFS).showDirectoryPicker === "function"
  );
}

// ─── Handle persistence (same pattern as existing services) ──────────────

async function getStoredRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const row = await getDb().settings.get(ROOT_HANDLE_KEY);
    return (row?.value as FileSystemDirectoryHandle) ?? null;
  } catch {
    return null;
  }
}

async function storeRootHandle(handle: FileSystemDirectoryHandle) {
  await getDb().settings.put({ key: ROOT_HANDLE_KEY, value: handle });
}

async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<boolean> {
  try {
    const anyHandle = handle as unknown as {
      queryPermission?: (opts: { mode: string }) => Promise<PermissionState>;
      requestPermission?: (opts: { mode: string }) => Promise<PermissionState>;
    };
    const perm = (await anyHandle.queryPermission?.({ mode })) ?? "granted";
    if (perm === "granted") return true;
    const req = (await anyHandle.requestPermission?.({ mode })) ?? "denied";
    return req === "granted";
  } catch {
    return false;
  }
}

// ─── Root directory selection ────────────────────────────────────────────

export async function chooseDurableRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsSupported()) {
    notify.warn("Browser doesn't support durable storage", {
      description: "Use Chrome or Edge for filesystem-backed workspaces",
    });
    return null;
  }

  try {
    const handle = await (window as WindowWithFS).showDirectoryPicker!({
      mode: "readwrite",
      id: "studyvault-root",
      startIn: "documents",
    });

    await handle.getDirectoryHandle("workspaces", { create: true });
    await storeRootHandle(handle);

    notify.success("Durable storage enabled", {
      description: "Workspaces will now be saved to this folder",
    });
    return handle;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    notify.error("Could not open folder", {
      description: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function getDurableRoot(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getStoredRootHandle();
  if (!handle) return null;
  const ok = await ensurePermission(handle, "readwrite");
  return ok ? handle : null;
}

export async function isDurableStorageEnabled(): Promise<boolean> {
  const handle = await getStoredRootHandle();
  return handle !== null;
}

// ─── Low-level FS helpers ────────────────────────────────────────────────

async function writeBackupThenTarget(
  dir: FileSystemDirectoryHandle,
  filename: string,
  data: string,
) {
  const bakName = `${filename}.bak`;

  // If target exists, back it up first
  try {
    const existing = await dir.getFileHandle(filename);
    const file = await existing.getFile();
    const text = await file.text();
    const bak = await dir.getFileHandle(bakName, { create: true });
    const bw = await bak.createWritable();
    await bw.write(text);
    await bw.close();
  } catch {
    // No existing file to back up — fine
  }

  // Write the target
  const target = await dir.getFileHandle(filename, { create: true });
  const tw = await target.createWritable();
  await tw.write(data);
  await tw.close();
}

async function readTextFile(
  dir: FileSystemDirectoryHandle,
  filename: string,
): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(filename);
    const file = await fh.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

// ─── Snapshot / Hydrate ──────────────────────────────────────────────────

export async function createSnapshot(
  workspaceId: string,
  name: string,
): Promise<WorkspaceSnapshot> {
  const db = getDb();

  const tables: Record<string, unknown[]> = {};
  for (const t of TABLE_NAMES) {
    try {
      tables[t] = await db.table(t).toArray();
    } catch {
      // table might not exist yet in older schemas
    }
  }

  const meta: WorkspaceMeta = {
    id: workspaceId,
    name,
    createdAt: Date.now(),
    lastOpenedAt: Date.now(),
    version: SNAPSHOT_VERSION,
  };

  return { meta, tables, exportedAt: Date.now() };
}

export async function hydrateFromSnapshot(snapshot: WorkspaceSnapshot) {
  const db = getDb();

  await db.transaction("rw", db.tables, async () => {
    // Clear all tables
    await Promise.all(db.tables.map((t) => t.clear()));

    // Restore each table
    for (const [tableName, rows] of Object.entries(snapshot.tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      try {
        await db.table(tableName).bulkPut(rows);
      } catch {
        // skip tables that don't exist in current schema
      }
    }
  });
}

// ─── Public high-level API ───────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

export function markDirty() {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void forceSaveCurrentWorkspace();
  }, DEBOUNCE_MS);
}

export async function forceSaveCurrentWorkspace() {
  if (!dirty) return;

  const root = await getDurableRoot();
  if (!root) return;

  const { getActiveWorkspaceId, listWorkspaces } = await import("@/services/workspaceService");
  const id = getActiveWorkspaceId();
  if (!id) return;

  const ws = listWorkspaces().find((w) => w.id === id);
  if (!ws) return;

  try {
    const workspacesDir = await root.getDirectoryHandle("workspaces", { create: true });
    const wsDir = await workspacesDir.getDirectoryHandle(id, { create: true });

    const snapshot = await createSnapshot(id, ws.name);

    // Preserve original createdAt if we have an existing meta.json
    const existingMetaRaw = await readTextFile(wsDir, "meta.json");
    if (existingMetaRaw) {
      try {
        const old = JSON.parse(existingMetaRaw) as WorkspaceMeta;
        snapshot.meta.createdAt = old.createdAt ?? snapshot.meta.createdAt;
      } catch {
        // corrupt meta — overwrite
      }
    }

    const json = JSON.stringify(snapshot, null, 2);
    await writeBackupThenTarget(wsDir, "snapshot.json", json);
    await writeBackupThenTarget(wsDir, "meta.json", JSON.stringify(snapshot.meta, null, 2));

    dirty = false;
  } catch (err: unknown) {
    console.error("[durable] save failed", err);
    notify.error("Failed to save workspace to disk", {
      description: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
    });
  }
}

export async function loadWorkspaceFromDisk(workspaceId: string): Promise<boolean> {
  const root = await getDurableRoot();
  if (!root) return false;

  try {
    const workspacesDir = await root.getDirectoryHandle("workspaces");
    const wsDir = await workspacesDir.getDirectoryHandle(workspaceId);

    const raw = await readTextFile(wsDir, "snapshot.json");
    if (!raw) return false;

    const snapshot: WorkspaceSnapshot = JSON.parse(raw);
    await hydrateFromSnapshot(snapshot);
    return true;
  } catch {
    return false;
  }
}

// ─── Force save on page hide / unload ────────────────────────────────────

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void forceSaveCurrentWorkspace();
    }
  });
  window.addEventListener("beforeunload", () => {
    void forceSaveCurrentWorkspace();
  });
}
