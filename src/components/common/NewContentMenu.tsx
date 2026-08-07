import { useNavigate } from "@tanstack/react-router";
import {
  Code2,
  FileCode2,
  FileText,
  Notebook as NotebookIcon,
  StickyNote,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  createContent,
  type CreatedContent,
  type NewContentKind,
} from "@/services/contentCreationService";

interface Props {
  /** Default folder path for new file resources. */
  defaultFolderPath?: string;
  size?: "sm" | "default" | "icon";
  variant?: "default" | "outline" | "ghost";
  label?: string;
  onCreated?: (result: CreatedContent) => void;
}

export function NewContentMenu({
  defaultFolderPath = "",
  size = "sm",
  variant = "outline",
  label = "New",
  onCreated,
}: Props) {
  const navigate = useNavigate();

  const handle = async (kind: NewContentKind["kind"]) => {
    try {
      const typed: NewContentKind =
        kind === "note"
          ? { kind: "note" }
          : kind === "markdown"
            ? { kind: "markdown", folderPath: defaultFolderPath }
            : kind === "code"
              ? { kind: "code", folderPath: defaultFolderPath, language: "javascript" }
              : kind === "html"
                ? { kind: "html", folderPath: defaultFolderPath }
                : ({ kind: "notebook" } as NewContentKind);

      const result = await createContent(typed, defaultFolderPath);
      onCreated?.(result);

      if (result.noteId && !result.resourceId) {
        navigate({ to: "/notes" });
      } else if (result.resourceId) {
        // Markdown/HTML resources open in Study Room; code files stay in Organizer for now.
        navigate({ to: "/study/$resourceId", params: { resourceId: result.resourceId } });
      } else if (result.notebookId) {
        navigate({ to: "/notebooks" });
      }
      toast.success(`${label} created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create item");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} aria-label={`Create ${label || "content"}`}>
          <Plus className="size-4" />
          {label && size !== "icon" && <span className="ml-1 hidden sm:inline">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handle("note")}>
          <StickyNote className="mr-2 size-3.5" /> Note
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handle("markdown")}>
          <FileText className="mr-2 size-3.5" /> Markdown file
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handle("code")}>
          <Code2 className="mr-2 size-3.5" /> Code file
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handle("html")}>
          <FileCode2 className="mr-2 size-3.5" /> HTML file
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handle("notebook")}>
          <NotebookIcon className="mr-2 size-3.5" /> Notebook
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}