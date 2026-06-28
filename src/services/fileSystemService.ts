import { getDb, type Resource } from "@/db/schema";
import { classifyByName, driveDownloadUrl } from "./driveService";
import { nanoid } from "nanoid";

const HANDLE_KEY = "offlineDirectoryHandle";

interface WindowWithFS extends Window {
  showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

export function isFsSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as WindowWithFS).showDirectoryPicker === "function";
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsSupported()) return null;
  const handle = await (window as WindowWithFS).showDirectoryPicker!({ mode: "readwrite" });
  await getDb().settings.put({ key: HANDLE_KEY, value: handle });
  await getDb().settings.put({ key: "offlineFolderGranted", value: true });
  return handle;
}

export async function getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const row = await getDb().settings.get(HANDLE_KEY);
  if (!row) return null;
  const handle = row.value as FileSystemDirectoryHandle;
  if (!handle) return null;
  // Verify permission
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

export async function downloadResourceToLocal(resourceId: string, onProgress?: (p: number) => void): Promise<void> {
  const db = getDb();
  const r = await db.resources.get(resourceId);
  if (!r) throw new Error("Resource not found");
  const dir = await getDirectoryHandle();
  if (!dir) throw new Error("No offline folder selected");
  const fileName = `day${r.dayAssignment ?? 0}_${r.orderIndex}_${r.name}`.replace(/[\\/:*?"<>|]/g, "_");
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const response = await fetch(driveDownloadUrl(r.driveId));
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);
  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      await writable.write(value);
      received += value.length;
      if (total > 0 && onProgress) onProgress(received / total);
    }
  }
  await writable.close();
  r.isDownloaded = true;
  r.localPath = fileName;
  await db.resources.put(r);
}

export async function readLocalResource(resourceId: string): Promise<File | null> {
  const db = getDb();
  const r = await db.resources.get(resourceId);
  if (!r || !r.isDownloaded || !r.localPath) return null;
  const dir = await getDirectoryHandle();
  if (!dir) return null;
  try {
    const fh = await dir.getFileHandle(r.localPath);
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function resourceUrl(resourceId: string): Promise<string> {
  const db = getDb();
  const r = await db.resources.get(resourceId);
  if (!r) throw new Error("Resource not found");
  // Locally-imported files (no driveId) live behind a stored FileSystemFileHandle.
  if (!r.driveId) {
    const file = await readLocalImportedFile(resourceId);
    if (file) return URL.createObjectURL(file);
    throw new Error("Local file is no longer accessible. Re-import the folder.");
  }
  if (r.isDownloaded) {
    const file = await readLocalResource(resourceId);
    if (file) return URL.createObjectURL(file);
  }
  return driveDownloadUrl(r.driveId);
}

// ───────────────────────────── Local folder import ─────────────────────────────

export interface LocalImportResult {
  imported: number;
  skipped: number;
  rootName: string;
}

/**
 * Let the user pick a local directory and ingest every file inside it as a
 * Resource (recursively). Files are stored as FileSystemFileHandles inside
 * IndexedDB via the Dexie settings table keyed by resource id, so they survive
 * across sessions without re-prompting (in browsers that allow it).
 */
export async function importLocalFolder(): Promise<LocalImportResult | null> {
  if (!isFsSupported()) {
    throw new Error("Your browser does not support local folder access. Try Chrome or Edge.");
  }
  const root = await (window as WindowWithFS).showDirectoryPicker!({ mode: "read" });
  const db = getDb();
  const existing = await db.resources.toArray();
  const existingPaths = new Set(existing.map((r) => r.localPath).filter(Boolean));
  let imported = 0;
  let skipped = 0;
  let order = existing.length + 1;
  const now = Date.now();
  const seenFolderPaths = new Set<string>();

  async function walk(
    dir: FileSystemDirectoryHandle,
    pathPrefix: string,
  ): Promise<void> {
    for await (const entry of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
      if (entry.kind === "directory") {
        const sub = entry as FileSystemDirectoryHandle;
        const subPath = pathPrefix ? `${pathPrefix}/${sub.name}` : sub.name;
        if (!seenFolderPaths.has(subPath)) {
          seenFolderPaths.add(subPath);
          const existingFolder = await db.folders.get(subPath);
          if (!existingFolder) {
            await db.folders.put({
              path: subPath,
              name: sub.name,
              parentPath: pathPrefix,
              createdAt: now,
              source: "user",
            });
          }
        }
        await walk(sub, subPath);
      } else if (entry.kind === "file") {
        const fh = entry as FileSystemFileHandle;
        const file = await fh.getFile();
        const localPath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
        if (existingPaths.has(localPath)) {
          skipped++;
          continue;
        }
        const id = `local-${nanoid(10)}`;
        const dayMatch = pathPrefix.match(/day\s*0*(\d+)/i);
        const r: Resource = {
          id,
          name: file.name,
          type: classifyByName(file.name, file.type),
          mimeType: file.type,
          driveId: "",
          size: file.size,
          dayAssignment: dayMatch ? Number(dayMatch[1]) : null,
          orderIndex: order++,
          isDownloaded: true,
          localPath,
          thumbnailUrl: null,
          addedAt: file.lastModified || now,
          lastOpenedAt: null,
          durationSeconds: null,
          folderPath: pathPrefix,
          parentFolderId: pathPrefix,
        };
        await db.resources.put(r);
        // Persist the file handle so we can re-open it later.
        await db.settings.put({ key: `localHandle:${id}`, value: fh });
        imported++;
      }
    }
  }

  await walk(root, "");
  // Save the root handle as the offline directory so existing flows still work.
  await db.settings.put({ key: HANDLE_KEY, value: root });
  await db.settings.put({ key: "offlineFolderGranted", value: true });
  return { imported, skipped, rootName: root.name };
}

export async function readLocalImportedFile(resourceId: string): Promise<File | null> {
  const row = await getDb().settings.get(`localHandle:${resourceId}`);
  if (!row) return null;
  const fh = row.value as FileSystemFileHandle;
  try {
    const anyHandle = fh as unknown as {
      queryPermission?: (opts: { mode: "read" }) => Promise<PermissionState>;
      requestPermission?: (opts: { mode: "read" }) => Promise<PermissionState>;
    };
    const perm = (await anyHandle.queryPermission?.({ mode: "read" })) ?? "granted";
    if (perm !== "granted") {
      const req = (await anyHandle.requestPermission?.({ mode: "read" })) ?? "denied";
      if (req !== "granted") return null;
    }
    return await fh.getFile();
  } catch {
    return null;
  }
}
