// Local-only multi-workspace support.
// Each workspace owns its OWN Dexie database (named StudyVaultDB:<id>) so
// switching workspaces fully isolates resources/notes/progress/settings.
//
// Persisted in localStorage so it's available BEFORE Dexie boots.

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
}

const LIST_KEY = "studyvault:workspaces";
const ACTIVE_KEY = "studyvault:active-workspace";

export const WORKSPACE_CHANGED_EVENT = "studyvault:workspace-changed";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listWorkspaces(): Workspace[] {
  return read<Workspace[]>(LIST_KEY, []);
}

export function getActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function getActiveWorkspace(): Workspace | null {
  const id = getActiveWorkspaceId();
  if (!id) return null;
  return listWorkspaces().find((w) => w.id === id) ?? null;
}

export function createWorkspace(name: string): Workspace {
  const trimmed = name.trim() || "Untitled workspace";
  const id =
    "ws_" +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36).slice(-4);
  const ws: Workspace = { id, name: trimmed, createdAt: Date.now() };
  const list = listWorkspaces();
  list.push(ws);
  write(LIST_KEY, list);
  return ws;
}

export function renameWorkspace(id: string, name: string) {
  const list = listWorkspaces().map((w) =>
    w.id === id ? { ...w, name: name.trim() || w.name } : w,
  );
  write(LIST_KEY, list);
}

export function setActiveWorkspace(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
  window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
}

export function clearActiveWorkspace() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT));
}

/**
 * Hard-delete a workspace: drops its Dexie DB and removes its entry.
 * If it was the active one, also clears the active pointer.
 */
export async function deleteWorkspace(id: string): Promise<void> {
  const list = listWorkspaces().filter((w) => w.id !== id);
  write(LIST_KEY, list);
  if (getActiveWorkspaceId() === id) clearActiveWorkspace();
  if (typeof window !== "undefined" && "indexedDB" in window) {
    try {
      await new Promise<void>((resolve) => {
        const req = window.indexedDB.deleteDatabase(`StudyVaultDB:${id}`);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    } catch {
      /* ignore */
    }
  }
}

export function dbNameForActiveWorkspace(): string {
  const id = getActiveWorkspaceId();
  // Fallback name keeps legacy single-workspace data accessible if no
  // workspace has been chosen yet (shouldn't happen once UI ships, but
  // protects existing installs).
  return id ? `StudyVaultDB:${id}` : "StudyVaultDB";
}
