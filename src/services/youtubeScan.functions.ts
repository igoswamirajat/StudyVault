import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  parseIsoDuration,
  youtubeThumbnailUrl,
  type YoutubePlaylistScan,
  type YoutubePlaylistVideo,
} from "./youtubeParse";

const Input = z.object({
  playlistId: z.string().min(1),
  apiKey: z.string().min(1),
});

interface YoutubeApiResponse {
  nextPageToken?: string;
  items?: Array<Record<string, unknown>>;
}

async function youtubeRequest(path: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `YouTube API returned ${response.status}`);
  }
  return (await response.json()) as YoutubeApiResponse;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const scanYoutubePlaylistServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<YoutubePlaylistScan> => {
    const playlist = await youtubeRequest(
      "playlists",
      { part: "snippet", id: data.playlistId },
      data.apiKey,
    );
    const playlistSnippet = (playlist.items?.[0]?.snippet ?? {}) as Record<string, unknown>;
    if (!playlist.items?.length) throw new Error("YouTube playlist not found or is not public.");

    const items: Array<Record<string, unknown>> = [];
    let pageToken = "";
    do {
      const page = await youtubeRequest(
        "playlistItems",
        {
          part: "snippet,contentDetails",
          playlistId: data.playlistId,
          maxResults: "50",
          ...(pageToken ? { pageToken } : {}),
        },
        data.apiKey,
      );
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken ?? "";
    } while (pageToken);

    const ids = items
      .map((item) => text((item.contentDetails as Record<string, unknown> | undefined)?.videoId))
      .filter(Boolean);
    const durations = new Map<string, number | null>();
    for (let i = 0; i < ids.length; i += 50) {
      const page = await youtubeRequest(
        "videos",
        { part: "contentDetails", id: ids.slice(i, i + 50).join(",") },
        data.apiKey,
      );
      for (const item of page.items ?? []) {
        const id = text(item.id);
        const details = (item.contentDetails ?? {}) as Record<string, unknown>;
        durations.set(id, parseIsoDuration(text(details.duration)));
      }
    }

    const videos: YoutubePlaylistVideo[] = items.flatMap((item, index) => {
      const snippet = (item.snippet ?? {}) as Record<string, unknown>;
      const content = (item.contentDetails ?? {}) as Record<string, unknown>;
      const resourceId = (snippet.resourceId ?? {}) as Record<string, unknown>;
      const videoId = text(content.videoId) || text(resourceId.videoId);
      if (!videoId) return [];
      const thumbnails = (snippet.thumbnails ?? {}) as Record<string, Record<string, unknown>>;
      const thumbnail = thumbnails.high ?? thumbnails.medium ?? thumbnails.default;
      return [
        {
          videoId,
          playlistId: data.playlistId,
          title: text(snippet.title) || `Video ${index + 1}`,
          description: text(snippet.description),
          channelTitle: text(snippet.videoOwnerChannelTitle) || text(playlistSnippet.channelTitle),
          thumbnailUrl: text(thumbnail?.url) || youtubeThumbnailUrl(videoId),
          durationSeconds: durations.get(videoId) ?? null,
          publishedAt: text(snippet.publishedAt) || null,
          index,
        },
      ];
    });

    return {
      playlistId: data.playlistId,
      title: text(playlistSnippet.title) || "YouTube playlist",
      channelTitle: text(playlistSnippet.channelTitle),
      videos,
    };
  });
