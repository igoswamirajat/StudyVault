import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, FileText, Film, FileCode, Image as ImageIcon, File, Grid3x3, List, Download, CheckCircle2, FolderSearch, Flame, Play, Clock } from "lucide-react";
import { getDb, type Resource, type ResourceType, type RevisionFlag } from "@/db/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format-time";
import { ClientOnly } from "@/components/common/ClientOnly";
import { motion } from "framer-motion";
import { computeStreak } from "@/services/streakService";
import { RevisionFlagButton, flagMeta } from "@/components/library/RevisionFlagButton";
import { estimateResourceSeconds, formatEstimate, estimateTotalSeconds } from "@/lib/estimateTime";
import { setPlaylist } from "@/lib/playlist";
import { useAvailabilityFilter } from "@/hooks/useContentAvailability";
import { toast } from "sonner";
import { useFileSelection, makeSelectHandler } from "@/hooks/useFileSelection";
import { ResourceContextMenu } from "@/components/files/ResourceContextMenu";
import { MoveToFolderDialog } from "@/components/files/MoveToFolderDialog";
import { InlineRename } from "@/components/files/InlineRename";
import { trashResources, restoreResources, renameResource, moveResources } from "@/services/fileOpsService";


export const Route = createFileRoute("/library")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <LibraryPage />
    </ClientOnly>
  ),
});

type FilterKey = "all" | "video" | "pdf" | "markdown" | "in_progress" | "completed" | "downloaded" | "revision";

function LibraryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"day" | "name" | "recent">("day");

  const allResources = (useLiveQuery(() => getDb().resources.toArray(), []) ?? []);
  const resources = useMemo(() => allResources.filter((r) => (r.status ?? "active") === "active"), [allResources]);

  const progress = (useLiveQuery(() => getDb().progress.toArray(), []) ?? []);
  const progressMap = useMemo(() => new Map(progress.map((p) => [p.resourceId, p])), [progress]);
  const [streak, setStreak] = useState<{ current: number; longest: number; today: number }>({ current: 0, longest: 0, today: 0 });
  useEffect(() => {
    void computeStreak().then(setStreak);
  }, [progress.length]);

  const flaggedCount = useMemo(
    () => resources.filter((r) => r.revisionFlag && r.revisionFlag !== "done").length,
    [resources],
  );
  const totalEstSeconds = useMemo(() => estimateTotalSeconds(resources), [resources]);
  const completedEstSeconds = useMemo(
    () => estimateTotalSeconds(resources.filter((r) => progressMap.get(r.id)?.status === "completed")),
    [resources, progressMap],
  );
  const remainingEstSeconds = Math.max(0, totalEstSeconds - completedEstSeconds);

  const [availability] = useAvailabilityFilter();

  const filtered = useMemo(() => {
    let r = resources.slice();
    if (availability === "offline") r = r.filter((x) => x.isDownloaded);
    else if (availability === "online") r = r.filter((x) => !x.isDownloaded);
    if (filter === "video" || filter === "pdf" || filter === "markdown") r = r.filter((x) => x.type === filter);
    if (filter === "downloaded") r = r.filter((x) => x.isDownloaded);
    if (filter === "in_progress") r = r.filter((x) => progressMap.get(x.id)?.status === "in_progress");
    if (filter === "completed") r = r.filter((x) => progressMap.get(x.id)?.status === "completed");
    if (filter === "revision") r = r.filter((x) => x.revisionFlag && x.revisionFlag !== "done");
    if (query) r = r.filter((x) => x.name.toLowerCase().includes(query.toLowerCase()));
    r.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0);
      // by day then order
      const da = a.dayAssignment ?? 9999;
      const dbb = b.dayAssignment ?? 9999;
      if (da !== dbb) return da - dbb;
      return a.orderIndex - b.orderIndex;
    });
    return r;
  }, [resources, filter, query, sort, progressMap, availability]);

  function startRevisionPlaylist() {
    const ids = resources
      .filter((r) => r.revisionFlag && r.revisionFlag !== "done")
      .map((r) => r.id);
    if (ids.length === 0) {
      toast.error("No flagged resources yet — tap the flag on any card");
      return;
    }
    setPlaylist({ label: "Revision Mode", ids });
    navigate({ to: "/study/$resourceId", params: { resourceId: ids[0] } });
  }

  if (resources.length === 0) {
    return (
      <EmptyLibrary />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-10 px-4 py-8 sm:px-8 sm:py-10">
      {/* ── Heading ─────────────────────────────────────────────── */}
      <header className="flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
          Your Library
        </p>
        <h1 className="text-4xl font-black uppercase leading-none tracking-tight sm:text-5xl">
          Library
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          {resources.length} resources imported · {filtered.length} shown
        </p>
      </header>

      {/* ── Stats strip ────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <DashboardStat label="Resources" value={resources.length} sub="imported" />
        <DashboardStat label="Videos" value={resources.filter((r) => r.type === "video").length} sub="to watch" />
        <DashboardStat label="PDFs" value={resources.filter((r) => r.type === "pdf").length} sub="to read" />
        <DashboardStat label="Offline" value={resources.filter((r) => r.isDownloaded).length} sub="downloaded" />
        <div className="flex flex-col justify-between gap-1 border border-border bg-surface-1 p-5 transition-colors hover:bg-background">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            <Clock className="size-3.5" /> Time left
          </p>
          <p className="text-3xl font-black leading-none">{formatEstimate(remainingEstSeconds)}</p>
          <p className="text-xs text-muted-foreground">of {formatEstimate(totalEstSeconds)} total</p>
        </div>
        <div className="col-span-2 flex flex-col justify-between gap-1 border-2 border-foreground bg-primary p-5 shadow-[4px_4px_0_var(--foreground)] sm:col-span-4 lg:col-span-1">
          <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.28em]">
            <Flame className="size-3.5" /> Streak
          </p>
          <p className="text-5xl font-black leading-none">{streak.current}</p>
          <p className="text-xs opacity-80">
            {streak.today} min today · best {streak.longest}d
          </p>
        </div>
      </section>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 w-full pl-9"
              placeholder="Search resources…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="h-11 border border-input bg-background px-3 text-sm font-medium"
            >
              <option value="day">Sort: By Day</option>
              <option value="name">Sort: By Name</option>
              <option value="recent">Sort: Recently Opened</option>
            </select>
            <div className="flex h-11 border border-input">
              <button
                onClick={() => setView("grid")}
                className={cn("grid h-full w-11 place-items-center", view === "grid" && "bg-foreground text-background")}
                aria-label="Grid view"
              >
                <Grid3x3 className="size-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={cn("grid h-full w-11 place-items-center", view === "list" && "bg-foreground text-background")}
                aria-label="List view"
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["all", "All"],
              ["video", "Videos"],
              ["pdf", "PDFs"],
              ["markdown", "Notes"],
              ["in_progress", "In progress"],
              ["completed", "Completed"],
              ["downloaded", "Downloaded"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "border px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors",
                filter === key
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-surface-1 text-muted-foreground hover:bg-surface-2",
              )}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setFilter("revision")}
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
                  filter === "revision" ? "bg-background text-foreground" : "bg-primary text-primary-foreground",
                )}
              >
                {flaggedCount}
              </span>
            )}
          </button>
          <button
            onClick={startRevisionPlaylist}
            disabled={flaggedCount === 0}
            className="ml-auto inline-flex items-center gap-1.5 border-2 border-foreground bg-foreground px-3 py-2 font-mono text-xs uppercase tracking-wider text-background transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
          >
            <Play className="size-3.5" /> Revision mode
          </button>
        </div>
      </section>

      {/* ── Results ────────────────────────────────────────────── */}
      <section>
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">No resources match.</p>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((r, i) => (
              <LibraryItem
                key={r.id}
                resource={r}
                progress={progressMap.get(r.id)}
                view="grid"
                index={i}
                allIds={filtered.map((x) => x.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((r, i) => (
              <LibraryItem
                key={r.id}
                resource={r}
                progress={progressMap.get(r.id)}
                view="list"
                index={i}
                allIds={filtered.map((x) => x.id)}
              />
            ))}
          </div>
        )}

      </section>
    </div>
  );
}

function ResourceIcon({ type, className }: { type: ResourceType; className?: string }) {
  const Icon =
    type === "video" ? Film : type === "pdf" ? FileText : type === "markdown" ? FileCode : type === "image" ? ImageIcon : File;
  return <Icon className={className} />;
}

function LibraryItem({
  resource,
  progress,
  view,
  index,
  allIds,
}: {
  resource: Resource;
  progress?: { status: string; videoProgressSeconds?: number };
  view: "grid" | "list";
  index: number;
  allIds: string[];
}) {
  const navigate = useNavigate();
  const sel = useFileSelection();
  const [renaming, setRenaming] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const scope = "library";
  const onSel = makeSelectHandler(sel, resource.id, scope, allIds);

  function handleClick(e: React.MouseEvent) {
    if (renaming) return;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onSel(e);
      return;
    }
    navigate({ to: "/study/$resourceId", params: { resourceId: resource.id } });
  }

  async function handleTrash() {
    const target = sel.isSelected(resource.id) && sel.count > 1 ? Array.from(sel.selected) : [resource.id];
    await trashResources(target);
    sel.clear();
    toast(`Moved ${target.length} to trash`, {
      action: {
        label: "Undo",
        onClick: async () => {
          await restoreResources(target);
          toast.success("Restored");
        },
      },
      duration: 5000,
    });
  }

  const selected = sel.isSelected(resource.id);

  const inner = view === "grid" ? (
    <ResourceCard
      resource={resource}
      progress={progress}
      onClick={() => {}}
      index={index}
      selected={selected}
      renaming={renaming}
      onCommitRename={async (name) => {
        await renameResource(resource.id, name);
        setRenaming(false);
        toast.success("Renamed");
      }}
      onCancelRename={() => setRenaming(false)}
    />
  ) : (
    <ResourceRow
      resource={resource}
      progress={progress}
      onClick={() => {}}
      selected={selected}
      renaming={renaming}
      onCommitRename={async (name) => {
        await renameResource(resource.id, name);
        setRenaming(false);
        toast.success("Renamed");
      }}
      onCancelRename={() => setRenaming(false)}
    />
  );

  return (
    <>
      <ResourceContextMenu
        onOpen={() => navigate({ to: "/study/$resourceId", params: { resourceId: resource.id } })}
        onRename={() => setRenaming(true)}
        onMove={() => setMoveOpen(true)}
        onTrash={handleTrash}
        onContextOpen={() => {
          if (!sel.isSelected(resource.id)) sel.selectOnly(resource.id, scope, allIds);
        }}
      >
        <div onClick={handleClick}>{inner}</div>
      </ResourceContextMenu>
      <MoveToFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onConfirm={async (path) => {
          const target = sel.isSelected(resource.id) && sel.count > 1 ? Array.from(sel.selected) : [resource.id];
          await moveResources(target, path);
          toast.success(`Moved ${target.length} item${target.length > 1 ? "s" : ""}`);
          sel.clear();
        }}
      />
    </>
  );
}



function ResourceCard({
  resource,
  progress,
  onClick,
  index,
  selected = false,
  renaming = false,
  onCommitRename,
  onCancelRename,
}: {
  resource: Resource;
  progress?: { status: string; videoProgressSeconds?: number };
  onClick: () => void;
  index: number;
  selected?: boolean;
  renaming?: boolean;
  onCommitRename?: (name: string) => Promise<void> | void;
  onCancelRename?: () => void;
}) {
  const completed = progress?.status === "completed";
  const inProgress = progress?.status === "in_progress";
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = Boolean(resource.thumbnailUrl) && !thumbFailed;
  const meta = flagMeta(resource.revisionFlag);
  const est = estimateResourceSeconds(resource);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.015, 0.2) }}
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group flex cursor-pointer flex-col overflow-hidden border bg-surface-1 text-left transition-colors hover:bg-background hover:shadow-[6px_6px_0_var(--foreground)]",
        selected ? "border-[1.5px] border-primary bg-primary/[0.06]" : "border-border",
      )}
    >

      <div className="relative aspect-video bg-surface-2">
        {showThumb ? (
          <img
            src={resource.thumbnailUrl!}
            alt=""
            className="size-full object-cover opacity-80 group-hover:opacity-100"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ResourceIcon type={resource.type} className="size-10 text-muted-foreground" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex gap-1">
          <Badge variant="secondary" className="bg-foreground/80 text-background backdrop-blur">
            {resource.type}
          </Badge>
          {resource.dayAssignment != null && (
            <Badge className="bg-primary/80 text-primary-foreground">Day {resource.dayAssignment}</Badge>
          )}
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {completed && (
            <div className="bg-success/90 p-1">
              <CheckCircle2 className="size-3.5 text-background" />
            </div>
          )}
          <RevisionFlagButton resourceId={resource.id} flag={resource.revisionFlag} />
        </div>
        {resource.isDownloaded && (
          <div className="absolute right-2 bottom-2 bg-foreground/80 p-1 backdrop-blur" title="Available offline">
            <Download className="size-3 text-background" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        {renaming && onCommitRename && onCancelRename ? (
          <div onClick={(e) => e.stopPropagation()}>
            <InlineRename
              value={resource.name}
              editing
              onCommit={onCommitRename}
              onCancel={onCancelRename}
              inputClassName="w-full text-base font-black leading-snug"
            />
          </div>
        ) : (
          <p className="line-clamp-2 text-base font-black leading-snug tracking-tight">{resource.name}</p>
        )}
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">

          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {resource.durationSeconds
              ? formatDuration(resource.durationSeconds)
              : est > 0
                ? `~${formatEstimate(est)}`
                : "—"}
          </span>
          {meta ? (
            <span className={cn("font-bold", meta.tone)}>{meta.label}</span>
          ) : inProgress ? (
            <span className="text-warning">In progress</span>
          ) : null}
        </div>
        {completed && <ProgressBar value={100} className="h-1" />}
      </div>
    </motion.div>
  );
}

function ResourceRow({
  resource,
  progress,
  onClick,
  selected = false,
  renaming = false,
  onCommitRename,
  onCancelRename,
}: {
  resource: Resource;
  progress?: { status: string };
  onClick: () => void;
  selected?: boolean;
  renaming?: boolean;
  onCommitRename?: (name: string) => Promise<void> | void;
  onCancelRename?: () => void;
}) {
  const est = estimateResourceSeconds(resource);
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 border bg-surface-1 p-3 text-left transition-colors hover:bg-surface-2",
        selected ? "border-[1.5px] border-primary bg-primary/[0.06]" : "border-border",
      )}
    >
      <ResourceIcon type={resource.type} className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {renaming && onCommitRename && onCancelRename ? (
          <div onClick={(e) => e.stopPropagation()}>
            <InlineRename
              value={resource.name}
              editing
              onCommit={onCommitRename}
              onCancel={onCancelRename}
              inputClassName="w-full text-sm font-medium"
            />
          </div>
        ) : (
          <p className="truncate text-sm font-medium">{resource.name}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {resource.dayAssignment != null ? `Day ${resource.dayAssignment}` : "Unassigned"} · {resource.type}
          {est > 0 && <span> · ~{formatEstimate(est)}</span>}
        </p>
      </div>
      {progress?.status === "completed" && <CheckCircle2 className="size-4 text-success" />}
      {resource.isDownloaded && <Download className="size-4 text-muted-foreground" />}
      <RevisionFlagButton resourceId={resource.id} flag={resource.revisionFlag} size="xs" />
    </div>
  );
}


function EmptyLibrary() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 grid size-16 place-items-center border border-border bg-primary">
        <FolderSearch className="size-7" />
      </div>
      <h2 className="mb-2 text-2xl font-black uppercase tracking-tight">No resources yet</h2>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        Connect a public Google Drive folder to start building your study library.
      </p>
      <Button onClick={() => navigate({ to: "/onboarding" })}>Connect Drive folder</Button>
    </div>
  );
}

function DashboardStat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="flex flex-col justify-between gap-1 border border-border bg-surface-1 p-5 transition-colors hover:bg-background">
      <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
      <p className="text-5xl font-black leading-none">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
