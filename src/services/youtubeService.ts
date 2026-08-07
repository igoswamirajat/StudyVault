import { nanoid } from "nanoid";
import { getDb, type Resource, type YoutubePlaylist } from "@/db/schema";
import { getSetting, setSetting } from "./storageService";
import {
  extractYoutubePlaylistId,
  safeYoutubeTitle,
  type YoutubePlaylistScan,
} from "./youtubeParse";
import { scanYoutubePlaylistServerFn } from "./youtubeScan.functions";

export interface YoutubeImportResult {
  mode: "embed" | "expanded";
  playlist: YoutubePlaylistScan | null;
  playlistId: string;
  title: string;
  videoCount: number | null;
  imported: number;
  updated: number;
}

export async function saveYoutubePlaylist(urlOrId: string): Promise<YoutubeImportResult> {
  const playlistId = extractYoutubePlaylistId(urlOrId);
  if (!playlistId) throw new Error("Paste a valid YouTube playlist URL.");
  const now = Date.now();
  const db = getDb();
  const previous = await db.youtube_playlists.get(playlistId);
  const playlist: YoutubePlaylist = {
    id: playlistId,
    playlistId,
    title: previous?.title ?? "YouTube playlist",
    url: `https://www.youtube.com/playlist?list=${playlistId}`,
    channelTitle: previous?.channelTitle ?? null,
    mode: "embed",
    videoCount: previous?.videoCount ?? null,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
  await db.youtube_playlists.put(playlist);
  await setSetting("appInitialized", true);
  return {
    mode: "embed",
    playlist: null,
    playlistId,
    title: playlist.title,
    videoCount: playlist.videoCount,
    imported: previous ? 0 : 1,
    updated: previous ? 1 : 0,
  };
}

export async function importYoutubePlaylist(
  urlOrId: string,
  apiKey?: string | null,
  options: { saveApiKey?: boolean } = {},
): Promise<YoutubeImportResult> {
  const playlistId = extractYoutubePlaylistId(urlOrId);
  if (!playlistId) throw new Error("Paste a valid YouTube playlist URL.");
  const key = apiKey?.trim() || (await getSetting<string | null>("youtubeApiKey", null))?.trim();
  if (!key) throw new Error("Add a YouTube Data API key to import playlists.");

  const playlist = await scanYoutubePlaylistServerFn({ data: { playlistId, apiKey: key } });
  if (playlist.videos.length === 0) throw new Error("No playable videos found in this playlist.");

  const db = getDb();
  const existing = new Map(
    (await db.resources.toArray())
      .filter((resource) => resource.youtubeVideoId)
      .map((resource) => [resource.youtubeVideoId!, resource]),
  );
  const folderPath = `YouTube/${safeYoutubeTitle(playlist.title)}`;
  const now = Date.now();
  const baseOrder = (await db.resources.orderBy("orderIndex").last())?.orderIndex ?? 0;
  let imported = 0;
  let updated = 0;

  await db.transaction("rw", db.resources, db.folders, async () => {
    const segments = folderPath.split("/");
    for (let i = 0; i < segments.length; i++) {
      const path = segments.slice(0, i + 1).join("/");
      if (!(await db.folders.get(path))) {
        await db.folders.put({
          path,
          name: segments[i],
          parentPath: segments.slice(0, i).join("/"),
          createdAt: now,
          source: "youtube",
        });
      }
    }

    for (const video of playlist.videos) {
      const previous = existing.get(video.videoId);
      const resource: Resource = {
        id: previous?.id ?? `youtube-${video.videoId}-${nanoid(4)}`,
        name: video.title,
        type: "video",
        mimeType: "video/youtube",
        driveId: "",
        size: 0,
        dayAssignment: null,
        orderIndex: baseOrder + video.index + 1,
        isDownloaded: false,
        localPath: null,
        thumbnailUrl: video.thumbnailUrl,
        addedAt: previous?.addedAt ?? now,
        lastOpenedAt: previous?.lastOpenedAt ?? null,
        durationSeconds: video.durationSeconds,
        transcriptText: previous?.transcriptText ?? video.description,
        folderPath,
        parentFolderId: playlist.playlistId,
        revisionFlag: previous?.revisionFlag ?? null,
        tags: previous?.tags ?? [],
        status: previous?.status ?? "active",
        source: "youtube",
        youtubeVideoId: video.videoId,
        youtubePlaylistId: playlist.playlistId,
        youtubeIndex: video.index,
        youtubeChannelTitle: video.channelTitle,
        youtubePublishedAt: video.publishedAt,
      };
      await db.resources.put(resource);
      if (previous) updated++;
      else imported++;
    }
  });

  const existingPlaylist = await db.youtube_playlists.get(playlist.playlistId);
  await db.youtube_playlists.put({
    id: playlist.playlistId,
    playlistId: playlist.playlistId,
    title: playlist.title,
    url: `https://www.youtube.com/playlist?list=${playlist.playlistId}`,
    channelTitle: playlist.channelTitle || null,
    mode: "expanded",
    videoCount: playlist.videos.length,
    createdAt: existingPlaylist?.createdAt ?? now,
    updatedAt: now,
  });
  if (options.saveApiKey) await setSetting("youtubeApiKey", key);
  await setSetting("appInitialized", true);
  return {
    mode: "expanded",
    playlist,
    playlistId: playlist.playlistId,
    title: playlist.title,
    videoCount: playlist.videos.length,
    imported,
    updated,
  };
}
