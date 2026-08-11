import { notify } from "./notify";

let lastToastAt = 0;
const DEBOUNCE_MS = 2500;

function shouldToast() {
  const now = Date.now();
  if (now - lastToastAt < DEBOUNCE_MS) return false;
  lastToastAt = now;
  return true;
}

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandledrejection]", event.reason);
    if (shouldToast()) {
      const msg =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? "Unknown error");
      notify.error("Something went wrong", { description: msg.slice(0, 180) });
    }
  });

  window.addEventListener("error", (event) => {
    if (event.message?.includes("ResizeObserver loop")) return;
    console.error("[window.error]", event.error || event.message);
    if (shouldToast()) {
      notify.error("Unexpected error", {
        description: (event.message || "Unknown").slice(0, 180),
      });
    }
  });
}
