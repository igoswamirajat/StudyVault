import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, FolderInput, X } from "lucide-react";
import { toast } from "sonner";
import { useFileSelection } from "@/hooks/useFileSelection";
import { trashResources, restoreResources, moveResources } from "@/services/fileOpsService";
import { MoveToFolderDialog } from "@/components/files/MoveToFolderDialog";

export function SelectionToolbar() {
  const sel = useFileSelection();
  const [moveOpen, setMoveOpen] = useState(false);

  async function handleDelete() {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;
    await trashResources(ids);
    const count = ids.length;
    sel.clear();
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
  }

  return (
    <>
      <AnimatePresence>
        {sel.count > 0 && (
          <motion.div
            key="selection-toolbar"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed left-1/2 top-[100px] z-50 -translate-x-1/2"
          >
            <div className="pointer-events-auto flex items-center gap-2 border-2 border-foreground bg-background px-3 py-2 shadow-[4px_4px_0_var(--foreground)]">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider">
                {sel.count} selected
              </span>
              <div className="mx-1 h-5 w-px bg-border" />
              <button
                onClick={() => setMoveOpen(true)}
                className="inline-flex items-center gap-1 border border-foreground/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider hover:bg-foreground hover:text-background"
              >
                <FolderInput className="size-3" /> Move
              </button>
              <button
                onClick={handleDelete}
                className="inline-flex items-center gap-1 border border-destructive/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="size-3" /> Delete
              </button>
              <button
                onClick={() => sel.clear()}
                className="ml-1 grid size-6 place-items-center text-muted-foreground hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MoveToFolderDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onConfirm={async (path) => {
          const ids = Array.from(sel.selected);
          await moveResources(ids, path);
          toast.success(`Moved ${ids.length} item${ids.length > 1 ? "s" : ""}`);
          sel.clear();
        }}
      />
    </>
  );
}
