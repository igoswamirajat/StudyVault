import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared notebook cell output renderer.
 * - `HTML_RENDER:<html>` output is shown in a sandboxed iframe.
 * - everything else renders as a monospace pre.
 */
export function NotebookCellOutput({
  output,
  status,
  className,
}: {
  output: string;
  status?: string;
  className?: string;
}) {
  const html = useMemo(() => {
    if (!output.startsWith("HTML_RENDER:")) return null;
    return output.slice("HTML_RENDER:".length);
  }, [output]);

  if (html !== null) {
    return (
      <div className={cn("border-t border-border", className)}>
        <iframe
          title="HTML output"
          srcDoc={html}
          sandbox=""
          className="h-64 w-full bg-background"
        />
      </div>
    );
  }

  return (
    <pre
      className={cn(
        "border-t border-border whitespace-pre-wrap px-4 py-3 font-mono text-xs",
        status === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {output}
    </pre>
  );
}
