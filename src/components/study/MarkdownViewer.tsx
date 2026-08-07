import { useEffect, useState } from "react";
import type { Resource } from "@/db/schema";
import { readTextResource } from "@/services/fileSystemService";
import { driveOpenUrl } from "@/services/driveService";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { HighlightCapture } from "./HighlightCapture";
import { MarkdownRenderer } from "@/components/notes/MarkdownRenderer";

function DrivePreviewFrame({ resource, hint }: { resource: Resource; hint: string }) {
  return (
    <div className="flex h-full flex-col bg-black">
      <iframe
        title={resource.name}
        src={`https://drive.google.com/file/d/${resource.driveId}/preview`}
        className="size-full flex-1 border-0"
      />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
        <span>{hint}</span>
        <Button asChild size="sm" variant="ghost">
          <a href={driveOpenUrl(resource.driveId)} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-1 size-3.5" /> Open
          </a>
        </Button>
      </div>
    </div>
  );
}

export function MarkdownViewer({ resource }: { resource: Resource }) {
  const [content, setContent] = useState<string | null>(null);
  const [needsRemote, setNeedsRemote] = useState(false);

  useEffect(() => {
    let active = true;
    setContent(null);
    setNeedsRemote(false);
    (async () => {
      if (!resource.isDownloaded && !resource.telegramFileId && resource.source !== "local") {
        if (active) setNeedsRemote(true);
        return;
      }
      try {
        const text = await readTextResource(resource.id);
        if (text == null) {
          if (active) setNeedsRemote(true);
          return;
        }
        if (active) setContent(text);
      } catch {
        if (active) setNeedsRemote(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [resource.id, resource.isDownloaded, resource.source, resource.telegramFileId]);

  if (needsRemote) {
    return (
      <DrivePreviewFrame
        resource={resource}
        hint="Streaming from Drive. Download for rich rendering."
      />
    );
  }
  if (content == null) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <HighlightCapture resourceId={resource.id} className="overflow-y-auto bg-surface-1 p-8">
      <MarkdownRenderer markdown={content} className="mx-auto max-w-3xl" />
    </HighlightCapture>
  );
}

export function HtmlViewer({ resource }: { resource: Resource }) {
  const [content, setContent] = useState<string | null>(null);
  const [needsRemote, setNeedsRemote] = useState(false);

  useEffect(() => {
    let active = true;
    setContent(null);
    setNeedsRemote(false);
    (async () => {
      if (!resource.isDownloaded && !resource.telegramFileId && resource.source !== "local") {
        if (active) setNeedsRemote(true);
        return;
      }
      try {
        const text = await readTextResource(resource.id);
        if (text == null) {
          if (active) setNeedsRemote(true);
          return;
        }
        if (active) setContent(text);
      } catch {
        if (active) setNeedsRemote(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [resource.id, resource.isDownloaded, resource.source, resource.telegramFileId]);

  if (needsRemote) {
    return <DrivePreviewFrame resource={resource} hint="Streaming from Drive." />;
  }
  if (content == null) return <div className="p-8 text-muted-foreground">Loading…</div>;
  return (
    <iframe
      srcDoc={content}
      sandbox="allow-same-origin"
      className="size-full border-0"
      title={resource.name}
    />
  );
}

export function ImageViewer({ resource }: { resource: Resource }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    (async () => {
      if (resource.isDownloaded) {
        const file = await readLocalResource(resource.id);
        if (file && active) {
          url = URL.createObjectURL(file);
          setSrc(url);
          return;
        }
      }
      // Fall back to Drive thumbnail (CORS-safe for <img>)
      if (active) setSrc(`https://drive.google.com/thumbnail?id=${resource.driveId}&sz=w2000`);
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [resource.id, resource.isDownloaded, resource.driveId]);
  if (!src) return <div className="p-8 text-muted-foreground">Loading…</div>;
  return (
    <div className="flex h-full items-center justify-center bg-black p-4">
      <img src={src} alt={resource.name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
