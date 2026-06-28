import { useCallback, useEffect, useRef, useState } from "react";

export interface DraggableOptions {
  /** Stable id used to persist last position across reloads. */
  storageKey: string;
  /** Default position when nothing is saved. Negative values measure from right/bottom. */
  defaultPos?: { x?: number; y?: number; right?: number; bottom?: number };
}

export interface DraggableState {
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
  style: React.CSSProperties;
  dragging: boolean;
}

/**
 * Tiny pointer-based dragger for floating UI widgets (pomodoro, debug…).
 * Keeps the element inside the viewport and persists position in localStorage
 * so it stays where the user parked it across reloads.
 */
export function useDraggable({ storageKey, defaultPos }: DraggableOptions): DraggableState {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ dx: number; dy: number } | null>(null);

  // Capture defaults once — callers commonly pass a fresh object literal each
  // render, which would otherwise re-run init and reset the drag position.
  const defaultPosRef = useRef(defaultPos);

  // Initialize from storage or defaults once per storageKey.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        setPos(clampToViewport(parsed.x, parsed.y, containerRef.current));
        return;
      }
    } catch { /* noop */ }
    const el = containerRef.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const d = defaultPosRef.current;
    const x = d?.x != null ? d.x : vw - w - (d?.right ?? 16);
    const y = d?.y != null ? d.y : vh - h - (d?.bottom ?? 16);
    setPos(clampToViewport(x, y, el));
  }, [storageKey]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragState.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      if (!dragState.current) return;
      const x = e.clientX - dragState.current.dx;
      const y = e.clientY - dragState.current.dy;
      setPos(clampToViewport(x, y, containerRef.current));
    };
    const up = () => {
      setDragging(false);
      dragState.current = null;
      try {
        if (pos) window.localStorage.setItem(storageKey, JSON.stringify(pos));
      } catch { /* noop */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, pos, storageKey]);

  // Persist on any pos change while not dragging too (e.g., viewport resize clamps).
  useEffect(() => {
    if (!pos || dragging) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pos));
    } catch { /* noop */ }
  }, [pos, dragging, storageKey]);

  const style: React.CSSProperties = pos
    ? { position: "fixed", left: pos.x, top: pos.y, right: "auto", bottom: "auto", touchAction: "none" }
    : { position: "fixed", visibility: "hidden" };

  return {
    containerRef,
    handleProps: {
      onPointerDown,
      style: { cursor: dragging ? "grabbing" : "grab", touchAction: "none" },
    },
    style,
    dragging,
  };
}

function clampToViewport(x: number, y: number, el: HTMLElement | null) {
  if (typeof window === "undefined") return { x, y };
  const w = el?.offsetWidth ?? 220;
  const h = el?.offsetHeight ?? 160;
  const maxX = Math.max(0, window.innerWidth - w - 4);
  const maxY = Math.max(0, window.innerHeight - h - 4);
  return {
    x: Math.min(Math.max(4, x), maxX),
    y: Math.min(Math.max(4, y), maxY),
  };
}
