import { type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Play, Pencil, Trash2, FolderInput, Flag } from "lucide-react";

interface Props {
  children: ReactNode;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onTrash: () => void;
  onMarkRevision?: () => void;
  /** Called when right-click happens — gives caller a chance to update selection. */
  onContextOpen?: () => void;
}

export function ResourceContextMenu({
  children,
  onOpen,
  onRename,
  onMove,
  onTrash,
  onMarkRevision,
  onContextOpen,
}: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={onContextOpen}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onOpen}>
          <Play className="mr-2 size-3.5" /> Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={onRename}>
          <Pencil className="mr-2 size-3.5" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={onMove}>
          <FolderInput className="mr-2 size-3.5" /> Move to folder…
        </ContextMenuItem>
        {onMarkRevision && (
          <ContextMenuItem onSelect={onMarkRevision}>
            <Flag className="mr-2 size-3.5" /> Mark for revision
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={onTrash}>
          <Trash2 className="mr-2 size-3.5" /> Move to trash
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
