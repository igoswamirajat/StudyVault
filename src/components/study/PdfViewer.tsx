import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import type { Resource } from "@/db/schema";
import { resourceUrl } from "@/services/fileSystemService";
import { driveOpenUrl } from "@/services/driveService";
import { Button } from "@/components/ui/button";
import { ExternalLink, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { HighlightCapture } from "./HighlightCapture";
import { emitViewerState } from "@/lib/viewer-bus";

// Use CDN worker (matches installed pdfjs version)
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer({ resource }: { resource: Resource }) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.1);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLocalUrl(null);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        if (resource.isDownloaded) {
          const url = await resourceUrl(resource.id);
          if (!active) return;
          if (url.startsWith("blob:")) {
            objectUrl = url;
            setLocalUrl(url);
          }
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resource.id, resource.isDownloaded]);

  // Broadcast current page so the Notes panel can reference it
  useEffect(() => {
    emitViewerState({ resourceId: resource.id, page: pageNum });
  }, [resource.id, pageNum]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading PDF…</div>;
  }

  // Streaming fallback: Drive's iframe preview (browser fetch of Drive URLs is CORS-blocked).
  if (!localUrl) {
    if (!resource.driveId) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
          This PDF has no Drive ID. Re-scan your folder to recover the link.
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col bg-black">
        <iframe
          title={resource.name}
          src={`https://drive.google.com/file/d/${resource.driveId}/preview`}
          allow="autoplay"
          allowFullScreen
          referrerPolicy="no-referrer"
          className="size-full flex-1 border-0"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono">
            Streaming · id={resource.driveId.slice(0, 10)}… · Download for zoom &amp; pages.
          </span>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <a
                href={`https://docs.google.com/viewer?srcid=${resource.driveId}&pid=explorer&efh=false&a=v&chrome=false&embedded=true`}
                target="_blank"
                rel="noreferrer"
              >
                Docs viewer
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={driveOpenUrl(resource.driveId)} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1 size-3.5" /> Open in Drive
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">Couldn't load PDF.</p>
        <Button asChild variant="outline">
          <a href={driveOpenUrl(resource.driveId)} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 size-4" /> Open in Drive
          </a>
        </Button>
      </div>
    );
  }
  const src = localUrl;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-surface-1 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setPageNum((p) => Math.max(1, p - 1))} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>
          <input
            type="number"
            value={pageNum}
            min={1}
            max={pages || 1}
            onChange={(e) => setPageNum(Math.max(1, Math.min(pages || 1, Number(e.target.value) || 1)))}
            className="h-8 w-14 rounded-md border border-input bg-background px-2 text-center text-sm"
          />
          <span className="text-xs text-muted-foreground">/ {pages || "—"}</span>
          <Button size="icon" variant="ghost" onClick={() => setPageNum((p) => Math.min(pages || p, p + 1))} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} aria-label="Zoom out">
            <ZoomOut className="size-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.min(2.5, s + 0.1))} aria-label="Zoom in">
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>
      <HighlightCapture resourceId={resource.id} getPage={() => pageNum} className="flex-1 overflow-auto bg-surface-2 p-4">
        <div className="flex justify-center">
          <Document
            file={src}
            onLoadSuccess={(d) => setPages(d.numPages)}
            loading={<div className="text-muted-foreground">Loading…</div>}
            error={<div className="text-destructive">Failed to load PDF.</div>}
          >
            <Page pageNumber={pageNum} scale={scale} renderTextLayer renderAnnotationLayer />
          </Document>
        </div>
      </HighlightCapture>
    </div>
  );
}
