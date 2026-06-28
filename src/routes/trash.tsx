import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { getDb } from "@/db/schema";
import { ClientOnly } from "@/components/common/ClientOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { emptyTrash, purgeResources, restoreResources } from "@/services/fileOpsService";
import { toast } from "sonner";

function ago(ts: number | null | undefined): string {
  if (!ts) return "—";
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}


export const Route = createFileRoute("/trash")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <TrashPage />
    </ClientOnly>
  ),
});

function TrashPage() {
  const all = useLiveQuery(() => getDb().resources.toArray(), []) ?? [];
  const items = all.filter((r) => r.status === "trashed");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  async function handleEmpty() {
    if (confirmText !== "DELETE") return;
    const n = await emptyTrash();
    setConfirmOpen(false);
    setConfirmText("");
    toast.success(`Permanently deleted ${n} item${n === 1 ? "" : "s"}`);
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">Workspace</p>
          <h1 className="text-4xl font-black uppercase tracking-tight">Trash</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"} in trash · restore or permanently delete
          </p>
        </div>
        <Button variant="destructive" disabled={items.length === 0} onClick={() => setConfirmOpen(true)}>
          <Trash2 className="mr-1 size-4" /> Empty trash
        </Button>
      </header>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Trash is empty.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((r) => (
            <div key={r.id} className="flex items-center gap-3 border border-border bg-surface-1 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {r.type} · was in “{r.originalFolderPath || "Root"}” · {ago(r.trashedAt)}
                </p>

              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await restoreResources([r.id]);
                  toast.success("Restored");
                }}
              >
                <RotateCcw className="mr-1 size-3.5" /> Restore
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm(`Permanently delete "${r.name}"?`)) return;
                  await purgeResources([r.id]);
                  toast.success("Permanently deleted");
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" /> Empty trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all {items.length} item{items.length === 1 ? "" : "s"} and any progress
              tied to them. Type <span className="font-mono font-bold">DELETE</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="font-mono"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmText("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== "DELETE"}
              onClick={(e) => {
                e.preventDefault();
                void handleEmpty();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Empty trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
