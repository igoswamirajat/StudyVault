/**
 * Safe JavaScript runner using a dedicated Web Worker.
 * Same isolation pattern already used by notebook JS cells.
 * No DOM, no window, no IndexedDB access from the worker.
 */

export interface SafeRunResult {
  logs: string[];
  result?: string;
  error?: string;
  durationMs: number;
}

export async function runSafeJavaScript(code: string, timeoutMs = 5000): Promise<SafeRunResult> {
  const start = performance.now();

  return new Promise((resolve) => {
    const workerSource = `
      "use strict";
      const logs = [];
      console.log = (...args) => logs.push("[log] " + args.map(String).join(" "));
      console.warn = (...args) => logs.push("[warn] " + args.map(String).join(" "));
      console.error = (...args) => logs.push("[error] " + args.map(String).join(" "));

      self.onmessage = (e) => {
        try {
          const fn = new Function(e.data.code);
          const result = fn();
          if (result !== undefined) logs.push(String(result));
          self.postMessage({ type: "ok", logs });
        } catch (err) {
          self.postMessage({
            type: "error",
            error: err && err.message ? err.message : String(err),
            logs,
          });
        }
      };
    `;

    const blob = new Blob([workerSource], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);

    let settled = false;

    const finish = (payload: Omit<SafeRunResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ ...payload, durationMs: Math.round(performance.now() - start) });
    };

    const timer = setTimeout(() => {
      finish({ logs: [], error: `Execution timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    worker.onmessage = (e) => {
      if (e.data.type === "ok") {
        finish({ logs: e.data.logs || [] });
      } else {
        finish({ logs: e.data.logs || [], error: e.data.error || "Unknown error" });
      }
    };

    worker.onerror = (err) => {
      finish({ logs: [], error: err.message || "Worker crashed" });
    };

    worker.postMessage({ code });
  });
}
