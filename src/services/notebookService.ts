import { nanoid } from "nanoid";
import {
  getDb,
  type Notebook,
  type NotebookCell,
  type NotebookCellType,
  type NotebookKernel,
} from "@/db/schema";
import { saveAs } from "file-saver";

export async function createNotebook(
  title = "Untitled notebook",
  resourceId: string | null = null,
) {
  const now = Date.now();
  const notebook: Notebook = {
    id: nanoid(),
    title,
    resourceId,
    kernel: "browser",
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
    '// JavaScript runs in a short-lived Web Worker.\nconsole.log("hello");',
    "javascript",
  );
  return notebook;
}

export async function addNotebookCell(
  notebookId: string,
  type: NotebookCellType,
  source = "",
  language = type === "code" ? "javascript" : "markdown",
) {
  const db = getDb();
  const cells = await db.notebook_cells.where("notebookId").equals(notebookId).toArray();
  const now = Date.now();
  const cell: NotebookCell = {
    id: nanoid(),
    notebookId,
    type,
    orderIndex: cells.length,
    source,
    language,
    output: "",
    status: "idle",
    executionCount: null,
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

export async function runBrowserJavascript(cell: NotebookCell): Promise<string> {
  if (cell.language !== "javascript" && cell.language !== "js") {
    throw new Error(
      "Browser kernel currently runs JavaScript cells. Connect Jupyter for Python, R, or other languages.",
    );
  }
  const workerSource = `
    self.onmessage = (event) => {
      const logs = [];
      const original = console.log;
      console.log = (...args) => logs.push(args.map(String).join(" "));
      try {
        const result = eval(event.data);
        if (result !== undefined) logs.push(String(result));
        self.postMessage({ ok: true, output: logs.join("\\n") || "(no output)" });
      } catch (error) {
        self.postMessage({ ok: false, output: error instanceof Error ? error.message : String(error) });
      } finally {
        console.log = original;
      }
    };
  `;
  const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  const worker = new Worker(url);
  return await new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Cell execution timed out after 5 seconds."));
    }, 5000);
    worker.onmessage = (event: MessageEvent<{ ok: boolean; output: string }>) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (event.data.ok) resolve(event.data.output);
      else reject(new Error(event.data.output));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message || "Cell execution failed."));
    };
    worker.postMessage(cell.source);
  }).finally(() => URL.revokeObjectURL(url));
}

export function notebookKernelLabel(kernel: NotebookKernel): string {
  return {
    browser: "Browser JavaScript",
    jupyter: "Local Jupyter",
    kaggle: "Kaggle notebook",
    colab: "Google Colab",
  }[kernel];
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
        language: "javascript",
        name: notebook.kernel,
      },
      language_info: { name: "javascript" },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
  saveAs(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/x-ipynb+json" }),
    `${notebook.title || "notebook"}.ipynb`,
  );
}
