import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Eye, FileCode2, Play, Pencil, Plus, Trash2, Notebook as NotebookIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/notes/MarkdownRenderer";
import { getDb, type Notebook, type NotebookCell, type NotebookKernel } from "@/db/schema";
import {
  addNotebookCell,
  createNotebook,
  deleteNotebookCell,
  runBrowserJavascript,
  updateNotebook,
  updateNotebookCell,
} from "@/services/notebookService";
import { runPyodideCell, kernelLabel, kernelStatus } from "@/services/kernelService";
import { toast } from "sonner";

/** Notebooks runnable inside the Study Room notes panel (linked to a resource). */
export function NotebookEmbed({
  resourceId,
  resourceName,
}: {
  resourceId: string;
  resourceName?: string;
}) {
  const notebooks =
    useLiveQuery(
      () => getDb().notebooks.where("resourceId").equals(resourceId).sortBy("updatedAt"),
      [resourceId],
    ) ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = notebooks.find((n) => n.id === selectedId) ?? notebooks[0];
  const cells =
    useLiveQuery(
      () =>
        selected
          ? getDb().notebook_cells.where("notebookId").equals(selected.id).sortBy("orderIndex")
          : Promise.resolve([] as NotebookCell[]),
      [selected?.id],
    ) ?? [];

  async function handleNew() {
    const nb = await createNotebook(`${resourceName ?? "Notes"} practice`, resourceId);
    setSelectedId(nb.id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Notebooks
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void handleNew()}
          aria-label="New notebook"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {notebooks.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {notebooks.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className={`mx-0.5 line-clamp-1 shrink-0 max-w-[160px] truncate rounded border px-2 py-0.5 text-[11px] ${
                selected?.id === n.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              <NotebookIcon className="mr-1 inline size-3" />
              {n.title}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!selected ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No notebooks here yet.{" "}
            <button className="underline" onClick={() => void handleNew()}>
              Create one
            </button>{" "}
            to run code while you study.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <input
                value={selected.title}
                onChange={(e) => void updateNotebook(selected.id, { title: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              />
              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                {kernelLabel(selected.kernel)}
              </span>
            </div>
            {cells.map((cell, i) => (
              <EmbeddedCell key={cell.id} cell={cell} index={i} kernel={selected.kernel} />
            ))}
            <div className="flex gap-2 border-t border-border pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void addNotebookCell(selected.id, "markdown")}
              >
                <FileCode2 className="mr-1 size-3" /> Markdown
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void addNotebookCell(selected.id, "code")}
              >
                <Plus className="mr-1 size-3" /> Code
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmbeddedCell({
  cell,
  index,
  kernel,
}: {
  cell: NotebookCell;
  index: number;
  kernel: NotebookKernel;
}) {
  const [source, setSource] = useState(cell.source);
  const [preview, setPreview] = useState(cell.type === "markdown");
  const [running, setRunning] = useState(false);

  useEffect(() => setSource(cell.source), [cell.source]);

  async function saveSource() {
    if (source !== cell.source) await updateNotebookCell(cell.id, { source });
  }

  async function run() {
    setRunning(true);
    await updateNotebookCell(cell.id, { status: "running", source });
    try {
      const output =
        kernel === "pyodide"
          ? await runPyodideCell({ ...cell, source })
          : await runBrowserJavascript({ ...cell, source });
      await updateNotebookCell(cell.id, {
        output,
        status: "success",
        executionCount: (cell.executionCount ?? 0) + 1,
      });
    } catch (error) {
      await updateNotebookCell(cell.id, {
        output: error instanceof Error ? error.message : String(error),
        status: "error",
      });
      toast.error(error instanceof Error ? error.message : "Cell failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="overflow-hidden border border-border bg-surface-1">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {index + 1} · {cell.type}
        </span>
        <div className="flex items-center gap-0.5">
          {cell.type === "markdown" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={() => setPreview((v) => !v)}
            >
              {preview ? <Pencil className="size-3" /> : <Eye className="size-3" />}
            </Button>
          )}
          {cell.type === "code" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={() => void run()}
              disabled={running}
            >
              <Play className="size-3" /> {running ? "…" : "Run"}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1"
            onClick={() => void deleteNotebookCell(cell.id)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>
      {preview && cell.type === "markdown" ? (
        <MarkdownRenderer markdown={source} className="min-h-16 px-2 py-1.5" />
      ) : (
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onBlur={() => void saveSource()}
          className={`min-h-20 w-full resize-y border-0 bg-background px-2 py-1.5 text-xs outline-none ${cell.type === "code" ? "font-mono" : ""}`}
          placeholder={cell.type === "code" ? "Write code…" : "Write Markdown…"}
        />
      )}
      {cell.type === "code" && cell.output && (
        <pre
          className={`border-t border-border whitespace-pre-wrap px-2 py-1.5 font-mono text-[10px] ${cell.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {cell.output}
        </pre>
      )}
    </section>
  );
}
