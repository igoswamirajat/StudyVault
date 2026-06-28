import { useEffect, useRef, useState } from "react";
import { getDb, type Resource } from "@/db/schema";
import { readLocalResource } from "@/services/fileSystemService";
import { driveOpenUrl } from "@/services/driveService";
import { Button } from "@/components/ui/button";
import { ExternalLink, Bookmark, Download } from "lucide-react";
import { toast } from "sonner";

interface Props {
  resource: Resource;
  resumeEnabled: boolean;
}

export function VideoViewer({ resource, resumeEnabled }: Props) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);

  // Try to load a local file (if downloaded). Otherwise fall back to Drive iframe preview.
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setLocalUrl(null);
    setLoading(true);
    (async () => {
      try {
        if (resource.isDownloaded) {
          const file = await readLocalResource(resource.id);
          if (file && active) {
            objectUrl = URL.createObjectURL(file);
            setLocalUrl(objectUrl);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [resource.id, resource.isDownloaded]);

  // Resume position (local video only)
  useEffect(() => {
    if (!ref.current || !resumeEnabled || !localUrl) return;
    const v = ref.current;
    const restore = async () => {
      const pr = await getDb().video_progress.get(resource.id);
      if (pr && pr.currentTime > 5 && pr.currentTime < (v.duration || Infinity) - 5) {
        v.currentTime = pr.currentTime;
        toast(`Resumed from ${Math.floor(pr.currentTime / 60)}:${String(Math.floor(pr.currentTime % 60)).padStart(2, "0")}`);
      }
    };
    v.addEventListener("loadedmetadata", restore, { once: true });
    return () => v.removeEventListener("loadedmetadata", restore);
  }, [resource.id, resumeEnabled, localUrl]);

  // Save progress + duration (local video only)
  useEffect(() => {
    const v = ref.current;
    if (!v || !localUrl) return;
    let last = 0;
    const onTime = () => {
      const t = v.currentTime;
      if (Math.abs(t - last) > 3) {
        last = t;
        void getDb().video_progress.put({ resourceId: resource.id, currentTime: t, updatedAt: Date.now() });
      }
    };
    const onLoaded = () => {
      if (v.duration && !resource.durationSeconds) {
        void getDb().resources.update(resource.id, { durationSeconds: v.duration });
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoaded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [resource.id, resource.durationSeconds, localUrl]);

  // Hotkeys (local video only)
  useEffect(() => {
    if (!localUrl) return;
    const handler = async (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const v = ref.current;
      if (!v) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (v.paused) v.play(); else v.pause();
      } else if (e.key === "ArrowRight" && !e.shiftKey) {
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 10);
      } else if (e.key === "ArrowLeft" && !e.shiftKey) {
        v.currentTime = Math.max(0, v.currentTime - 10);
      } else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen();
        else v.requestFullscreen();
      } else if (e.key === ">") {
        v.playbackRate = Math.min(2, v.playbackRate + 0.25);
        toast(`Speed: ${v.playbackRate}×`);
      } else if (e.key === "<") {
        v.playbackRate = Math.max(0.5, v.playbackRate - 0.25);
        toast(`Speed: ${v.playbackRate}×`);
      } else if (e.key === "b" || e.key === "B") {
        const ts = v.currentTime;
        await getDb().bookmarks.add({
          resourceId: resource.id,
          timestampSeconds: ts,
          label: `Bookmark at ${Math.floor(ts / 60)}:${String(Math.floor(ts % 60)).padStart(2, "0")}`,
          createdAt: Date.now(),
        });
        toast.success(`Bookmark added`);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [resource.id, localUrl]);

  if (loading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading video…</div>;
  }

  // Local file: use native <video> with all features
  if (localUrl) {
    return (
      <div className="flex h-full flex-col bg-black">
        <video
          ref={ref}
          src={localUrl}
          poster={resource.thumbnailUrl ?? undefined}
          controls
          autoPlay
          className="size-full flex-1 object-contain"
        />
        <div className="flex items-center justify-between border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
          <span>Space: play/pause · ←→ seek · &lt;&gt; speed · B bookmark · F fullscreen</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const v = ref.current;
              if (!v) return;
              await getDb().bookmarks.add({
                resourceId: resource.id,
                timestampSeconds: v.currentTime,
                label: `Bookmark at ${Math.floor(v.currentTime / 60)}:${String(Math.floor(v.currentTime % 60)).padStart(2, "0")}`,
                createdAt: Date.now(),
              });
              toast.success("Bookmark added");
            }}
          >
            <Bookmark className="mr-1 size-3.5" /> Bookmark
          </Button>
        </div>
      </div>
    );
  }

  // Streaming fallback: Drive's iframe preview player.
  // Direct <video src> with the Drive download URL is blocked by CORS/auth redirects.
  return (
    <div className="flex h-full flex-col bg-black">
      <iframe
        title={resource.name}
        src={`https://drive.google.com/file/d/${resource.driveId}/preview`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="size-full flex-1 border-0"
      />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
        <span>Streaming from Drive. Download for hotkeys, resume, bookmarks &amp; speed control.</span>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="ghost">
            <a href={driveOpenUrl(resource.driveId)} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 size-3.5" /> Open
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={`https://drive.google.com/uc?export=download&id=${resource.driveId}`} target="_blank" rel="noreferrer">
              <Download className="mr-1 size-3.5" /> Download
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
