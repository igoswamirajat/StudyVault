import { useState } from "react";
import type { Resource } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { ExternalLink, AlertTriangle } from "lucide-react";

export function WebViewer({ resource }: { resource: Resource }) {
  const [iframeFailed, setIframeFailed] = useState(false);

  if (!resource.url) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground">
        <div>
          <AlertTriangle className="mx-auto mb-4 size-10 text-destructive/80" />
          <p className="mb-2 text-lg font-semibold text-foreground">Missing URL</p>
          <p className="text-sm">This web resource does not have a URL associated with it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-white">
      {/* Top bar with original link */}
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2 text-sm text-muted-foreground">
        <div className="truncate pr-4 text-xs">
          Viewing: <span className="font-medium text-foreground">{resource.url}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
          asChild
        >
          <a href={resource.url} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1.5 size-3.5" />
            Open in new tab
          </a>
        </Button>
      </div>

      {/* Main viewer */}
      <div className="relative flex-1 overflow-hidden">
        {iframeFailed ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
            <AlertTriangle className="mx-auto mb-4 size-10 text-orange-400" />
            <p className="mb-2 text-lg font-semibold text-foreground">Cannot embed this website</p>
            <p className="mb-6 max-w-md text-sm">
              This website blocks embedding for security reasons. You can still read the extracted text in the Notes panel, or open the site in a new tab.
            </p>
            <Button asChild>
              <a href={resource.url} target="_blank" rel="noreferrer">
                Open in new tab
              </a>
            </Button>
          </div>
        ) : (
          <iframe
            src={resource.url}
            className="h-full w-full border-none"
            title={resource.name}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onError={() => setIframeFailed(true)}
          />
        )}
      </div>
    </div>
  );
}
