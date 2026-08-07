// Client-only: samples still frames from a playable video so a vision model
// can actually "see" the content. Only works for videos that play in a native
// <video> element (downloaded or Telegram files) — NOT Drive iframe embeds,
// which are cross-origin and cannot be drawn to a canvas.

/**
 * Loads an off-screen <video> from an object URL, seeks to evenly spaced
 * timestamps, and captures each frame as a JPEG data URL.
 *
 * @param videoUrl  An object URL (blob:) for a local/Telegram video file.
 * @param count     Number of frames to sample (default 6).
 * @param maxWidth  Downscale width to keep payloads small (default 640px).
 */
export async function sampleFrames(videoUrl: string, count = 6, maxWidth = 640): Promise<string[]> {
  if (typeof document === "undefined") return [];

  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    const onMeta = () => resolve();
    const onErr = () => reject(new Error("Could not load video for frame sampling"));
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", onErr, { once: true });
  });

  const duration = video.duration;
  if (!isFinite(duration) || duration <= 0) return [];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const frames: string[] = [];
  // Sample within [5%, 95%] of the timeline to skip intros/black frames.
  const start = duration * 0.05;
  const end = duration * 0.95;
  const step = count > 1 ? (end - start) / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    const t = start + step * i;
    try {
      await seekTo(video, t);
      const w = video.videoWidth || maxWidth;
      const h = video.videoHeight || Math.round(maxWidth * 0.5625);
      const scale = w > maxWidth ? maxWidth / w : 1;
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.7));
    } catch {
      // Skip frames that fail to seek/draw; keep whatever we got.
    }
  }

  video.src = "";
  return frames;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("seek failed"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onErr);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onErr, { once: true });
    video.currentTime = time;
  });
}

/**
 * Resolves a playable object URL for a resource if (and only if) its bytes are
 * locally available. Returns null for Drive-iframe-only videos.
 */
export async function getPlayableVideoUrl(resourceId: string): Promise<string | null> {
  const { getDb } = await import("@/db/schema");
  const { readLocalResource, resourceUrl } = await import("@/services/fileSystemService");
  const resource = await getDb().resources.get(resourceId);
  if (!resource) return null;
  if (resource.isDownloaded) {
    const file = await readLocalResource(resource.id);
    return file ? URL.createObjectURL(file) : null;
  }
  if (resource.telegramFileId) {
    return resourceUrl(resource.id);
  }
  return null;
}
