import { getDb, type Resource, type FolderRow } from "@/db/schema";
import { nanoid } from "nanoid";

/** Returns only non-trashed resources. Use everywhere except /trash. */
export async function liveResources(): Promise<Resource[]> {
  const all = await getDb().resources.toArray();
  return all.filter((r) => (r.status ?? "active") === "active");
}

export async function trashedResources(): Promise<Resource[]> {
  const all = await getDb().resources.toArray();
  return all.filter((r) => r.status === "trashed");
}

async function logOp(type: string, payload: unknown) {
  try {
    await getDb().file_operations_log.put({
      id: nanoid(),
      type: type as never,
      payload: JSON.stringify(payload),
      timestamp: Date.now(),
    });
  } catch {
    /* logging is best-effort */
  }
}

/* ---------------------------------------------------------- Trash --- */

export async function trashResources(ids: string[]) {
  if (ids.length === 0) return;
  const db = getDb();
  const snap: Array<{ id: string; folderPath: string | undefined }> = [];
  await db.transaction("rw", db.resources, async () => {
    for (const id of ids) {
      const r = await db.resources.get(id);
      if (!r) continue;
      snap.push({ id, folderPath: r.folderPath });
      await db.resources.update(id, {
        status: "trashed",
        trashedAt: Date.now(),
        originalFolderPath: r.folderPath ?? "",
      });
    }
  });
  await logOp("trash", { ids });
  return snap;
}

export async function restoreResources(ids: string[]) {
  if (ids.length === 0) return;
  const db = getDb();
  await db.transaction("rw", db.resources, async () => {
    for (const id of ids) {
      const r = await db.resources.get(id);
      if (!r) continue;
      await db.resources.update(id, {
        status: "active",
        trashedAt: null,
        folderPath: r.originalFolderPath ?? r.folderPath ?? "",
      });
    }
  });
  await logOp("restore", { ids });
}

export async function purgeResources(ids: string[]) {
  if (ids.length === 0) return;
  const db = getDb();
  await db.transaction("rw", db.resources, db.progress, db.video_progress, async () => {
    for (const id of ids) {
      await db.resources.delete(id);
      await db.progress.delete(id);
      await db.video_progress.delete(id);
    }
  });
  await logOp("purge", { ids });
}

export async function emptyTrash() {
  const ids = (await trashedResources()).map((r) => r.id);
  await purgeResources(ids);
  return ids.length;
}

/* --------------------------------------------------------- Rename --- */

export async function renameResource(id: string, nextName: string) {
  const name = nextName.trim();
  if (!name) throw new Error("Name can't be empty");
  const db = getDb();
  const target = await db.resources.get(id);
  if (!target) throw new Error("Resource not found");
  // Collision check: same folder + same name (case-insensitive).
  const siblings = (await db.resources.toArray()).filter(
    (r) =>
      r.id !== id &&
      (r.status ?? "active") === "active" &&
      (r.folderPath ?? "") === (target.folderPath ?? "") &&
      r.name.toLowerCase() === name.toLowerCase(),
  );
  if (siblings.length) throw new Error("A file with this name already exists");
  await db.resources.update(id, { name });
  await logOp("rename", { id, from: target.name, to: name });
}

/* ----------------------------------------------------------- Move --- */

export async function moveResources(ids: string[], targetFolderPath: string) {
  if (ids.length === 0) return;
  const db = getDb();
  const path = targetFolderPath || "";
  await db.transaction("rw", db.resources, async () => {
    for (const id of ids) await db.resources.update(id, { folderPath: path });
  });
  await logOp("move", { ids, to: path });
}

/* ------------------------------------------------------------ Copy --- */

/** Duplicate resources. If targetFolderPath is undefined, copies stay in their current folder. */
export async function copyResources(
  ids: string[],
  targetFolderPath?: string,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const newIds: string[] = [];
  await db.transaction("rw", db.resources, async () => {
    for (const id of ids) {
      const r = await db.resources.get(id);
      if (!r) continue;
      const folderPath = targetFolderPath !== undefined ? targetFolderPath : (r.folderPath ?? "");
      // Find unique name within destination folder
      const siblings = (await db.resources.toArray()).filter(
        (x) =>
          (x.status ?? "active") === "active" &&
          (x.folderPath ?? "") === folderPath,
      );
      const baseName = r.name;
      let name = baseName === r.name && folderPath !== (r.folderPath ?? "") ? baseName : `${baseName} (copy)`;
      let i = 2;
      while (siblings.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        name = `${baseName} (copy ${i++})`;
      }
      const newId = nanoid();
      const copy: Resource = {
        ...r,
        id: newId,
        name,
        folderPath,
        addedAt: Date.now(),
        lastOpenedAt: null,
        copyOf: r.id,
        // Local-file copies share the same underlying file; cloud copies share driveId.
      };
      await db.resources.put(copy);
      newIds.push(newId);
    }
  });
  await logOp("copy", { ids, newIds, to: targetFolderPath ?? null });
  return newIds;
}

/* ------------------------------------------------------------ Tags --- */

export async function toggleTag(ids: string[], tag: string, add: boolean) {
  const db = getDb();
  await db.transaction("rw", db.resources, async () => {
    for (const id of ids) {
      const r = await db.resources.get(id);
      if (!r) continue;
      const set = new Set(r.tags ?? []);
      if (add) set.add(tag);
      else set.delete(tag);
      await db.resources.update(id, { tags: Array.from(set) });
    }
  });
  await logOp("tag", { ids, tag, add });
}

/* --------------------------------------------------------- Folders --- */

export async function listFoldersFlat(): Promise<FolderRow[]> {
  const folders = await getDb().folders.toArray();
  return folders.sort((a, b) => a.path.localeCompare(b.path));
}
