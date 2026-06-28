import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Folder, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { listFoldersFlat } from "@/services/fileOpsService";
import { getDb, type FolderRow } from "@/db/schema";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (folderPath: string) => void;
  excludePaths?: string[]; // can't move folder into itself or descendants
  title?: string;
}

export function MoveToFolderDialog({ open, onOpenChange, onConfirm, excludePaths = [], title = "Move to folder" }: Props) {
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setQ("");
    setPicked("");
    void (async () => {
      const rows = await listFoldersFlat();
      const known = new Map(rows.map((r) => [r.path, r]));
      // Augment with folder paths inferred from resources so the dialog matches the tree.
      const resources = await getDb().resources.toArray();
      for (const r of resources) {
        if (!r.folderPath) continue;
        const segs = r.folderPath.split("/").filter(Boolean);
        for (let i = 0; i < segs.length; i++) {
          const path = segs.slice(0, i + 1).join("/");
          if (!known.has(path)) {
            known.set(path, {
              path,
              name: segs[i],
              parentPath: segs.slice(0, i).join("/"),
              createdAt: 0,
              source: "drive",
            });
          }
        }
      }
      setFolders(
        Array.from(known.values()).sort((a, b) => a.path.localeCompare(b.path)),
      );
    })();
  }, [open]);

  const list = useMemo(() => {
    const filtered = folders.filter((f) => {
      if (excludePaths.some((p) => f.path === p || f.path.startsWith(p + "/"))) return false;
      if (!q.trim()) return true;
      return f.path.toLowerCase().includes(q.toLowerCase());
    });
    return filtered;
  }, [folders, q, excludePaths]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-xs uppercase tracking-[0.18em]">{title}</DialogTitle>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search folders…" autoFocus />
        <div className="max-h-72 overflow-y-auto border border-border">
          <button
            type="button"
            onClick={() => setPicked("")}
            className={cn(
              "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm hover:bg-accent/60",
              picked === "" && "bg-accent",
            )}
          >
            <Home className="size-3.5" />
            <span>Root (Unassigned)</span>
          </button>
          {list.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => setPicked(f.path)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60",
                picked === f.path && "bg-accent",
              )}
              style={{ paddingLeft: 12 + (f.path.split("/").length - 1) * 14 }}
            >
              <Folder className="size-3.5 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{f.path}</span>
            </button>
          ))}
          {list.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No folders match.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onConfirm(picked); onOpenChange(false); }}>Move here</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
