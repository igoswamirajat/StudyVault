import { getDb, type Resource } from "@/db/schema";
import { getOrCreateSummary, listNotesForResource } from "@/services/notesService";
import { getPlayableVideoUrl, sampleFrames } from "@/lib/videoFrames";
import type { AiMedia } from "@/services/aiService";

/**
 * Assembles a rich, human-readable context block about a resource so AI
 * features stop guessing from the bare filename. Pulls the folder ("week")
 * breadcrumb, sibling resources, the user's own summary/notes, bookmarks,
 * and playback metadata — all from Dexie.
 *
 * This is the shared grounding used by summaries, auto-notes, flashcards,
 * quizzes, the Doubt Buster, and the in-session assistant.
 */
export interface ResourceContextOptions {
  maxChars?: number;
  includeSiblings?: boolean;
  includeUserSummary?: boolean;
}

export async function buildResourceContext(
  resource: Resource,
  options: ResourceContextOptions = {},
): Promise<string> {
  const db = getDb();
  const maxChars = options.maxChars ?? 100000;
  const lines: string[] = [];

  lines.push(`Title: ${resource.name}`);
  lines.push(`Type: ${resource.type}`);
  const source =
    resource.source ??
    (resource.telegramFileId ? "telegram" : resource.driveId ? "drive" : "local");
  lines.push(`Source: ${source}`);

  // Folder / "week" breadcrumb.
  if (resource.folderPath) {
    lines.push(`Location: ${resource.folderPath.split("/").join(" › ")}`);
  }
  if (resource.dayAssignment != null) {
    lines.push(`Day/Unit: ${resource.dayAssignment}`);
  }
  if (resource.durationSeconds) {
    lines.push(`Duration: ~${Math.round(resource.durationSeconds / 60)} min`);
  }
  if (resource.tags && resource.tags.length) {
    lines.push(`Tags: ${resource.tags.join(", ")}`);
  }
  if (resource.transcriptText?.trim()) {
    const raw = resource.transcriptText.trim();
    const cleanTranscript = raw.startsWith("[YTDLP_V1]\n") ? raw.replace("[YTDLP_V1]\n", "") : raw;
    lines.push(
      `\nTranscript or source description:\n"""\n${cleanTranscript.slice(0, 100_000)}\n"""`,
    );
  } else if (resource.source === "youtube") {
    lines.push(
      "\nContent limitation: YouTube playback is embedded and no transcript was provided. Do not claim to know details that are not present in notes or context.",
    );
  }

  // Sibling resources in the same folder (or day) — situates the topic.
  try {
    if (options.includeSiblings !== false) {
      const all = await db.resources.toArray();
      const active = all.filter((r) => (r.status ?? "active") === "active" && r.id !== resource.id);
      const siblings = resource.folderPath
        ? active.filter((r) => r.folderPath === resource.folderPath)
        : active.filter((r) => r.dayAssignment === resource.dayAssignment);
      if (siblings.length) {
        const names = siblings
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .slice(0, 20)
          .map((r) => `  - ${r.name} (${r.type})`);
        lines.push(`\nOther material in the same ${resource.folderPath ? "folder" : "unit"}:`);
        lines.push(...names);
      }
    }
  } catch {
    /* best-effort */
  }

  // The user's own summary note — their distilled understanding.
  try {
    if (options.includeUserSummary !== false) {
      const summary = await getOrCreateSummary(resource);
      const md = summary.contentMarkdown?.trim();
      if (md && md.length > 0) {
        lines.push(`\nUser's summary note:\n"""\n${md}\n"""`);
      }
    }
  } catch {
    /* best-effort */
  }

  // Other notes attached to this resource (excluding the summary).
  try {
    const notes = (await listNotesForResource(resource.id)).filter((n) => !n.isSummary);
    const withText = notes.filter((n) => n.contentMarkdown?.trim());
    if (withText.length) {
      lines.push(`\nUser's other notes:`);
      for (const n of withText) {
        lines.push(`  • ${n.title}:\n${n.contentMarkdown.trim()}\n`);
      }
    }
  } catch {
    /* best-effort */
  }

  // Bookmarks — the moments the user flagged as important.
  try {
    const bookmarks = await db.bookmarks.where("resourceId").equals(resource.id).toArray();
    if (bookmarks.length) {
      const items = bookmarks
        .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
        .slice(0, 20)
        .map((b) => {
          const m = Math.floor(b.timestampSeconds / 60);
          const s = String(Math.floor(b.timestampSeconds % 60)).padStart(2, "0");
          return `  - [${m}:${s}] ${b.label}`;
        });
      lines.push(`\nUser's bookmarks (timestamps they flagged):`);
      lines.push(...items);
    }
  } catch {
    /* best-effort */
  }

  return lines.join("\n").slice(0, maxChars);
}

/**
 * Samples still frames from local/offline files and Telegram media. This never
 * hands a remote Drive or YouTube URL to the AI provider.
 *
 * For Drive-streamed videos we deliberately return no media: their bytes live
 * behind Google's player and their thumbnail URLs are private (fetching them
 * server-side 403s). Those resources rely on the rich text context instead —
 * which already includes title, folder, siblings, the user's notes & bookmarks.
 *
 * Best-effort: any failure (unreadable file, decode error) resolves to no
 * media rather than throwing, so AI generation still proceeds text-only.
 */
const mediaCache = new Map<string, AiMedia>();

export async function gatherResourceMedia(resource: Resource, frameCount = 4): Promise<AiMedia> {
  if (resource.type !== "video") return {};
  // YouTube iframe bytes are cross-origin and cannot be sampled by StudyVault.
  if (resource.source === "youtube") return {};
  const cacheKey = `${resource.id}:${frameCount}:${resource.isDownloaded}:${Boolean(resource.telegramFileId)}`;
  const cached = mediaCache.get(cacheKey);
  if (cached) return cached;
  // Drive-only and YouTube resources remain text-only. Telegram media may be
  // fetched through its existing service, then cached for follow-up requests.
  if (!resource.isDownloaded && !resource.telegramFileId) {
    // Drive-streamed: try to inline the poster thumbnail CLIENT-side (the
    // browser's Google session can read it), so the server never fetches a
    // private URL. Weak signal, but better than nothing for vision models.
    const poster = await inlineThumbnail(resource);
    const media = poster ? { images: [poster] } : {};
    mediaCache.set(cacheKey, media);
    return media;
  }
  try {
    const url = await getPlayableVideoUrl(resource.id);
    if (!url) {
      const media = {};
      mediaCache.set(cacheKey, media);
      return media;
    }
    try {
      const images = await sampleFrames(url, frameCount, 512);
      const media = images.length ? { images } : {};
      mediaCache.set(cacheKey, media);
      return media;
    } finally {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
  } catch {
    const media = {};
    mediaCache.set(cacheKey, media);
    return media;
  }
}

/**
 * Fetches a resource's thumbnail in the browser and returns it as a base64
 * data URL, so it can be embedded directly in the AI request instead of a
 * remote (often private) URL. Returns null on any failure — including the
 * common CORS/403 case for Drive-hosted thumbnails.
 */
async function inlineThumbnail(resource: Resource): Promise<string | null> {
  const src = resource.thumbnailUrl;
  if (!src || typeof fetch === "undefined") return null;
  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
