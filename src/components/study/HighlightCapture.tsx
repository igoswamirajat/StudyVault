import { useEffect, useRef, useState } from "react";
import { Highlighter } from "lucide-react";
import { emitHighlight } from "@/lib/viewer-bus";
import { toast } from "sonner";

interface Props {
  resourceId: string;
  children: React.ReactNode;
  /** Page number to attach (PDF only). */
  getPage?: () => number | undefined;
  /** Timestamp seconds to attach (video only). */
  getTime?: () => number | null | undefined;
  className?: string;
}

/**
 * Wraps a viewer so that any text selection inside it surfaces a floating
 * "Save to Summary" button. Selection is captured on mouseup/keyup.
 */
export function HighlightCapture({ resourceId, children, getPage, getTime, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setPopup(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3) {
        setPopup(null);
        return;
      }
      // Ensure the selection is inside this viewer
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) {
        setPopup(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      setPopup({
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
        text,
      });
    };
    el.addEventListener("mouseup", handler);
    el.addEventListener("keyup", handler);
    const close = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) setPopup(null);
    };
    document.addEventListener("mousedown", close);
    return () => {
      el.removeEventListener("mouseup", handler);
      el.removeEventListener("keyup", handler);
      document.removeEventListener("mousedown", close);
    };
  }, []);

  function save() {
    if (!popup) return;
    emitHighlight({
      resourceId,
      text: popup.text,
      page: getPage?.(),
      time: getTime?.() ?? undefined,
    });
    toast.success("Saved to Summary");
    window.getSelection()?.removeAllRanges();
    setPopup(null);
  }

  return (
    <div ref={ref} className={className} style={{ position: "relative", height: "100%" }}>
      {children}
      {popup && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            save();
          }}
          className="absolute z-50 inline-flex -translate-x-1/2 -translate-y-full items-center gap-1.5 border border-foreground bg-background px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground shadow-[4px_4px_0_var(--foreground)] hover:bg-primary hover:text-primary-foreground"
          style={{ left: popup.x, top: popup.y }}
        >
          <Highlighter className="size-3.5" /> Save to Summary
        </button>
      )}
    </div>
  );
}
