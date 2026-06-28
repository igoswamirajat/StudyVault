// Tiny session-scoped playlist used by the Organizer → Study Room "Open as
// Playlist" feature. The playlist drives prev/next navigation in the Study
// Room instead of the default day-based ordering.

const KEY = "studyvault:playlist";

export interface PlaylistState {
  label: string; // e.g. folder path label shown as breadcrumb prefix
  ids: string[]; // resource ids in playback order
}

export function setPlaylist(p: PlaylistState | null): void {
  if (typeof window === "undefined") return;
  if (!p) window.sessionStorage.removeItem(KEY);
  else window.sessionStorage.setItem(KEY, JSON.stringify(p));
}

export function getPlaylist(): PlaylistState | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlaylistState;
  } catch {
    return null;
  }
}
