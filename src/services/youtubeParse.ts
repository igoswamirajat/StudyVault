export interface YoutubePlaylistVideo {
  videoId: string;
  playlistId: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  index: number;
}

export interface YoutubePlaylistScan {
  playlistId: string;
  title: string;
  channelTitle: string;
  videos: YoutubePlaylistVideo[];
}

export function extractYoutubePlaylistId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const list = url.searchParams.get("list");
    if (list && /^[A-Za-z0-9_-]+$/.test(list)) return list;
  } catch {
    // Fall through to bare playlist IDs for keyboard-friendly imports.
  }
  const bare = input.trim();
  return /^[A-Za-z0-9_-]{10,}$/.test(bare) ? bare : null;
}

export function youtubeWatchUrl(videoId: string, playlistId?: string | null): string {
  const url = new URL(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
  if (playlistId) url.searchParams.set("list", playlistId);
  return url.toString();
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export function safeYoutubeTitle(value: string): string {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "Untitled playlist"
  );
}
