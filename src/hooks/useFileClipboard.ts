import { useEffect, useState } from "react";

export type ClipboardMode = "copy" | "cut";

interface ClipboardState {
  ids: string[];
  mode: ClipboardMode;
}

let current: ClipboardState | null = null;
const listeners = new Set<(s: ClipboardState | null) => void>();

function emit() {
  for (const l of listeners) l(current);
}

export const fileClipboard = {
  set(ids: string[], mode: ClipboardMode) {
    if (!ids.length) return;
    current = { ids: [...ids], mode };
    emit();
  },
  clear() {
    current = null;
    emit();
  },
  get(): ClipboardState | null {
    return current;
  },
};

export function useFileClipboard() {
  const [state, setState] = useState<ClipboardState | null>(current);
  useEffect(() => {
    const fn = (s: ClipboardState | null) => setState(s);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return {
    clipboard: state,
    copy: (ids: string[]) => fileClipboard.set(ids, "copy"),
    cut: (ids: string[]) => fileClipboard.set(ids, "cut"),
    clear: () => fileClipboard.clear(),
  };
}
