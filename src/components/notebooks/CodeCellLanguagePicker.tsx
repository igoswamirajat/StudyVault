import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LanguageSelectorGrid, type NotebookLanguage, LANGUAGE_LABELS } from "./LanguagePicker";
import { addNotebookCell } from "@/services/notebookService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  notebookId: string;
  /** Default language for the new cell — pass the notebook's current language. */
  defaultLang?: NotebookLanguage;
}

export function CodeCellLanguagePicker({ notebookId, defaultLang = "javascript" }: Props) {
  const [selectedLang, setSelectedLang] = useState<NotebookLanguage>(defaultLang);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    try {
      await addNotebookCell(notebookId, "code", "", selectedLang);
      toast.success(`${LANGUAGE_LABELS[selectedLang]} cell added`);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add cell");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Plus className="size-4" />
          <span>Code cell</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Add code cell</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Choose language for the new code cell</p>
            <LanguageSelectorGrid
              value={selectedLang}
              onChange={setSelectedLang}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!selectedLang}>
              Add {selectedLang ? LANGUAGE_LABELS[selectedLang] : "code"} cell
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}