import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  editing: boolean;
  onCommit: (next: string) => Promise<void> | void;
  onCancel: () => void;
  className?: string;
  inputClassName?: string;
}

export function InlineRename({ value, editing, onCommit, onCancel, className, inputClassName }: Props) {
  const [draft, setDraft] = useState(value);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  function fail() {
    setShake(true);
    setTimeout(() => setShake(false), 320);
  }

  async function commit() {
    const next = draft.trim();
    if (!next) {
      fail();
      return;
    }
    if (next === value) {
      onCancel();
      return;
    }
    try {
      await onCommit(next);
    } catch (err) {
      fail();
      // bubble nothing — caller toasts.
      console.warn("rename failed:", err);
    }
  }

  if (!editing) {
    return <span className={className}>{value}</span>;
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className={cn(
        "min-w-0 border border-foreground/40 bg-background px-1 text-inherit outline-none focus:border-foreground",
        shake && "animate-[shake_0.32s_ease-in-out]",
        inputClassName,
      )}
    />
  );
}
