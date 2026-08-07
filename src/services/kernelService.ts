import type { NotebookCell, NotebookKernel } from "@/db/schema";
import { getSetting, setSetting } from "@/services/storageService";

export interface KernelRuntimeInfo {
  installed: boolean;
  /** Where the runtime lives. For pyodide this is the CDN index path we load from. */
  location?: string;
  version?: string;
}

const PYODIDE_VERSION = "0.26.4";
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

const SETTING_RUNTIME = "runtime:paths";

type RuntimePathMap = Partial<Record<NotebookKernel, string>>;

async function getRuntimePaths(): Promise<RuntimePathMap> {
  const stored = await getSetting<RuntimePathMap | undefined>(SETTING_RUNTIME);
  return stored ?? {};
}

/** Register a local runtime path (Electron / local launcher scenario). */
export async function setRuntimePath(kernel: NotebookKernel, path: string): Promise<void> {
  const paths = await getRuntimePaths();
  await setSetting(SETTING_RUNTIME, { ...paths, [kernel]: path });
}

/** Is this kernel backed by a browser-native runtime (no download needed)? */
export function isBundledKernel(kernel: NotebookKernel): boolean {
  return kernel === "browser" || kernel === "html";
}

/** Human label used in UI. */
export function kernelLabel(kernel: NotebookKernel): string {
  return {
    browser: "Browser JS",
    pyodide: "Python (Pyodide)",
    html: "HTML render",
    jupyter: "Local Jupyter",
    kaggle: "Kaggle",
    colab: "Google Colab",
  }[kernel];
}

/** Rough size hint for the download prompt. */
export function kernelDownloadHint(kernel: NotebookKernel): string | null {
  if (kernel === "pyodide") return "Pyodide (~7 MB WASM)";
  return null;
}

/**
 * Kernel readiness.
 * - browser/html: always ready.
 * - pyodide: download-on-first-run (browser), persisted runtime path optional.
 * - jupyter/kaggle/colab: external, user-configured.
 */
export async function kernelStatus(
  kernel: NotebookKernel,
): Promise<{ ready: boolean; reason?: string; runtime?: KernelRuntimeInfo }> {
  if (kernel === "browser" || kernel === "html") {
    return { ready: true, runtime: { installed: true } };
  }
  if (kernel === "pyodide") {
    const paths = await getRuntimePaths();
    const location = paths.pyodide ?? PYODIDE_CDN;
    return {
      ready: true,
      runtime: {
        installed: true,
        location,
        version: PYODIDE_VERSION,
      },
    };
  }
  const paths = await getRuntimePaths();
  const location = paths[kernel];
  return {
    ready: Boolean(location),
    reason: location
      ? "Runtime path configured."
      : `${kernelLabel(kernel)} is not configured. Add a runtime path or use a bundled kernel.`,
    runtime: { installed: Boolean(location), location },
  };
}

/** Download/install a runtime. Pyodide is lazy-loaded; Jupyter-family returns instructions. */
export async function ensureRuntime(kernel: NotebookKernel): Promise<KernelRuntimeInfo> {
  const status = await kernelStatus(kernel);
  if (status.ready && status.runtime) return status.runtime;

  if (kernel === "pyodide") {
    // Nothing to pre-download in the browser; the loader fetches on first import.
    await setRuntimePath(kernel, PYODIDE_CDN);
    return { installed: true, location: PYODIDE_CDN, version: PYODIDE_VERSION };
  }

  if (kernel === "jupyter") {
    await setRuntimePath(kernel, "http://localhost:8888");
    return { installed: true, location: "http://localhost:8888" };
  }

  throw new Error(
    `${kernelLabel(kernel)} needs an external runtime. Connect it in Settings or use "Browser JS".`,
  );
}

export { PYODIDE_CDN, PYODIDE_VERSION };

/** Lazily load Pyodide once and cache the instance. Loaded from CDN via <script>, not bundled. */
type PyodideType = {
  runPython: (code: string) => unknown;
  loadPackagesFromImports: (code: string) => Promise<void>;
  setStdout: (cb: (text: string) => void) => void;
  setStderr: (cb: (text: string) => void) => void;
};

declare global {
  interface Window {
    loadPyodide?: (options: { indexURL: string }) => Promise<PyodideType>;
  }
}

let pyodidePromise: Promise<PyodideType | null> | null = null;

function loadPyodideScript(): Promise<PyodideType> {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) {
      resolve(window.loadPyodide({ indexURL: PYODIDE_CDN }));
      return;
    }
    const existing = document.getElementById("pyodide-loader-script");
    if (existing) {
      // Wait for in-flight load.
      const handler = () => {
        if (window.loadPyodide) {
          cleanup();
          resolve(window.loadPyodide({ indexURL: PYODIDE_CDN }));
        }
      };
      const cleanup = () => {
        existing.removeEventListener("load", handler);
        existing.removeEventListener("error", onError);
      };
      const onError = () => {
        cleanup();
        reject(new Error("Pyodide script failed to load."));
      };
      existing.addEventListener("load", handler);
      existing.addEventListener("error", onError);
      return;
    }
    const script = document.createElement("script");
    script.id = "pyodide-script";
    script.src = `${PYODIDE_CDN}pyodide.js`;
    script.onload = () => {
      if (window.loadPyodide) resolve(window.loadPyodide({ indexURL: PYODIDE_CDN }));
      else reject(new Error("Pyodide loaded but its API is missing."));
    };
    script.onerror = () => reject(new Error("Couldn't download the Pyodide runtime."));
    document.head.appendChild(script);
  });
}

async function loadPyodideOnce(): Promise<PyodideType | null> {
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = loadPyodideScript().catch((error) => {
    pyodidePromise = null;
    throw error;
  });
  return pyodidePromise;
}

/** Run a Python cell in Pyodide. Captures stdout/stderr. */
export async function runPyodideCell(cell: NotebookCell): Promise<string> {
  if (cell.language !== "python" && cell.language !== "py") {
    throw new Error("The Python kernel runs .py / python cells.");
  }
  const pyodide = await loadPyodideOnce();
  if (!pyodide) throw new Error("Pyodide failed to initialize.");
  await pyodide.loadPackagesFromImports(cell.source).catch(() => {
    /* optional package install failure shouldn't kill the run */
  });
  const out: string[] = [];
  pyodide.setStdout((text) => out.push(text));
  pyodide.setStderr((text) => out.push(text));
  try {
    const result = await pyodide.runPython(cell.source);
    if (result !== undefined && result !== null && result !== "") {
      const stringified = String(result);
      if (stringified && stringified !== "None") out.push(stringified);
    }
  } finally {
    pyodide.setStdout?.(() => undefined);
    pyodide.setStderr?.(() => undefined);
  }
  return out.length ? out.join("\n") : "(no output)";
}
