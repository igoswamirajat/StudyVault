/**
 * Tiny event bus so viewers (PDF page, Video time) can broadcast state to the
 * NotesPanel without prop drilling, and viewers can request a "save highlight"
 * append into the active resource's Summary note.
 */

export interface ViewerState {
  resourceId: string;
  page?: number;
  time?: number;
}

export interface HighlightPayload {
  resourceId: string;
  text: string;
  page?: number;
  time?: number | null;
}

const VIEWER_STATE_EVENT = "studyvault:viewer-state";
const HIGHLIGHT_EVENT = "studyvault:highlight";

export function emitViewerState(state: ViewerState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ViewerState>(VIEWER_STATE_EVENT, { detail: state }));
}

export function onViewerState(cb: (s: ViewerState) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<ViewerState>).detail);
  window.addEventListener(VIEWER_STATE_EVENT, handler);
  return () => window.removeEventListener(VIEWER_STATE_EVENT, handler);
}

export function emitHighlight(payload: HighlightPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<HighlightPayload>(HIGHLIGHT_EVENT, { detail: payload }));
}

export function onHighlight(cb: (p: HighlightPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<HighlightPayload>).detail);
  window.addEventListener(HIGHLIGHT_EVENT, handler);
  return () => window.removeEventListener(HIGHLIGHT_EVENT, handler);
}
