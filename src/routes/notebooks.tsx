import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Code2,
  Download,
  Eye,
  FileCode2,
  Play,
  Plus,
  Trash2,
  Pencil,
  DownloadCloud,
  RefreshCw,
} from "lucide-react";
import { ClientOnly } from "@/components/common/ClientOnly";
import { NewContentMenu } from "@/components/common/NewContentMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResizableSize, ResizeHandle } from "@/hooks/useResizableSize";
import {
  kernelStatus,
  ensureRuntime,
  kernelLabel,
  runPyodideCell,
  isBundledKernel,
  kernelDownloadHint,
} from "@/services/kernelService";
import { MarkdownRenderer } from "@/components/notes/MarkdownRenderer";
import { getDb, type NotebookCell, type NotebookKernel } from "@/db/schema";
import {
  addNotebookCell,
  createNotebook,
  deleteNotebookCell,
  notebookKernelLabel,
  exportNotebookIpynb,
  runBrowserJavascript,
  updateNotebook,
  updateNotebookCell,
} from "@/services/notebookService";
import { toast } from "sonner";

export const Route = createFileRoute("/notebooks")({
  component: () => (
    <ClientOnly fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <NotebooksPage />
    </ClientOnly>
  ),
});

function NotebooksPage() {
  const notebookRows = useLiveQuery(
    () => getDb().notebooks.orderBy("updatedAt").reverse().toArray(),
    [],
  );
  const notebooks = useMemo(() => notebookRows ?? [], [notebookRows]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const sidebar = useResizableSize({
    storageKey: "panel:notebooks:sidebarWidth",
    defaultValue: 260,
    min: 200,
    max: 420,
    direction: "left",
  });
  const selected = notebooks.find((notebook) => notebook.id === selectedId) ?? notebooks[0];
  const cells =
    useLiveQuery(
      () =>
        selected
          ? getDb().notebook_cells.where("notebookId").equals(selected.id).sortBy("orderIndex")
          : Promise.resolve([] as NotebookCell[]),
      [selected?.id],
    ) ?? [];

  useEffect(() => {
    if (!selectedId && notebooks[0]) setSelectedId(notebooks[0].id);
  }, [notebooks, selectedId]);

  async function handleNew() {
    const notebook = await createNotebook();
    setSelectedId(notebook.id);
  }

  if (!selected) {
    return (
      <div className="flex min-h-[calc(100vh-48px)] items-center justify-center p-6">
        <div className="max-w-md text-center">
          <Code2 className="mx-auto mb-3 size-10 text-primary" />
          <h1 className="text-2xl font-black uppercase tracking-tight">Practice notebooks</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Mix explanations and runnable code while studying.
          </p>
          <Button className="mt-5" onClick={() => void handleNew()}>
            <Plus className="mr-2 size-4" /> New notebook
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)]">
      <aside
        style={{ width: sidebar.size }}
        className="flex min-h-0 shrink-0 flex-col border-r border-border bg-surface-1/40"
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Notebooks
          </p>
          <NewContentMenu variant="ghost" size="icon" label="" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {notebooks.map((notebook) => (
            <button
              key={notebook.id}
              type="button"
              onClick={() => setSelectedId(notebook.id)}
              className={`mb-1 w-full rounded border px-3 py-2 text-left text-sm ${selected.id === notebook.id ? "border-foreground bg-foreground text-background" : "border-transparent text-muted-foreground hover:bg-accent"}`}
            >
              <span className="block truncate font-medium">{notebook.title}</span>
              <span className="mt-1 block text-[10px] opacity-70">
                {notebookKernelLabel(notebook.kernel)}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <ResizeHandle side="left" onMouseDown={sidebar.startDrag} />

      <main className="min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
          <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Practice workspace
              </p>
              <Input
                value={selected.title}
                onChange={(event) =>
                  void updateNotebook(selected.id, { title: event.target.value })
                }
                className="mt-1 h-10 border-0 bg-transparent px-0 text-2xl font-black focus-visible:ring-0"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Kernel
              <select
                value={selected.kernel}
                onChange={(event) => {
                  const kernel = event.target.value as NotebookKernel;
                  void updateNotebook(selected.id, {
                    kernel,
                    language:
                      kernel === "pyodide" ? "python" : kernel === "html" ? "html" : "javascript",
                  });
                }}
                className="h-9 border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="browser">Browser JS</option>
                <option value="pyodide">Python (Pyodide)</option>
                <option value="html">HTML render</option>
                <option value="jupyter">Local Jupyter</option>
                <option value="kaggle">Kaggle notebook</option>
                <option value="colab">Google Colab</option>
              </select>
            </label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportNotebookIpynb(selected.id)}
              title="Export for Colab, Kaggle, or VS Code"
            >
              <Download className="mr-1.5 size-3.5" /> .ipynb
            </Button>
          </header>

          <KernelStatusBar kernel={selected.kernel} notebookId={selected.id} />

          <div className="space-y-4">
            {cells.map((cell, index) => (
              <NotebookCellEditor
                key={cell.id}
                cell={cell}
                index={index}
                kernel={selected.kernel}
                onDelete={() => void deleteNotebookCell(cell.id)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => void addNotebookCell(selected.id, "markdown")}>
              <FileCode2 className="mr-2 size-4" /> Markdown cell
            </Button>
            <Button variant="outline" onClick={() => void addNotebookCell(selected.id, "code")}>
              <Code2 className="mr-2 size-4" /> Code cell
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function KernelStatusBar({ kernel, notebookId }: { kernel: NotebookKernel; notebookId: string }) {
  const [info, setInfo] = useState<{ ready: boolean; reason?: string; location?: string } | null>(
    null,
  );
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let active = true;
    void kernelStatus(kernel).then((s) => {
      if (active) setInfo({ ready: s.ready, reason: s.reason, location: s.runtime?.location });
    });
    return () => {
      active = false;
    };
  }, [kernel]);

  async function install() {
    setInstalling(true);
    try {
      const runtime = await ensureRuntime(kernel);
      await updateNotebook(notebookId, {
        runtimePath: runtime.location ?? null,
        runtimeInstalled: true,
      });
      setInfo({ ready: true, location: runtime.location });
      toast.success(`${kernelLabel(kernel)} runtime ready`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Runtime setup failed");
    } finally {
      setInstalling(false);
    }
  }

  if (isBundledKernel(kernel)) {
    return (
      <div className="border border-border bg-surface-1 p-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{kernelLabel(kernel)}</span> runs in your
        browser — no setup needed.
      </div>
    );
  }

  const hint = kernelDownloadHint(kernel);
  const ready = info?.ready;
  return (
    <div className="border border-border bg-surface-1 p-2.5 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-3.5" />
          <span>
            <span className="font-medium text-foreground">{kernelLabel(kernel)}</span>
            {hint ? ` · ${hint}` : ""}
          </span>
          <span className={ready ? "text-success" : "text-destructive"}>
            {ready ? "ready" : "not configured"}
          </span>
        </div>
        {!ready && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={installing}
            onClick={() => void install()}
          >
            <DownloadCloud className="mr-1 size-3.5" />
            {installing ? "Loading…" : "Install runtime"}
          </Button>
        )}
      </div>
      {info?.reason && !ready && <p className="mt-1">{info.reason}</p>}
      {info?.location && ready && <p className="mt-1 truncate font-mono">{info.location}</p>}
    </div>
  );
}

function NotebookCellEditor({
  cell,
  index,
  kernel,
  onDelete,
}: {
  cell: NotebookCell;
  index: number;
  kernel: NotebookKernel;
  onDelete: () => void;
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
    <section className="overflow-hidden border border-border bg-surface-1 shadow-[3px_3px_0_var(--border)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {index + 1} · {cell.type}
        </span>
        <div className="flex items-center gap-1">
          {cell.type === "markdown" && (
            <Button size="sm" variant="ghost" onClick={() => setPreview((value) => !value)}>
              {preview ? <Pencil className="mr-1 size-3.5" /> : <Eye className="mr-1 size-3.5" />}
              {preview ? "Edit" : "Render"}
            </Button>
          )}
          {cell.type === "code" && (
            <Button size="sm" variant="ghost" onClick={() => void run()} disabled={running}>
              <Play className="mr-1 size-3.5" />
              {running ? "Running" : "Run"}
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete cell">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {cell.type === "code" && (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <select
            value={cell.language}
            onChange={(event) => void updateNotebookCell(cell.id, { language: event.target.value })}
            className="h-7 border border-input bg-background px-2 font-mono text-[11px]"
          >
            {kernel === "pyodide" ? (
              <>
                <option value="python">Python</option>
              </>
            ) : (
              <>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="r">R</option>
                <option value="sql">SQL</option>
              </>
            )}
          </select>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {kernelLabel(kernel)}
          </span>
        </div>
      )}
      {preview && cell.type === "markdown" ? (
        <MarkdownRenderer markdown={source} className="min-h-24 px-4 py-3" />
      ) : (
        <textarea
          value={source}
          onChange={(event) => setSource(event.target.value)}
          onBlur={() => void saveSource()}
          className={`min-h-32 w-full resize-y border-0 bg-background px-4 py-3 outline-none ${cell.type === "code" ? "font-mono text-sm" : "text-sm"}`}
          placeholder={cell.type === "code" ? "Write code…" : "Write Markdown…"}
        />
      )}
      {cell.type === "code" && cell.output && (
        <pre
          className={`border-t border-border whitespace-pre-wrap px-4 py-3 font-mono text-xs ${cell.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {cell.output}
        </pre>
      )}
    </section>
  );
}
