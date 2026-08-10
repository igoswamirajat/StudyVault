import type { NotebookCell, NotebookKernel } from "@/db/schema";

export interface KernelRuntimeInfo {
  installed: boolean;
  location?: string;
  version?: string;
}

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_BASE = "/pyodide";

/** All remaining kernels are browser-native — no setup needed. */
export function isBundledKernel(_kernel: NotebookKernel): boolean {
  return true;
}

/** Human label used in UI. */
export function kernelLabel(kernel: NotebookKernel): string {
  return {
    browser: "Browser JS",
    pyodide: "Python (Pyodide)",
    html: "HTML render",
  }[kernel];
}

export { PYODIDE_BASE, PYODIDE_VERSION };

/** Pyodide runtime interface — loose to survive API differences across versions. */
type PyodideType = {
  runPython: (code: string) => unknown;
  loadPackagesFromImports: (code: string) => Promise<void>;
  globals: { set: (name: string, value: unknown) => void; get: (name: string) => unknown };
  version?: () => string;
  _module?: { version?: string };
  [key: string]: unknown;
};

declare global {
  interface Window {
    /** eslint-disable-next-line @typescript-eslint/no-explicit-any */
    loadPyodide?: (...args: any[]) => Promise<any>;
  }
}

let pyodideInstance: PyodideType | null = null;
let pyodideLoading: Promise<PyodideType> | null = null;

/** Safely read Pyodide version string — survives API changes. */
function readPyodideVersion(p: PyodideType): string {
  try {
    if (typeof p.version === "function") return p.version();
    if (typeof p.version === "string") return p.version;
    if (p._module?.version) return String(p._module.version);
  } catch { /* ignore */ }
  return "unknown";
}

/**
 * Load Pyodide from local bundled files.
 */
async function loadPyodideLocally(): Promise<PyodideType> {
  // Case 1: Already loaded via <script> tag.
  if (typeof window.loadPyodide === "function") {
    return window.loadPyodide({
      indexURL: PYODIDE_BASE + "/",
      fullStdLib: false,
    });
  }

  // Case 2: Fetch and inject the loader script.
  const resp = await fetch(`${PYODIDE_BASE}/pyodide.js`);
  if (!resp.ok) throw new Error(`Failed to load ${PYODIDE_BASE}/pyodide.js (${resp.status})`);

  const js = await resp.text();
  const script = document.createElement("script");
  script.textContent = js;
  document.head.appendChild(script);

  try {
    // Cast needed: TS narrows window.loadPyodide to undefined after Case 1 return.
    const loader = (window as unknown as Record<string, unknown>)["loadPyodide"] as ((...a: unknown[]) => Promise<PyodideType>) | undefined;
    if (typeof loader !== "function") {
      throw new Error("pyodide.js loaded but loadPyodide() not found.");
    }
    return loader({
      indexURL: PYODIDE_BASE + "/",
      fullStdLib: false,
    });
  } finally {
    document.head.removeChild(script);
  }
}

/**
 * Load Pyodide once and cache the singleton.
 */
export async function loadPyodideOnce(): Promise<PyodideType | null> {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading) return pyodideLoading;

  pyodideLoading = loadPyodideLocally().then((instance) => {
    pyodideInstance = instance;
    return instance;
  }).catch((error) => {
    pyodideLoading = null;
    pyodideInstance = null;
    console.error("[Pyodide] Failed to initialize:", error);
    throw error;
  }).finally(() => {
    pyodideLoading = null;
  });

  return pyodideLoading;
}

/** Clear the cached Pyodide instance (for testing or runtime switch). */
export function resetPyodide() {
  pyodideInstance = null;
  pyodideLoading = null;
}

/** Check if Pyodide is loaded without triggering a load. */
export function isPyodideReady(): boolean {
  return pyodideInstance !== null;
}

/** Run a Python cell in Pyodide. Captures stdout/stderr. */
export async function runPyodideCell(cell: NotebookCell): Promise<string> {
  const pyodide = await loadPyodideOnce();
  if (!pyodide) throw new Error("Pyodide failed to initialize. Check browser console.");

  // Allow automatic package installation from imports (slow on first call, cached after).
  await pyodide.loadPackagesFromImports(cell.source).catch(() => {});

  // Pass cell source as a global variable to avoid string escaping issues.
  pyodide.globals.set("__cell_source", cell.source);

  // Single-shot: setup capture → run code → read output → restore stdout.
  // Returns stdout as plain string via last expression — no dict/Map conversion.
  const result = await pyodide.runPython(`
import sys, traceback
from io import StringIO

__buf_out = StringIO()
__buf_err = StringIO()
__old_out, __old_err = sys.stdout, sys.stderr
sys.stdout, sys.stderr = __buf_out, __buf_err

try:
    exec(compile(__cell_source, "<cell>", "exec"), {"__builtins__": __builtins__})
except BaseException as e:
    traceback.print_exception(type(e), e, e.__traceback__, file=sys.stderr)

sys.stdout, sys.stderr = __old_out, __old_err
__out = __buf_out.getvalue()
__err = __buf_err.getvalue()
if __err:
    __out = (__out + chr(10) + __err).strip()
__out if __out else "(no output)"
`) as string;

  return typeof result === "string" && result.trim() ? result.trim() : "(no output)";
}

/** Run a JavaScript cell in a Web Worker. */
export async function runBrowserJavascript(cell: NotebookCell): Promise<string> {
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

/** Run an HTML cell — returns marker for iframe rendering. */
export async function runHtml(cell: NotebookCell): Promise<string> {
  return `HTML_RENDER:${cell.source}`;
}

/** Run SQL cell — not supported in browser. */
export async function runSql(_cell: NotebookCell): Promise<string> {
  throw new Error(
    "SQL runs locally in the browser only when the SQLite engine is bundled. " +
      "Use this cell to draft and save your query for review.",
  );
}
