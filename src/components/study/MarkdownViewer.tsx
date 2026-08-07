import { useEffect, useState } from "react";
import type { Resource } from "@/db/schema";
import { readLocalResource, readTextResource, writeTextResource } from "@/services/fileSystemService";
import { driveOpenUrl } from "@/services/driveService";
import { Button } from "@/components/ui/button";
import { ExternalLink, Play } from "lucide-react";
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

function EditableTextResource({
  resource,
  isCode = false,
  language = "javascript",
  isHtml = false,
}: {
  resource: Resource;
  isCode?: boolean;
  language?: string;
  isHtml?: boolean;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(isHtml);

  useEffect(() => {
    let active = true;
    setContent(null);
    (async () => {
      try {
        const text = await readTextResource(resource.id);
        if (active) setContent(text ?? "");
      } catch {
        if (active) setContent("");
      }
    })();
    return () => {
      active = false;
    };
  }, [resource.id]);

  async function save() {
    if (content == null || !dirty) return;
    await writeTextResource(resource.id, content);
    setDirty(false);
  }

  async function runCode() {
    if (content == null || language !== "javascript") {
      setOutput("Only JavaScript can run inline for now.");
      return;
    }
    setRunning(true);
    setOutput("");
    setError(null);
    try {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
      let result: unknown;
      try {
        // eslint-disable-next-line no-eval
        result = eval(content);
      } finally {
        console.log = originalLog;
      }
      if (result !== undefined) logs.push(String(result));
      setOutput(logs.join("\n") || "(no output)");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  if (content == null) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {resource.name} {dirty && "· unsaved"}
        </span>
        <div className="flex items-center gap-1">
          {isHtml && (
            <Button size="sm" variant="outline" onClick={() => setPreview((v) => !v)} className="h-7">
              {preview ? "Edit" : "Preview"}
            </Button>
          )}
          {isCode && (
            <Button
              size="sm"
              variant="outline"
              disabled={running}
              onClick={() => void runCode()}
              className="h-7"
            >
              <Play className="mr-1 size-3" /> {running ? "Running…" : "Run"}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => void save()} className="h-7">
            Save
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isHtml && preview ? (
          <iframe
            srcDoc={content}
            sandbox="allow-same-origin"
            title={resource.name}
            className="size-full border-0 bg-white"
          />
        ) : isCode ? (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            spellCheck={false}
            className="h-full w-full resize-none bg-background p-4 font-mono text-sm outline-none"
          />
        ) : (
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            className="h-full w-full resize-none bg-background p-4 text-sm outline-none"
          />
        )}
      </div>
      {(output || error) && (
        <pre
          className={`whitespace-pre-wrap border-t border-border px-4 py-3 font-mono text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ?? output}
        </pre>
      )}
    </div>
  );
}

export function EditableMarkdownViewer({ resource }: { resource: Resource }) {
  return <EditableTextResource resource={resource} />;
}

export function EditableCodeViewer({ resource }: { resource: Resource }) {
  return <EditableTextResource resource={resource} isCode language="javascript" />;
}

export function EditableHtmlViewer({ resource }: { resource: Resource }) {
  return <EditableTextResource resource={resource} isHtml />;
}
