import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderPlus,
  Play,
  Pencil,
  Trash2,
  Plus,
  MoreVertical,
  GripVertical,
  Film,
  FileText,
  FileCode,
  Image as ImageIcon,
  File as FileIcon,
  FolderInput,
  Copy as CopyIcon,
  Scissors,
  ClipboardPaste,
} from "lucide-react";
import { getDb, type Resource, type FolderRow, type ResourceType } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { ClientOnly } from "@/components/common/ClientOnly";
import { getSetting, setSetting } from "@/services/storageService";
import { setPlaylist } from "@/lib/playlist";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { estimateTotalSeconds, formatEstimate } from "@/lib/estimateTime";
import { RevisionFlagButton } from "@/components/library/RevisionFlagButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { InlineRename } from "@/components/files/InlineRename";
import { MoveToFolderDialog } from "@/components/files/MoveToFolderDialog";
import {
  trashResources,
  restoreResources,
  moveResources,
  renameResource,
  copyResources,
} from "@/services/fileOpsService";
import { useFileSelection, makeSelectHandler } from "@/hooks/useFileSelection";
import { useFileClipboard } from "@/hooks/useFileClipboard";

export const Route = createFileRoute("/organizer")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <Organizer />
    </ClientOnly>
  ),
});

type SortMode = "order" | "name" | "added";

interface FolderNode {
  path: string;
  name: string;
  children: FolderNode[];
  resources: Resource[];
  earliestAdded: number;
}

function buildFolderTree(folders: FolderRow[], resources: Resource[]): FolderNode[] {
  const allPaths = new Set<string>();
  for (const f of folders) allPaths.add(f.path);
  for (const r of resources) {
    if (r.folderPath) {
      const segs = r.folderPath.split("/").filter(Boolean);
      for (let i = 0; i < segs.length; i++) allPaths.add(segs.slice(0, i + 1).join("/"));
    }
  }
  const nodeMap = new Map<string, FolderNode>();
  for (const path of allPaths) {
    const segs = path.split("/");
    nodeMap.set(path, {
      path,
      name: segs[segs.length - 1],
      children: [],
      resources: [],
      earliestAdded: Number.POSITIVE_INFINITY,
    });
  }
  for (const r of resources) {
    const path = r.folderPath ?? "";
    if (!path) continue;
    const node = nodeMap.get(path);
    if (node) {
      node.resources.push(r);
      if (r.addedAt < node.earliestAdded) node.earliestAdded = r.addedAt;
    }
  }
  const roots: FolderNode[] = [];
  const sortedPaths = [...nodeMap.keys()].sort((a, b) => a.split("/").length - b.split("/").length);
  for (const path of sortedPaths) {
    const node = nodeMap.get(path)!;
    const segs = path.split("/");
    if (segs.length === 1) {
      roots.push(node);
    } else {
      const parentPath = segs.slice(0, -1).join("/");
      const parent = nodeMap.get(parentPath);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }
  function bubble(node: FolderNode): number {
    for (const c of node.children) {
      const childEarliest = bubble(c);
      if (childEarliest < node.earliestAdded) node.earliestAdded = childEarliest;
    }
    return node.earliestAdded;
  }
  for (const r of roots) bubble(r);
  function sortRec(nodes: FolderNode[]) {
    nodes.sort((a, b) => a.earliestAdded - b.earliestAdded);
    for (const n of nodes) sortRec(n.children);
  }
  sortRec(roots);
  return roots;
}

function unassignedResources(resources: Resource[]): Resource[] {
  return resources.filter((r) => !r.folderPath).sort((a, b) => a.orderIndex - b.orderIndex);
}

/** Move folder oldPath under newParentPath. Returns new path. */
async function moveFolder(oldPath: string, newParentPath: string): Promise<string | null> {
  if (oldPath === newParentPath) return null;
  if (newParentPath === oldPath || newParentPath.startsWith(oldPath + "/")) {
    toast.error("Can't move a folder into itself");
    return null;
  }
  const segs = oldPath.split("/");
  const name = segs[segs.length - 1];
  const newPath = newParentPath ? `${newParentPath}/${name}` : name;
  if (newPath === oldPath) return null;
  const db = getDb();
  const collision = await db.folders.get(newPath);
  if (collision) {
    toast.error("A folder with that name already exists at the destination");
    return null;
  }
  const allFolders = await db.folders.toArray();
  const allResources = await db.resources.toArray();
  await db.transaction("rw", db.folders, db.resources, async () => {
    for (const f of allFolders) {
      if (f.path === oldPath || f.path.startsWith(oldPath + "/")) {
        const remapped = newPath + f.path.slice(oldPath.length);
        const rSegs = remapped.split("/");
        await db.folders.delete(f.path);
        await db.folders.put({
          ...f,
          path: remapped,
          name: rSegs[rSegs.length - 1],
          parentPath: rSegs.slice(0, -1).join("/"),
        });
      }
    }
    for (const r of allResources) {
      if (r.folderPath === oldPath || (r.folderPath && r.folderPath.startsWith(oldPath + "/"))) {
        const remapped = newPath + r.folderPath!.slice(oldPath.length);
        await db.resources.update(r.id, { folderPath: remapped });
      }
    }
  });
  return newPath;
}

function Organizer() {
  const navigate = useNavigate();
  const allResources = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const resources = useMemo(
    () => allResources.filter((r) => (r.status ?? "active") === "active"),
    [allResources],
  );
  const folders = useLiveQuery(() => getDb().folders.toArray(), []) ?? [];

  const tree = useMemo(() => buildFolderTree(folders, resources), [folders, resources]);
  const orphans = useMemo(() => unassignedResources(resources), [resources]);

  const [selectedPath, setSelectedPath] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [movePickerIds, setMovePickerIds] = useState<string[] | null>(null);
  const [copyPickerIds, setCopyPickerIds] = useState<string[] | null>(null);
  const [moveFolderPath, setMoveFolderPath] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ kind: "resource" | "folder"; label: string } | null>(null);

  const sel = useFileSelection();
  const clip = useFileClipboard();

  const pasteInto = async (targetPath: string) => {
    const c = clip.clipboard;
    if (!c || c.ids.length === 0) {
      toast.error("Clipboard is empty");
      return;
    }
    const dest = targetPath === "__unassigned__" ? "" : targetPath;
    if (c.mode === "cut") {
      await moveResources(c.ids, dest);
      toast.success(`Moved ${c.ids.length} item${c.ids.length > 1 ? "s" : ""}`);
      clip.clear();
    } else {
      const newIds = await copyResources(c.ids, dest);
      toast.success(`Pasted ${newIds.length} copy${newIds.length > 1 ? "s" : ""}`);
    }
  };

  useEffect(() => {
    if (tree.length && expanded.size === 0) {
      setExpanded(new Set(tree.map((n) => n.path)));
    }
  }, [tree, expanded.size]);

  // Keyboard shortcuts: Ctrl/Cmd + C / X / V
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "c" && sel.count > 0) {
        e.preventDefault();
        clip.copy(Array.from(sel.selected));
        toast.success(`Copied ${sel.count} item${sel.count > 1 ? "s" : ""}`);
      } else if (k === "x" && sel.count > 0) {
        e.preventDefault();
        clip.cut(Array.from(sel.selected));
        toast.success(`Cut ${sel.count} item${sel.count > 1 ? "s" : ""}`);
      } else if (k === "v") {
        if (!clip.clipboard) return;
        e.preventDefault();
        const target = selectedPath === "__unassigned__" ? "__unassigned__" : selectedPath;
        void pasteInto(target);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.count, sel.selected, clip.clipboard, selectedPath]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("folder-drag:")) {
      const p = id.slice("folder-drag:".length);
      setActiveDrag({ kind: "folder", label: p.split("/").pop() ?? p });
    } else {
      const r = resources.find((x) => x.id === id);
      setActiveDrag({ kind: "resource", label: r?.name ?? "item" });
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const targetPath = overId.replace(/^folder:/, "");

    // Folder being dragged
    if (activeId.startsWith("folder-drag:")) {
      const sourcePath = activeId.slice("folder-drag:".length);
      const destParent = targetPath === "__unassigned__" ? "" : targetPath;
      const newPath = await moveFolder(sourcePath, destParent);
      if (newPath) toast.success(`Moved folder to ${destParent || "root"}`);
      return;
    }

    // Resource(s) drop
    const draggedIds = sel.selected.has(activeId) && sel.count > 1 ? Array.from(sel.selected) : [activeId];
    const dest = targetPath === "__unassigned__" ? "" : targetPath;
    await moveResources(draggedIds, dest);
    toast.success(`Moved ${draggedIds.length} item${draggedIds.length > 1 ? "s" : ""}`);
    if (draggedIds.length > 1) sel.clear();
  }

  async function createFolder(parentPath: string) {
    const name = window.prompt("Folder name");
    if (!name || !name.trim()) return;
    const path = parentPath ? `${parentPath}/${name.trim()}` : name.trim();
    const existing = await getDb().folders.get(path);
    if (existing) {
      toast.error("A folder with that name already exists here");
      return;
    }
    await getDb().folders.put({
      path,
      name: name.trim(),
      parentPath,
      createdAt: Date.now(),
      source: "user",
    });
    setExpanded((s) => new Set([...s, parentPath, path]));
    setSelectedPath(path);
  }

  async function commitFolderRename(node: FolderNode, nextName: string) {
    if (!nextName.trim() || nextName.trim() === node.name) {
      setRenamingFolder(null);
      return;
    }
    const parentSegs = node.path.split("/").slice(0, -1);
    const newPath = [...parentSegs, nextName.trim()].join("/");
    const collision = await getDb().folders.get(newPath);
    if (collision) {
      toast.error("Another folder already uses that name");
      throw new Error("dup");
    }
    const db = getDb();
    const oldPath = node.path;
    const allFolders = await db.folders.toArray();
    const allResourcesArr = await db.resources.toArray();
    await db.transaction("rw", db.folders, db.resources, async () => {
      for (const f of allFolders) {
        if (f.path === oldPath || f.path.startsWith(oldPath + "/")) {
          const remapped = newPath + f.path.slice(oldPath.length);
          const segs = remapped.split("/");
          await db.folders.delete(f.path);
          await db.folders.put({
            ...f,
            path: remapped,
            name: segs[segs.length - 1],
            parentPath: segs.slice(0, -1).join("/"),
          });
        }
      }
      for (const r of allResourcesArr) {
        if (r.folderPath === oldPath || (r.folderPath && r.folderPath.startsWith(oldPath + "/"))) {
          const remapped = newPath + r.folderPath!.slice(oldPath.length);
          await db.resources.update(r.id, { folderPath: remapped });
        }
      }
    });
    setRenamingFolder(null);
    if (selectedPath === oldPath) setSelectedPath(newPath);
    toast.success("Renamed");
  }

  async function deleteFolder(node: FolderNode) {
    if (node.resources.length > 0 || node.children.length > 0) {
      if (!window.confirm("Folder isn't empty. Move contents to Unassigned and delete?")) return;
      const db = getDb();
      await db.transaction("rw", db.folders, db.resources, async () => {
        const allResourcesArr = await db.resources.toArray();
        for (const r of allResourcesArr) {
          if (r.folderPath === node.path || (r.folderPath && r.folderPath.startsWith(node.path + "/"))) {
            await db.resources.update(r.id, { folderPath: "" });
          }
        }
        const allFolders = await db.folders.toArray();
        for (const f of allFolders) {
          if (f.path === node.path || f.path.startsWith(node.path + "/")) {
            await db.folders.delete(f.path);
          }
        }
      });
    } else {
      if (!window.confirm(`Delete folder "${node.name}"?`)) return;
      await getDb().folders.delete(node.path);
    }
    if (selectedPath === node.path) setSelectedPath("");
    toast.success("Folder deleted");
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-[340px_1fr]">
        <aside className="border-b border-border bg-surface-1/40 p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Drive Folders
            </h2>
            <Button size="sm" variant="ghost" onClick={() => createFolder("")} title="Add folder at root">
              <FolderPlus className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-0.5">
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                setExpanded={setExpanded}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                onAddSub={(p) => createFolder(p)}
                onRequestRename={(p) => setRenamingFolder(p)}
                renamingFolder={renamingFolder}
                onCommitRename={commitFolderRename}
                onCancelRename={() => setRenamingFolder(null)}
                onDelete={deleteFolder}
                onMove={(p) => setMoveFolderPath(p)}
                onPaste={(p) => pasteInto(p)}
                hasClipboard={!!clip.clipboard}
              />
            ))}
            {tree.length === 0 && (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                No folders yet. Connect a Drive folder or add one manually.
              </p>
            )}
            <UnassignedDrop
              count={orphans.length}
              active={selectedPath === "__unassigned__"}
              onSelect={() => setSelectedPath("__unassigned__")}
              onPaste={() => pasteInto("__unassigned__")}
              hasClipboard={!!clip.clipboard}
            />
          </div>
        </aside>

        <section className="overflow-y-auto p-4 sm:p-6">
          <FolderDetail
            path={selectedPath}
            tree={tree}
            orphans={orphans}
            renamingId={renamingId}
            onRequestRename={(id) => setRenamingId(id)}
            onCancelRename={() => setRenamingId(null)}
            onCommitRename={async (id, next) => {
              await renameResource(id, next);
              setRenamingId(null);
              toast.success("Renamed");
            }}
            onRequestMove={(ids) => setMovePickerIds(ids)}
            onRequestCopy={(ids) => setCopyPickerIds(ids)}
            onDuplicate={async (ids) => {
              const newIds = await copyResources(ids);
              toast.success(`Duplicated ${newIds.length} item${newIds.length > 1 ? "s" : ""}`);
            }}
            onCopyClip={(ids) => {
              clip.copy(ids);
              toast.success(`Copied ${ids.length} item${ids.length > 1 ? "s" : ""}`);
            }}
            onCutClip={(ids) => {
              clip.cut(ids);
              toast.success(`Cut ${ids.length} item${ids.length > 1 ? "s" : ""}`);
            }}
            onPasteHere={() => pasteInto(selectedPath || "")}
            clipboardCount={clip.clipboard?.ids.length ?? 0}
            onTrash={async (ids) => {
              await trashResources(ids);
              const count = ids.length;
              toast(`Moved ${count} item${count > 1 ? "s" : ""} to trash`, {
                action: {
                  label: "Undo",
                  onClick: async () => {
                    await restoreResources(ids);
                    toast.success("Restored");
                  },
                },
                duration: 5000,
              });
            }}
            onOpenPlaylist={(node) => {
              const ids = collectResourcesRecursive(node).map((r) => r.id);
              if (ids.length === 0) {
                toast.error("Folder has no resources to play");
                return;
              }
              setPlaylist({ label: node.path, ids });
              navigate({ to: "/study/$resourceId", params: { resourceId: ids[0] } });
            }}
            navigate={navigate}
            onAddSub={(p) => createFolder(p)}
          />
        </section>
      </div>

      <DragOverlay>
        {activeDrag && (
          <div className="pointer-events-none border-2 border-foreground bg-background px-2 py-1 text-xs font-bold shadow-[3px_3px_0_var(--foreground)]">
            {activeDrag.kind === "folder" ? "📁 " : "📄 "}
            {activeDrag.label}
            {sel.count > 1 && activeDrag.kind === "resource" && sel.selected.has(activeDrag.label) && (
              <span className="ml-1 bg-foreground px-1 text-background">{sel.count}</span>
            )}
          </div>
        )}
      </DragOverlay>

      <MoveToFolderDialog
        open={movePickerIds !== null}
        onOpenChange={(v) => !v && setMovePickerIds(null)}
        onConfirm={async (path) => {
          if (!movePickerIds) return;
          await moveResources(movePickerIds, path);
          toast.success(`Moved ${movePickerIds.length} item${movePickerIds.length > 1 ? "s" : ""}`);
          setMovePickerIds(null);
        }}
      />

      <MoveToFolderDialog
        title="Copy to folder…"
        open={copyPickerIds !== null}
        onOpenChange={(v) => !v && setCopyPickerIds(null)}
        onConfirm={async (path) => {
          if (!copyPickerIds) return;
          const newIds = await copyResources(copyPickerIds, path);
          toast.success(`Copied ${newIds.length} item${newIds.length > 1 ? "s" : ""} to ${path || "root"}`);
          setCopyPickerIds(null);
        }}
      />

      <MoveToFolderDialog
        title="Move folder into…"
        open={moveFolderPath !== null}
        onOpenChange={(v) => !v && setMoveFolderPath(null)}
        excludePaths={moveFolderPath ? [moveFolderPath] : []}
        onConfirm={async (parent) => {
          if (!moveFolderPath) return;
          const np = await moveFolder(moveFolderPath, parent);
          if (np) toast.success(`Moved to ${parent || "root"}`);
          setMoveFolderPath(null);
        }}
      />
    </DndContext>
  );
}

function collectResourcesRecursive(node: FolderNode): Resource[] {
  const out: Resource[] = [...node.resources];
  for (const c of node.children) out.push(...collectResourcesRecursive(c));
  return out;
}

function TreeNode({
  node,
  depth,
  expanded,
  setExpanded,
  selectedPath,
  onSelect,
  onAddSub,
  onRequestRename,
  renamingFolder,
  onCommitRename,
  onCancelRename,
  onDelete,
  onMove,
  onPaste,
  hasClipboard,
}: {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  selectedPath: string;
  onSelect: (p: string) => void;
  onAddSub: (parentPath: string) => void;
  onRequestRename: (path: string) => void;
  renamingFolder: string | null;
  onCommitRename: (n: FolderNode, name: string) => Promise<void>;
  onCancelRename: () => void;
  onDelete: (n: FolderNode) => void;
  onMove: (path: string) => void;
  onPaste: (path: string) => void;
  hasClipboard: boolean;
}) {
  const isOpen = expanded.has(node.path);
  const navigate = useNavigate();
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `folder:${node.path}` });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-drag:${node.path}`,
  });
  const count = collectResourcesRecursive(node).length;
  const isRenaming = renamingFolder === node.path;

  function toggle() {
    const next = new Set(expanded);
    if (isOpen) next.delete(node.path);
    else next.add(node.path);
    setExpanded(next);
  }

  function setBothRefs(el: HTMLDivElement | null) {
    setDropRef(el);
    setDragRef(el);
  }

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setBothRefs}
            title={node.path}
            style={{ paddingLeft: 6 + depth * 14, opacity: isDragging ? 0.4 : 1 }}
            className={cn(
              "group flex items-center gap-1 rounded px-1 py-1 text-sm transition-colors",
              selectedPath === node.path ? "bg-accent" : "hover:bg-accent/60",
              isOver && "ring-2 ring-foreground",
            )}
            onDoubleClick={() => onRequestRename(node.path)}
          >
            <button onClick={toggle} className="grid size-5 place-items-center text-muted-foreground">
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
            <span
              {...attributes}
              {...listeners}
              className="grid size-4 cursor-grab place-items-center text-muted-foreground/60"
              aria-label="Drag folder"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="size-3" />
            </span>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(node.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(node.path);
                }
              }}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
            >
              <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              {isRenaming ? (
                <InlineRename
                  value={node.name}
                  editing
                  onCommit={async (next) => {
                    await onCommitRename(node, next);
                  }}
                  onCancel={onCancelRename}
                  inputClassName="text-sm"
                />
              ) : (
                <span className="truncate">{node.name}</span>
              )}
            </div>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{count}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="grid size-6 place-items-center text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 group-hover:opacity-100"
                  aria-label="Folder menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onSelect={() => {
                    const ids = collectResourcesRecursive(node).map((r) => r.id);
                    if (ids.length === 0) {
                      toast.error("Folder has no resources");
                      return;
                    }
                    setPlaylist({ label: node.path, ids });
                    navigate({ to: "/study/$resourceId", params: { resourceId: ids[0] } });
                  }}
                >
                  <Play className="mr-2 size-3.5" /> Open as Playlist
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onRequestRename(node.path)}>
                  <Pencil className="mr-2 size-3.5" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onMove(node.path)}>
                  <FolderInput className="mr-2 size-3.5" /> Move folder…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddSub(node.path)}>
                  <Plus className="mr-2 size-3.5" /> Add Sub-folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onSelect={() => onDelete(node)}>
                  <Trash2 className="mr-2 size-3.5" /> Delete folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem
            onSelect={() => {
              const ids = collectResourcesRecursive(node).map((r) => r.id);
              if (ids.length === 0) return;
              setPlaylist({ label: node.path, ids });
              navigate({ to: "/study/$resourceId", params: { resourceId: ids[0] } });
            }}
          >
            <Play className="mr-2 size-3.5" /> Open as Playlist
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onRequestRename(node.path)}>
            <Pencil className="mr-2 size-3.5" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onMove(node.path)}>
            <FolderInput className="mr-2 size-3.5" /> Move folder…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onAddSub(node.path)}>
            <Plus className="mr-2 size-3.5" /> Add Sub-folder
          </ContextMenuItem>
          <ContextMenuItem disabled={!hasClipboard} onSelect={() => onPaste(node.path)}>
            <ClipboardPaste className="mr-2 size-3.5" /> Paste here
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(node)}>
            <Trash2 className="mr-2 size-3.5" /> Delete folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isOpen &&
        node.children.map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            expanded={expanded}
            setExpanded={setExpanded}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onAddSub={onAddSub}
            onRequestRename={onRequestRename}
            renamingFolder={renamingFolder}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onDelete={onDelete}
            onMove={onMove}
            onPaste={onPaste}
            hasClipboard={hasClipboard}
          />
        ))}
    </div>
  );
}

function UnassignedDrop({
  count,
  active,
  onSelect,
  onPaste,
  hasClipboard,
}: {
  count: number;
  active: boolean;
  onSelect: () => void;
  onPaste: () => void;
  hasClipboard: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "folder:__unassigned__" });
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          className={cn(
            "mt-4 flex items-center justify-between rounded border border-dashed border-border px-2 py-2 text-sm",
            active ? "bg-accent" : "text-muted-foreground hover:bg-accent/60",
            isOver && "ring-2 ring-foreground",
          )}
        >
          <button onClick={onSelect} className="flex-1 text-left">Unassigned</button>
          <span className="font-mono text-[10px] tabular-nums">{count}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem disabled={!hasClipboard} onSelect={onPaste}>
          <ClipboardPaste className="mr-2 size-3.5" /> Paste here
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

interface FolderDetailProps {
  path: string;
  tree: FolderNode[];
  orphans: Resource[];
  renamingId: string | null;
  onRequestRename: (id: string) => void;
  onCancelRename: () => void;
  onCommitRename: (id: string, next: string) => Promise<void>;
  onRequestMove: (ids: string[]) => void;
  onRequestCopy: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => Promise<void> | void;
  onCopyClip: (ids: string[]) => void;
  onCutClip: (ids: string[]) => void;
  onPasteHere: () => void | Promise<void>;
  clipboardCount: number;
  onTrash: (ids: string[]) => Promise<void>;
  onOpenPlaylist: (node: FolderNode) => void;
  navigate: ReturnType<typeof useNavigate>;
  onAddSub: (parentPath: string) => void;
}

function FolderDetail(props: FolderDetailProps) {
  const { path, tree, orphans, onOpenPlaylist, navigate, onAddSub } = props;
  const node = useMemo(() => {
    if (!path || path === "__unassigned__") return null;
    function find(nodes: FolderNode[]): FolderNode | null {
      for (const n of nodes) {
        if (n.path === path) return n;
        const c = find(n.children);
        if (c) return c;
      }
      return null;
    }
    return find(tree);
  }, [path, tree]);

  const [sortMode, setSortMode] = useState<SortMode>("order");
  const sortKey = path ? `folderSort_${path}` : `folderSort___unassigned__`;

  useEffect(() => {
    void getSetting<SortMode>(sortKey, "order").then((v) => setSortMode(v ?? "order"));
  }, [sortKey]);

  async function updateSort(v: SortMode) {
    setSortMode(v);
    await setSetting(sortKey, v);
  }

  const allDescendants = useMemo(() => (node ? collectResourcesRecursive(node) : []), [node]);
  const totalSec = useMemo(() => estimateTotalSeconds(allDescendants), [allDescendants]);
  const doneSec = useMemo(
    () => estimateTotalSeconds(allDescendants.filter((r) => r.revisionFlag === "done")),
    [allDescendants],
  );
  const remainingSec = Math.max(0, totalSec - doneSec);

  if (path === "__unassigned__") {
    return (
      <div>
        <Header title="Unassigned" subtitle="Drag any item onto a folder on the left." />
        <SortBar sortMode={sortMode} onChange={updateSort} />
        <ResourceList resources={sortResources(orphans, sortMode)} scope="organizer:__unassigned__" {...props} />
      </div>
    );
  }

  if (!node) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <div className="max-w-sm text-center">
          <p className="mb-3">Select a folder from the tree to view its resources.</p>
          <Button variant="outline" size="sm" onClick={() => onAddSub("")}>
            <FolderPlus className="mr-1 size-3.5" /> Add Folder
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title={node.name}
        subtitle={node.path}
        meta={`~${formatEstimate(totalSec)} total · ${formatEstimate(remainingSec)} left · ${allDescendants.length} items`}
        actions={
          <>
            <Button size="sm" onClick={() => onOpenPlaylist(node)}>
              <Play className="mr-1 size-3.5" /> Open as Playlist
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAddSub(node.path)}>
              <FolderPlus className="mr-1 size-3.5" /> Add Sub-folder
            </Button>
          </>
        }
      />
      <SortBar sortMode={sortMode} onChange={updateSort} />
      <ResourceList
        resources={sortResources(node.resources, sortMode)}
        scope={`organizer:${node.path}`}
        {...props}
      />
      {node.children.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Sub-folders
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {node.children.map((c) => {
              const childItems = collectResourcesRecursive(c);
              const childSec = estimateTotalSeconds(childItems);
              return (
                <button
                  key={c.path}
                  className="flex items-center justify-between gap-3 border border-border bg-surface-1 px-3 py-3 text-left text-sm hover:bg-surface-2"
                  onClick={() => onOpenPlaylist(c)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {childItems.length} · ~{formatEstimate(childSec)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ title, subtitle, meta, actions }: { title: string; subtitle?: string; meta?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">Folder</p>
        <h1 className="truncate text-2xl font-black uppercase tracking-tight">{title}</h1>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        {meta && <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{meta}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

function SortBar({ sortMode, onChange }: { sortMode: SortMode; onChange: (v: SortMode) => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <label className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Sort</label>
      <select
        value={sortMode}
        onChange={(e) => onChange(e.target.value as SortMode)}
        className="h-8 border border-input bg-background px-2 text-xs"
      >
        <option value="order">Order</option>
        <option value="name">Name</option>
        <option value="added">Added Time</option>
      </select>
    </div>
  );
}

function sortResources(items: Resource[], mode: SortMode): Resource[] {
  const arr = items.slice();
  if (mode === "name") arr.sort((a, b) => a.name.localeCompare(b.name));
  else if (mode === "added") arr.sort((a, b) => a.addedAt - b.addedAt);
  else arr.sort((a, b) => a.orderIndex - b.orderIndex);
  return arr;
}

interface ResourceListProps extends FolderDetailProps {
  resources: Resource[];
  scope: string;
}

function ResourceList({
  resources,
  scope,
  renamingId,
  onRequestRename,
  onCancelRename,
  onCommitRename,
  onRequestMove,
  onRequestCopy,
  onDuplicate,
  onCopyClip,
  onCutClip,
  onPasteHere,
  clipboardCount,
  onTrash,
  navigate,
}: ResourceListProps) {
  const orderedIds = resources.map((r) => r.id);
  if (resources.length === 0) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <p className="rounded border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No resources here. Drag items from other folders onto this one, or right-click to paste.
          </p>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem disabled={clipboardCount === 0} onSelect={() => onPasteHere()}>
            <ClipboardPaste className="mr-2 size-3.5" /> Paste {clipboardCount > 0 ? `(${clipboardCount})` : ""}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }
  return (
    <div className="space-y-1.5">
      {resources.map((r) => (
        <DraggableResource
          key={r.id}
          resource={r}
          scope={scope}
          orderedIds={orderedIds}
          renaming={renamingId === r.id}
          onRequestRename={() => onRequestRename(r.id)}
          onCancelRename={onCancelRename}
          onCommitRename={(next) => onCommitRename(r.id, next)}
          onMove={(ids) => onRequestMove(ids)}
          onCopy={(ids) => onRequestCopy(ids)}
          onDuplicate={(ids) => void onDuplicate(ids)}
          onCopyClip={(ids) => onCopyClip(ids)}
          onCutClip={(ids) => onCutClip(ids)}
          onPasteHere={() => onPasteHere()}
          clipboardCount={clipboardCount}
          onTrash={(ids) => void onTrash(ids)}
          onOpen={() => navigate({ to: "/study/$resourceId", params: { resourceId: r.id } })}
        />
      ))}
    </div>
  );
}

function DraggableResource({
  resource,
  scope,
  orderedIds,
  renaming,
  onRequestRename,
  onCancelRename,
  onCommitRename,
  onMove,
  onCopy,
  onDuplicate,
  onCopyClip,
  onCutClip,
  onPasteHere,
  clipboardCount,
  onTrash,
  onOpen,
}: {
  resource: Resource;
  scope: string;
  orderedIds: string[];
  renaming: boolean;
  onRequestRename: () => void;
  onCancelRename: () => void;
  onCommitRename: (next: string) => Promise<void>;
  onMove: (ids: string[]) => void;
  onCopy: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onCopyClip: (ids: string[]) => void;
  onCutClip: (ids: string[]) => void;
  onPasteHere: () => void;
  clipboardCount: number;
  onTrash: (ids: string[]) => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: resource.id });
  const sel = useFileSelection();
  const selected = sel.isSelected(resource.id) && sel.scope === scope;
  const onClick = makeSelectHandler(sel, resource.id, scope, orderedIds);

  const idsForOp = () => (selected && sel.count > 1 ? Array.from(sel.selected) : [resource.id]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={{ opacity: isDragging ? 0.4 : 1 }}
          className={cn(
            "flex items-center gap-2 border bg-surface-1 p-2.5",
            selected ? "border-foreground ring-1 ring-foreground" : "border-border",
          )}
          onClick={onClick}
          onContextMenu={() => {
            if (!selected) sel.selectOnly(resource.id, scope, orderedIds);
          }}
        >
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground"
            aria-label="Drag"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="size-4" />
          </button>
          <TypeIcon type={resource.type} />
          <div
            className="min-w-0 flex-1 text-left"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (renaming) return;
              onRequestRename();
            }}
          >
            {renaming ? (
              <InlineRename
                value={resource.name}
                editing
                onCommit={onCommitRename}
                onCancel={onCancelRename}
                className="block truncate text-sm font-medium"
                inputClassName="w-full text-sm font-medium"
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                onDoubleClick={(e) => {
                  // double-click on title triggers rename; single button click opens.
                  e.preventDefault();
                }}
                className="block w-full truncate text-left text-sm font-medium"
              >
                {resource.name}
              </button>
            )}
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {resource.type}
              {resource.dayAssignment != null && (
                <span className="ml-2 inline-block bg-primary/20 px-1.5 py-0.5 text-primary-foreground/80">
                  Day {resource.dayAssignment}
                </span>
              )}
            </p>
          </div>
          <RevisionFlagButton resourceId={resource.id} flag={resource.revisionFlag} size="xs" />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onOpen}>
          <Play className="mr-2 size-3.5" /> Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={onRequestRename}>
          <Pencil className="mr-2 size-3.5" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onMove(idsForOp())}>
          <FolderInput className="mr-2 size-3.5" /> Move to folder…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onCopyClip(idsForOp())}>
          <CopyIcon className="mr-2 size-3.5" /> Copy <span className="ml-auto text-[10px] text-muted-foreground">⌘C</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCutClip(idsForOp())}>
          <Scissors className="mr-2 size-3.5" /> Cut <span className="ml-auto text-[10px] text-muted-foreground">⌘X</span>
        </ContextMenuItem>
        <ContextMenuItem disabled={clipboardCount === 0} onSelect={() => onPasteHere()}>
          <ClipboardPaste className="mr-2 size-3.5" /> Paste {clipboardCount > 0 ? `(${clipboardCount})` : ""} <span className="ml-auto text-[10px] text-muted-foreground">⌘V</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onDuplicate(idsForOp())}>
          <CopyIcon className="mr-2 size-3.5" /> Duplicate here
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopy(idsForOp())}>
          <CopyIcon className="mr-2 size-3.5" /> Copy to folder…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={() => onTrash(idsForOp())}>
          <Trash2 className="mr-2 size-3.5" /> Move to trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TypeIcon({ type }: { type: ResourceType }) {
  const Icon =
    type === "video" ? Film : type === "pdf" ? FileText : type === "markdown" ? FileCode : type === "image" ? ImageIcon : FileIcon;
  return <Icon className="size-4 shrink-0 text-muted-foreground" />;
}
