import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Clock,
  Eye,
  FileCode2,
  Play,
  Pencil,
  Plus,
  Trash2,
  Notebook as NotebookIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/notes/MarkdownRenderer";
import { getDb, type Notebook, type NotebookCell, type NotebookKernel } from "@/db/schema";
import {
  addNotebookCell,
  createNotebook,
  deleteNotebookCell,
  runCell,
  updateNotebook,
  updateNotebookCell,
} from "@/services/notebookService";
import { kernelLabel } from "@/services/kernelService";
import { LanguagePicker, type NotebookLanguage } from "@/components/notebooks/LanguagePicker";
import { NotebookCellOutput } from "@/components/notebooks/NotebookCellOutput";
import { toast } from "sonner";

/** Format seconds → "M:SS". */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/** Notebooks runnable inside the Study Room notes panel (linked to a resource). */
export function NotebookEmbed({
  resourceId,
  resourceName,
  getVideoTime,
  onSeekVideo,
}: {
  resourceId: string;
  resourceName?: string;
  getVideoTime?: () => number | null;
  onSeekVideo?: (sec: number) => void;
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
    const ts = getVideoTime?.() ?? null;
    const nb = await createNotebook(
      ts != null ? `${fmtTime(ts)} practice` : `${resourceName ?? "Notes"} practice`,
      resourceId,
      undefined,
      undefined,
      ts,
    );
    setSelectedId(nb.id);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
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

      {/* Notebook list — vertical, like notes */}
      <div className="max-h-32 shrink-0 overflow-y-auto border-b border-border">
        {notebooks.length === 0 ? (
          <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
            No notebooks yet.{" "}
            <button className="underline" onClick={() => void handleNew()}>
              Create one
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {notebooks.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                  selected?.id === n.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <NotebookIcon className="size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                {n.linkedTimestamp != null && onSeekVideo && (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeekVideo(n.linkedTimestamp ?? 0);
                    }}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/20 px-1 py-0.5 text-[9px] text-primary"
                    title="Seek video"
                  >
                    <Clock className="size-2" />
                    {fmtTime(n.linkedTimestamp)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected notebook content — isolated scroll */}
      {!selected ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
          Select a notebook above to start coding.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Title bar */}
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <input
              value={selected.title}
              onChange={(e) => void updateNotebook(selected.id, { title: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none"
            />
            <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
              {kernelLabel(selected.kernel)}
            </span>
          </div>

          {/* Cells — isolated scroll */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            {cells.map((cell, i) => (
              <EmbeddedCell
                key={cell.id}
                cell={cell}
                index={i}
                kernel={selected.kernel}
                getVideoTime={getVideoTime}
                onSeekVideo={onSeekVideo}
              />
            ))}
          </div>

          {/* Add cell buttons — pinned to bottom */}
          <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-2 py-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const ts = getVideoTime?.() ?? null;
                void addNotebookCell(selected.id, "markdown", "", undefined, ts);
              }}
            >
              <FileCode2 className="mr-1 size-3" /> Markdown
            </Button>
            <EmbeddedAddCodeCell
              notebookId={selected.id}
              notebookKernel={selected.kernel}
              getVideoTime={getVideoTime}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EmbeddedCell({
  cell,
  index,
  kernel,
  getVideoTime,
  onSeekVideo,
}: {
  cell: NotebookCell;
  index: number;
  kernel: NotebookKernel;
  getVideoTime?: () => number | null;
  onSeekVideo?: (sec: number) => void;
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
      const output = await runCell({ ...cell, source }, kernel);
      await updateNotebookCell(cell.id, {
        output,
        status: "success",
        executionCount: (cell.executionCount ?? 0) + 1,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await updateNotebookCell(cell.id, {
        output: msg,
        status: "error",
      });
      toast.error(msg.includes("Pyodide failed") ? "Python runtime not ready — please wait a moment" : "Cell failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="overflow-hidden border border-border bg-surface-1">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {index + 1}
          </span>
          {cell.type === "code" && (
            <LanguagePicker
              value={cell.language as NotebookLanguage}
              onChange={(lang) => void updateNotebookCell(cell.id, { language: lang })}
              compact
            />
          )}
          {cell.linkedTimestamp != null && onSeekVideo && (
            <button
              type="button"
              onClick={() => onSeekVideo(cell.linkedTimestamp ?? 0)}
              className="ml-1 inline-flex items-center gap-0.5 rounded bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary"
              title="Seek video to this point"
            >
              <Clock className="size-2.5" />
              {fmtTime(cell.linkedTimestamp)}
            </button>
          )}
        </div>
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
        <NotebookCellOutput
          output={cell.output}
          status={cell.status}
          className="px-2 py-1.5 text-[10px]"
        />
      )}
    </section>
  );
}

function EmbeddedAddCodeCell({
  notebookId,
  notebookKernel,
  getVideoTime,
}: {
  notebookId: string;
  notebookKernel: NotebookKernel;
  getVideoTime?: () => number | null;
}) {
  const defaultLang: NotebookLanguage =
    notebookKernel === "pyodide" ? "python" : notebookKernel === "html" ? "html" : "javascript";
  const [lang, setLang] = useState<NotebookLanguage>(defaultLang);

  const handleAdd = async () => {
    const ts = getVideoTime?.() ?? null;
    await addNotebookCell(notebookId, "code", "", lang, ts);
  };

  return (
    <div className="flex items-center gap-1.5">
      <LanguagePicker value={lang} onChange={setLang} compact />
      <Button variant="outline" size="sm" onClick={() => void handleAdd()}>
        <Plus className="mr-1 size-3" /> Code
      </Button>
    </div>
  );
}
