import { nanoid } from "nanoid";
import {
  getDb,
  type Notebook,
  type NotebookCell,
  type NotebookCellType,
  type NotebookKernel,
} from "@/db/schema";
import { saveAs } from "file-saver";
import { kernelLabel, runPyodideCell, runHtml, runSql, runBrowserJavascript } from "@/services/kernelService";

export async function createNotebook(
  title = "Untitled notebook",
  resourceId: string | null = null,
  kernel?: NotebookKernel,
  language?: string,
  linkedTimestamp: number | null = null,
) {
  const now = Date.now();
  const kernelType: NotebookKernel = kernel ?? (resourceId ? "pyodide" : "browser");
  const notebook: Notebook = {
    id: nanoid(),
    title,
    resourceId,
    kernel: kernelType,
    language: language ?? (kernelType === "pyodide" ? "python" : "javascript"),
    runtimePath: null,
    runtimeInstalled: false,
    linkedTimestamp,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().notebooks.put(notebook);
  await addNotebookCell(
    notebook.id,
    "markdown",
    "# Notes\n\nWrite concepts, explanations, and references here.",
  );
  await addNotebookCell(
    notebook.id,
    "code",
    kernelType === "pyodide"
      ? 'print("hello")'
      : '// JavaScript runs in a short-lived Web Worker.\nconsole.log("hello");',
    notebook.language,
  );
  return notebook;
}

export async function addNotebookCell(
  notebookId: string,
  type: NotebookCellType,
  source = "",
  language?: string,
  linkedTimestamp: number | null = null,
) {
  const db = getDb();
  const cells = await db.notebook_cells.where("notebookId").equals(notebookId).toArray();
  const notebook = await db.notebooks.get(notebookId);
  const lang = language ?? (type === "code" ? (notebook?.language ?? "javascript") : "markdown");
  const now = Date.now();
  const cell: NotebookCell = {
    id: nanoid(),
    notebookId,
    type,
    orderIndex: cells.length,
    source,
    language: lang,
    output: "",
    status: "idle",
    executionCount: null,
    linkedTimestamp,
    createdAt: now,
    updatedAt: now,
  };
  await db.notebook_cells.put(cell);
  await db.notebooks.update(notebookId, { updatedAt: now });
  return cell;
}

export async function updateNotebook(notebookId: string, patch: Partial<Notebook>) {
  await getDb().notebooks.update(notebookId, { ...patch, updatedAt: Date.now() });
}

export async function updateNotebookCell(cellId: string, patch: Partial<NotebookCell>) {
  const db = getDb();
  const cell = await db.notebook_cells.get(cellId);
  if (!cell) return;
  await db.notebook_cells.put({ ...cell, ...patch, updatedAt: Date.now() });
  await db.notebooks.update(cell.notebookId, { updatedAt: Date.now() });
}

export async function deleteNotebookCell(cellId: string) {
  const db = getDb();
  const cell = await db.notebook_cells.get(cellId);
  if (!cell) return;
  await db.notebook_cells.delete(cellId);
  const rest = await db.notebook_cells
    .where("notebookId")
    .equals(cell.notebookId)
    .sortBy("orderIndex");
  await db.transaction("rw", db.notebook_cells, db.notebooks, async () => {
    for (const [index, item] of rest.entries())
      await db.notebook_cells.update(item.id, { orderIndex: index });
    await db.notebooks.update(cell.notebookId, { updatedAt: Date.now() });
  });
}

export async function runCell(cell: NotebookCell, kernel?: NotebookKernel): Promise<string> {
  const lang = cell.language?.toLowerCase() ?? "";

  // Cell language is authoritative — the per-cell picker must always win.
  // A cell set to Python runs Pyodide even inside a browser-kernel notebook,
  // and a cell set to JavaScript runs the worker even inside a pyodide notebook.
  if (lang === "python" || lang === "py") {
    return runPyodideCell(cell);
  }
  if (lang === "html") {
    return runHtml(cell);
  }
  if (lang === "sql") {
    return runSql(cell);
  }

  // Languages that can't run in the browser — show clear error.
  if (lang === "c" || lang === "cpp" || lang === "rust" || lang === "go" || lang === "r") {
    throw new Error(
      `"${cell.language}" can't run in the browser. ` +
        `Supported in-browser: JavaScript, Python, SQL, HTML.`,
    );
  }

  // No explicit language (or js/ts/unknown) — fall back to the kernel default.
  if (kernel === "pyodide") {
    return runPyodideCell({ ...cell, language: "python" });
  }
  if (kernel === "html") {
    return runHtml(cell);
  }

  // browser kernel, or js/ts — run the JS worker.
  return runBrowserJavascript(cell);
}

export function notebookKernelLabel(kernel: NotebookKernel): string {
  return kernelLabel(kernel);
}

export async function exportNotebookIpynb(notebookId: string): Promise<void> {
  const db = getDb();
  const notebook = await db.notebooks.get(notebookId);
  if (!notebook) throw new Error("Notebook not found");
  const cells = await db.notebook_cells.where("notebookId").equals(notebookId).sortBy("orderIndex");
  const data = {
    cells: cells.map((cell) => ({
      cell_type: cell.type,
      execution_count: cell.type === "code" ? cell.executionCount : null,
      metadata: { language: cell.language },
      source: cell.source
        .split("\n")
        .map((line, index, lines) => (index < lines.length - 1 ? `${line}\n` : line)),
      outputs:
        cell.type === "code" && cell.output
          ? cell.status === "error"
            ? [{ output_type: "error", ename: "Error", evalue: cell.output, traceback: [] }]
            : [{ output_type: "stream", name: "stdout", text: [`${cell.output}\n`] }]
          : [],
    })),
    metadata: {
      kernelspec: {
        display_name: notebookKernelLabel(notebook.kernel),
        language: notebook.language || "javascript",
        name: notebook.kernel,
      },
      language_info: { name: notebook.language || "javascript" },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
  saveAs(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/x-ipynb+json" }),
    `${notebook.title || "notebook"}.ipynb`,
  );
}
