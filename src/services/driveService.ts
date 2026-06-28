import { nanoid } from "nanoid";
import { getDb, type Resource } from "@/db/schema";
import { FOLDER_MIME, classifyByName, driveThumbUrl, type ScannedFile } from "./driveParse";
import { scanDriveEmbedServerFn, checkDriveEmbedServerFn } from "./driveScan.functions";

// Re-export the pure helpers so existing `@/services/driveService` imports keep working.
export {
  extractFolderId,
  looksLikeDriveFolder,
  driveDownloadUrl,
  driveOpenUrl,
  driveThumbUrl,
  classifyByName,
  parseEmbedHtml,
} from "./driveParse";
export type { ScannedFile } from "./driveParse";

/**
 * Recursively scan a public Google Drive folder. Tries the API key path first
 * (supports folders/subfolders), then falls back to the embeddedfolderview
 * scrape (root-only) via a server-side proxy that avoids CORS — so it works
 * in the browser with no API key.
 */
export async function scanFolder(folderId: string, apiKey?: string | null): Promise<ScannedFile[]> {
  if (apiKey) {
    try {
      return await scanWithApiRecursive(folderId, apiKey);
    } catch (e) {
      console.warn("Drive API scan failed, falling back to embed proxy:", e);
    }
  }
  // Keyless path: the embed view only sees the folder's top level and can't read
  // file types/sizes. Drop subfolders (we can't recurse into them without a key).
  const entries = await scanDriveEmbedServerFn({ data: { folderId } });
  const files = entries.filter((e) => e.mimeType !== FOLDER_MIME);
  const subfolders = entries.length - files.length;
  if (files.length === 0 && subfolders > 0) {
    throw new Error(
      `This folder only contains ${subfolders} subfolder${subfolders === 1 ? "" : "s"} and no files at the top level. ` +
        `The keyless scan can't look inside subfolders — add a Drive API key to import everything.`,
    );
  }
  return files;
}

async function scanWithApiRecursive(rootId: string, apiKey: string): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  const visited = new Set<string>();
  // BFS over folders
  const queue: Array<{ id: string; path: string }> = [{ id: rootId, path: "" }];
  while (queue.length) {
    const { id, path } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const entries = await listFolderApi(id, apiKey);
    for (const f of entries) {
      if (f.mimeType === FOLDER_MIME) {
        const childPath = path ? `${path}/${f.name}` : f.name;
        queue.push({ id: f.id, path: childPath });
      } else {
        results.push({
          driveId: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? Number(f.size) : 0,
          thumbnailUrl: f.thumbnailLink ?? driveThumbUrl(f.id),
          folderPath: path,
          parentFolderId: id,
          createdTime: f.createdTime ? Date.parse(f.createdTime) || null : null,
        });
      }
    }
  }
  return results;
}

async function listFolderApi(
  folderId: string,
  apiKey: string,
): Promise<
  Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    thumbnailLink?: string;
    createdTime?: string;
  }>
> {
  const out: Array<{
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    thumbnailLink?: string;
    createdTime?: string;
  }> = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,size,createdTime,thumbnailLink,parents)",
    );
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("orderBy", "createdTime");
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Drive API ${res.status}`);
    const data = (await res.json()) as {
      files?: Array<{
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        thumbnailLink?: string;
        createdTime?: string;
      }>;
      nextPageToken?: string;
    };
    for (const f of data.files ?? []) out.push(f);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export async function ingestScannedFiles(files: ScannedFile[]): Promise<Resource[]> {
  const db = getDb();
  const now = Date.now();
  const existing = new Map((await db.resources.toArray()).map((r) => [r.driveId, r]));
  const created: Resource[] = [];
  let order = (await db.resources.count()) + 1;
  // Seed the folders table from every distinct folderPath encountered.
  const seenPaths = new Set<string>();
  for (const f of files) {
    if (existing.has(f.driveId)) continue;
    const type = classifyByName(f.name, f.mimeType);
    const dayMatch = f.folderPath.match(/day\s*0*(\d+)/i);
    const dayAssignment = dayMatch ? Number(dayMatch[1]) : null;
    const addedAt = f.createdTime ?? now;
    const r: Resource = {
      id: f.driveId,
      name: f.name,
      type,
      mimeType: f.mimeType,
      driveId: f.driveId,
      size: f.size,
      dayAssignment,
      orderIndex: order++,
      isDownloaded: false,
      localPath: null,
      thumbnailUrl: f.thumbnailUrl,
      addedAt,
      lastOpenedAt: null,
      durationSeconds: null,
      folderPath: f.folderPath,
      parentFolderId: f.parentFolderId,
    };
    await db.resources.put(r);
    if (dayAssignment !== null) {
      const existingDay = await db.days.get(dayAssignment);
      if (!existingDay) {
        await db.days.put({
          number: dayAssignment,
          title: f.folderPath.split("/").pop() ?? `Day ${dayAssignment}`,
          createdAt: now,
        });
      }
    }
    // Register folder + every ancestor in folders table.
    if (f.folderPath) {
      const segments = f.folderPath.split("/").filter(Boolean);
      for (let i = 0; i < segments.length; i++) {
        const path = segments.slice(0, i + 1).join("/");
        if (seenPaths.has(path)) continue;
        seenPaths.add(path);
        const existingFolder = await db.folders.get(path);
        if (!existingFolder) {
          await db.folders.put({
            path,
            name: segments[i],
            parentPath: segments.slice(0, i).join("/"),
            createdAt: addedAt,
            source: "drive",
          });
        }
      }
    }
    created.push(r);
  }
  return created;
}

export interface DriveHealth {
  ok: boolean;
  folderId: string | null;
  mode: "api" | "embed" | "none";
  fileCount: number;
  checkedAt: number;
  error: string | null;
}

/**
 * Lightweight Drive connection health check. Tries the API (if a key is saved)
 * or the public embedded folder view. Does NOT modify any data — purely a probe.
 */
export async function checkDriveHealth(
  folderId: string | null,
  apiKey: string | null,
): Promise<DriveHealth> {
  const base: DriveHealth = {
    ok: false,
    folderId,
    mode: "none",
    fileCount: 0,
    checkedAt: Date.now(),
    error: null,
  };
  if (!folderId) {
    return { ...base, error: "No folder connected" };
  }
  try {
    if (apiKey) {
      const entries = await listFolderApi(folderId, apiKey);
      return { ...base, ok: true, mode: "api", fileCount: entries.length };
    }
    // Keyless path: probe via the server-side embed proxy (no CORS).
    const health = await checkDriveEmbedServerFn({ data: { folderId } });
    return {
      ...base,
      ok: health.ok,
      mode: "embed",
      fileCount: health.fileCount,
      error: health.error,
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

// nanoid is imported for downstream use elsewhere
export { nanoid };
