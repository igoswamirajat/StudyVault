import { useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Tag, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { naturalCompare } from "@/lib/naturalSort";
import type { Resource, Progress } from "@/db/schema";

/* ------------------------------------------------------------------ */
/*  Sort / Filter types                                               */
/* ------------------------------------------------------------------ */

export type SortKey =
  "day" | "name" | "added" | "last_opened" | "type" | "status" | "size" | "duration";

export type SortDir = "asc" | "desc";

export type FilterKey =
  | "all"
  | "video"
  | "pdf"
  | "markdown"
  | "notebook"
  | "in_progress"
  | "completed"
  | "not_started"
  | "downloaded"
  | "drive"
  | "telegram"
  | "youtube"
  | "revision";

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "name", label: "Name" },
  { key: "added", label: "Date Added" },
  { key: "last_opened", label: "Last Opened" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "size", label: "Size" },
  { key: "duration", label: "Duration" },
];

export const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "video", label: "Videos" },
  { key: "pdf", label: "PDFs" },
  { key: "markdown", label: "Notes" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
  { key: "downloaded", label: "Offline" },
  { key: "drive", label: "Drive" },
  { key: "telegram", label: "Telegram" },
  { key: "youtube", label: "YouTube" },
];

export const MAX_VISIBLE_TAGS = 12;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export interface SortFilterBarProps {
  sort: SortKey;
  sortDir: SortDir;
  filter: FilterKey;
  /** Dynamic tags found across resources. */
  availableTags?: string[];
  /** Currently active tag filters. */
  selectedTags?: string[];
  /** Revision flagged count (shown as badge). */
  flaggedCount?: number;

  onSortChange: (sort: SortKey) => void;
  onSortDirChange: (dir: SortDir) => void;
  onFilterChange: (filter: FilterKey) => void;
  onTagsChange?: (tags: string[]) => void;
  onRevisionClick?: () => void;
}

export function SortFilterBar({
  sort,
  sortDir,
  filter,
  availableTags = [],
  selectedTags = [],
  flaggedCount = 0,
  onSortChange,
  onSortDirChange,
  onFilterChange,
  onTagsChange,
  onRevisionClick,
}: SortFilterBarProps) {
  return (
    <div className="space-y-2">
      {/* ── Sort row ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Sort
        </label>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="h-8 border border-input bg-background px-2 text-xs"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => onSortDirChange(sortDir === "asc" ? "desc" : "asc")}
          className="grid size-8 place-items-center border border-input text-muted-foreground transition-colors hover:bg-surface-2"
          title={sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {sortDir === "asc" ? (
            <ArrowDownAZ className="size-3.5" />
          ) : (
            <ArrowUpAZ className="size-3.5" />
          )}
        </button>
      </div>

      {/* ── Filter chips ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTER_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => onFilterChange(o.key)}
            className={cn(
              "border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
              filter === o.key
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2",
            )}
          >
            {o.label}
          </button>
        ))}

        {/* Revision chip with badge */}
        <button
          onClick={onRevisionClick}
          className={cn(
            "inline-flex items-center gap-1.5 border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
            filter === "revision"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2",
          )}
        >
          Revision
          {flaggedCount > 0 && (
            <span
              className={cn(
                "rounded-sm px-1 py-px text-[10px] font-bold",
                filter === "revision"
                  ? "bg-background text-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {flaggedCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Tag chips ─────────────────────────────────────────── */}
      {availableTags.length > 0 && onTagsChange && (
        <TagChips available={availableTags} selected={selectedTags} onChange={onTagsChange} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tag chips (dynamic, capped at MAX_VISIBLE_TAGS + "More…")        */
/* ------------------------------------------------------------------ */

function TagChips({
  available,
  selected,
  onChange,
}: {
  available: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? available : available.slice(0, MAX_VISIBLE_TAGS);
  const overflow = available.length - MAX_VISIBLE_TAGS;

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="size-3 text-muted-foreground" />
      {visible.map((tag) => (
        <button
          key={tag}
          onClick={() => toggle(tag)}
          className={cn(
            "inline-flex items-center gap-1 border px-2 py-1 text-[11px] transition-colors",
            selected.includes(tag)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2",
          )}
        >
          {tag}
          {selected.includes(tag) && <X className="size-2.5" />}
        </button>
      ))}
      {overflow > 0 && !showAll && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="border border-border bg-surface-1 px-2 py-1 text-[11px] text-muted-foreground hover:bg-surface-2">
              +{overflow} more…
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <div className="flex flex-wrap gap-1.5">
              {available.slice(MAX_VISIBLE_TAGS).map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    toggle(tag);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 border px-2 py-1 text-[11px] transition-colors",
                    selected.includes(tag)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  {tag}
                  {selected.includes(tag) && <X className="size-2.5" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {showAll && (
        <button
          onClick={() => setShowAll(false)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Show less
        </button>
      )}
      {overflow > 0 && !showAll && available.length <= MAX_VISIBLE_TAGS && (
        <button
          onClick={() => setShowAll(true)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Show all
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sort function — usable by both Library and Organizer              */
/* ------------------------------------------------------------------ */

/** Build a progress map from a flat progress array. */
export function buildProgressMap(progress: Progress[]): Map<string, Progress> {
  return new Map(progress.map((p) => [p.resourceId, p]));
}

/** Get the sort value for a given key, handling nulls. */
function getSortValue(
  r: Resource,
  key: SortKey,
  progressMap: Map<string, Progress>,
): {
  str: string;
  num: number;
} {
  switch (key) {
    case "name":
      return { str: r.name.toLowerCase(), num: 0 };
    case "added":
      return { str: "", num: r.addedAt };
    case "last_opened":
      return { str: "", num: r.lastOpenedAt ?? 0 };
    case "day":
      return { str: "", num: r.dayAssignment ?? 9999 };
    case "type":
      return { str: r.type, num: 0 };
    case "status": {
      const s = progressMap.get(r.id)?.status ?? "not_started";
      const order = { completed: 2, in_progress: 1, not_started: 0 };
      return { str: s, num: order[s] };
    }
    case "size":
      return { str: "", num: r.size ?? 0 };
    case "duration":
      return { str: "", num: r.durationSeconds ?? 0 };
    default:
      return { str: "", num: 0 };
  }
}

/** Sort resources by key + direction. */
export function sortResourcesByKey(
  items: Resource[],
  key: SortKey,
  dir: SortDir,
  progressMap: Map<string, Progress>,
): Resource[] {
  const arr = items.slice();
  arr.sort((a, b) => {
    const av = getSortValue(a, key, progressMap);
    const bv = getSortValue(b, key, progressMap);

    // String comparison for name/type/status, numeric for the rest
    let cmp = 0;
    if (key === "name" || key === "type" || key === "status") {
      cmp = naturalCompare(av.str, bv.str);
    } else {
      cmp = av.num - bv.num;
    }

    // For day: nulls last (9999 handles this)
    // For everything else: nulls sort naturally via 0
    return dir === "asc" ? cmp : -cmp;
  });
  return arr;
}
