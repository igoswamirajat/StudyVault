import { useEffect, useRef, useState } from "react";
import { Bookmark, ExternalLink, Loader2, Play, RotateCcw } from "lucide-react";
import type { VideoController } from "./VideoViewer";
import { Button } from "@/components/ui/button";
import { getDb, type Resource } from "@/db/schema";
import { setStatus } from "@/services/progressService";
import { youtubeWatchUrl } from "@/services/youtubeParse";
import { toast } from "sonner";

interface Props {
  resource: Resource;
  resumeEnabled: boolean;
  onEnded?: () => void;
  onControllerReady?: (controller: VideoController | null) => void;
}

interface YoutubePlayer {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
}

function isUsablePlayer(value: unknown): value is YoutubePlayer {
  if (!value || typeof value !== "object") return false;
  const player = value as Partial<YoutubePlayer>;
  return (
    typeof player.getCurrentTime === "function" &&
    typeof player.getDuration === "function" &&
    typeof player.seekTo === "function" &&
    typeof player.destroy === "function"
  );
}

interface YoutubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YoutubePlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; CUED: number };
}

declare global {
  interface Window {
    YT?: YoutubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YoutubeApi> | null = null;

function loadYoutubeApi(): Promise<YoutubeApi> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("YouTube player needs a browser."));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YoutubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player failed to initialize."));
    };
    const existing = document.getElementById("youtube-iframe-api");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("Couldn't load YouTube player."));
    document.head.appendChild(script);
  });
  return youtubeApiPromise;
}

export function YoutubeViewer({ resource, resumeEnabled, onEnded, onControllerReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YoutubePlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(resource.durationSeconds ?? 0);

  useEffect(() => {
    let active = true;
    let player: YoutubePlayer | null = null;
    const videoId = resource.youtubeVideoId;
    if (!videoId || !mountRef.current) {
      setError("This YouTube lesson has no video ID.");
      setLoading(false);
      return;
    }

    void loadYoutubeApi()
      .then((api) => {
        if (!active || !mountRef.current) return;
        const candidate = new api.Player(mountRef.current, {
          videoId,
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: async () => {
              if (!active || !isUsablePlayer(player)) return;
              playerRef.current = player;
              onControllerReady?.({
                getCurrentTime: () => {
                  const current = playerRef.current;
                  return isUsablePlayer(current) ? current.getCurrentTime() : null;
                },
                seekTo: (seconds) => {
                  const current = playerRef.current;
                  if (isUsablePlayer(current)) current.seekTo(Math.max(0, seconds), true);
                },
              });
              const nextDuration = player.getDuration();
              if (nextDuration > 0) {
                setDuration(nextDuration);
                await getDb().resources.update(resource.id, { durationSeconds: nextDuration });
              }
              if (resumeEnabled) {
                const progress = await getDb().video_progress.get(resource.id);
                if (
                  progress &&
                  progress.currentTime > 5 &&
                  progress.currentTime < nextDuration - 5
                ) {
                  player.seekTo(progress.currentTime, true);
                  setCurrentTime(progress.currentTime);
                  toast(`Resumed from ${formatTimestamp(progress.currentTime)}`);
                }
              }
              setLoading(false);
            },
            onStateChange: (event) => {
              if (!player) return;
              if (event.data === api.PlayerState.ENDED) {
                if (onEnded) onEnded();
                else void setStatus(resource.id, "completed");
              }
            },
            onError: () => {
              setError("This video cannot be embedded. Open it on YouTube instead.");
              setLoading(false);
            },
          },
        });
        if (isUsablePlayer(candidate)) player = candidate;
        else setError("YouTube player returned an incompatible API object.");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "YouTube player failed to load.");
        setLoading(false);
      });

    return () => {
      active = false;
      const mountedPlayer = playerRef.current ?? player;
      if (isUsablePlayer(mountedPlayer)) {
        const time = mountedPlayer.getCurrentTime();
        if (Number.isFinite(time)) {
          void getDb().video_progress.put({
            resourceId: resource.id,
            currentTime: time,
            updatedAt: Date.now(),
          });
        }
      }
      playerRef.current = null;
      onControllerReady?.(null);
      if (isUsablePlayer(mountedPlayer)) mountedPlayer.destroy();
    };
  }, [resource.id, resource.youtubeVideoId, resumeEnabled, onEnded, onControllerReady]);

  useEffect(() => {
    const save = () => {
      const player = playerRef.current;
      if (!isUsablePlayer(player)) return;
      const time = player.getCurrentTime();
      if (Number.isFinite(time)) {
        setCurrentTime(time);
        void getDb().video_progress.put({
          resourceId: resource.id,
          currentTime: time,
          updatedAt: Date.now(),
        });
      }
    };
    const timer = window.setInterval(save, 5000);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [resource.id]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      )
        return;
      const player = playerRef.current;
      if (!isUsablePlayer(player)) return;
      if (event.key === "ArrowRight")
        player.seekTo(Math.min(duration, player.getCurrentTime() + 10), true);
      if (event.key === "ArrowLeft") player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [duration]);

  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={mountRef} className="size-full" />
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-black text-white transition-opacity duration-200">
            <Loader2 className="size-8 animate-spin text-white/60" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 text-center text-white">
            <p className="max-w-sm text-sm text-white/70">{error}</p>
            <Button
              asChild
              variant="outline"
              className="border-white/30 bg-transparent text-white hover:bg-white/10"
            >
              <a
                href={youtubeWatchUrl(resource.youtubeVideoId ?? "", resource.youtubePlaylistId)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mr-2 size-4" /> Open on YouTube
              </a>
            </Button>
          </div>
        )}
      </div>
      <div className="border-t border-white/10 bg-surface-1 px-3 py-2">
        <div className="mb-2 h-1 overflow-hidden bg-surface-3">
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const player = playerRef.current;
                if (isUsablePlayer(player)) player.seekTo(Math.max(0, currentTime - 10), true);
              }}
              title="Back 10 seconds"
            >
              <RotateCcw className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void addBookmark(resource.id, currentTime)}
            >
              <Bookmark className="mr-1 size-3.5" /> Bookmark
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a
                href={youtubeWatchUrl(resource.youtubeVideoId ?? "", resource.youtubePlaylistId)}
                target="_blank"
                rel="noreferrer"
              >
                <Play className="mr-1 size-3.5" /> YouTube
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

async function addBookmark(resourceId: string, timestampSeconds: number) {
  await getDb().bookmarks.add({
    resourceId,
    timestampSeconds,
    label: `Bookmark at ${formatTimestamp(timestampSeconds)}`,
    createdAt: Date.now(),
  });
  toast.success("Bookmark added");
}
