import { getDb } from "@/db/schema";
import { fetchYoutubeTranscriptServerFn } from "./youtubeTranscript.functions";

/**
 * Fetch YouTube transcript and cache in resource.transcriptText.
 * Idempotent — skips if transcript already populated.
 * Called at resource-open time (lazy) rather than playlist import.
 */
export async function fetchAndCacheTranscript(resourceId: string): Promise<void> {
  const db = getDb();
  const resource = await db.resources.get(resourceId);
  if (!resource?.youtubeVideoId) return;
  if (resource.transcriptText?.trim()) return; // already cached

  try {
    const { transcript } = await fetchYoutubeTranscriptServerFn({
      data: { videoId: resource.youtubeVideoId },
    });
    if (transcript) {
      await db.resources.update(resourceId, { transcriptText: transcript });
    }
  } catch {
    // Transcript extraction failed (datacenter IP, no captions, etc.)
    // Silent fail — AI features will show the "no transcript" limitation message.
  }
}
