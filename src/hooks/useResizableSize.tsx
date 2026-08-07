import { useCallback, useEffect, useRef, useState } from "react";
import { getSetting, setSetting } from "@/services/storageService";
import { cn } from "@/lib/utils";

interface UseResizableSizeOptions {
  storageKey: string;
  /** Default px when nothing stored. */
  defaultValue: number;
  min: number;
  max: number;
  /** "left" grows bar toward the right; "central panel opposite. */
  direction: "left" | "right";
}

/**
 * Persistent width state + drag-to-resize mouse handler.
 * Width is stored under `settings` table via storageService.
 */
export function useResizableSize({
  storageKey,
  defaultValue,
  min,
  max,
  direction,
}: UseResizableSizeOptions) {
  const [size, setSize] = useState<number>(defaultValue);
  const loadedRef = useRef(false);

  useEffect(() => {
    void getSetting(storageKey).then((stored) => {
      if (typeof stored === "number" && Number.isFinite(stored))
        setSize(Math.max(min, Math.min(max, stored)));
      loadedRef.current = true;
    });
  }, [storageKey, min, max]);

  useEffect(() => {
    if (!loadedRef.current) return;
    void setSetting(storageKey, size);
  }, [size, storageKey]);

  const startDrag = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startSize = size;

      function onMove(e: MouseEvent) {
        const delta = (e.clientX - startX) * (direction === "left" ? 1 : -1);
        setSize(Math.max(min, Math.min(max, Math.round(startSize + delta))));
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [size, min, max, direction],
  );

  return { size, startDrag };
}

/** Thin vertical drag handle. Place *between* two sibling flex children. */
export function ResizeHandle({
  onMouseDown,
  side,
}: {
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  side: "left" | "right";
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      className={cn(
        "group h-full w-1 shrink-0 cursor-col-resize select-none",
        side === "left" ? "-mr-1 border-r border-border" : "-ml-1 border-l border-border",
        "hover:bg-primary/30 active:bg-primary/50",
      )}
    />
  );
}
