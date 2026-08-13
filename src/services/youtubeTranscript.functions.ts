import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { execa } from "execa";
import path from "node:path";
import fs from "node:fs";

const Input = z.object({
  videoId: z.string().min(1),
});

const TRANSCRIPT_MAX_CHARS = 200_000;

// Get path to bundled yt-dlp binary
const getYtdlpPath = () => {
  // In development, it's at project_root/binaries
  // In production (Nitro), we passed RESOURCES_PATH in main.cjs
  let binaryPath = "yt-dlp"; // fallback to system PATH if all else fails

  if (process.env.RESOURCES_PATH) {
    // Production packaged Electron app
    binaryPath = path.join(process.env.RESOURCES_PATH, "binaries", "yt-dlp.exe");
  } else {
    // Dev environment. process.cwd() is likely the project root
    const devPath = path.join(process.cwd(), "binaries", "yt-dlp.exe");
    if (fs.existsSync(devPath)) {
      binaryPath = devPath;
    }
  }
  
  return binaryPath;
};

/**
 * Server-side YouTube transcript extraction.
 * Uses local yt-dlp binary to fetch metadata and JSON3 subtitles.
 */
export const fetchYoutubeTranscriptServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<{ transcript: string }> => {
    try {
      const ytdlpPath = getYtdlpPath();
      
      // StudyVault allows duplicate imports by appending "-suffix" to video IDs.
      // We must extract only the true 11-character YouTube video ID!
      const match = data.videoId.match(/([a-zA-Z0-9_-]{11})/);
      const cleanVideoId = match ? match[1] : data.videoId;
      
      const videoUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;

      // Run yt-dlp to dump metadata JSON directly to stdout
      const { stdout } = await execa(ytdlpPath, [
        "--skip-download",         // Don't download video/audio
        "--write-auto-sub",        // Include auto-generated subs
        "--sub-lang", "en.*,en",   // Target English
        "--sub-format", "json3",   // Request clean JSON format
        "--dump-single-json",      // Output metadata to stdout
        videoUrl
      ]);

      const metadata = JSON.parse(stdout);
      
      // Check for manual subtitles first, then fallback to auto-generated subtitles
      const subtitles = metadata.subtitles || metadata.automatic_captions;
      
      if (!subtitles || Object.keys(subtitles).length === 0) {
        return { transcript: "" };
      }

      // Pick English or the first available language track
      const langKey = Object.keys(subtitles).find(k => k.startsWith("en")) || Object.keys(subtitles)[0];
      const json3Track = subtitles[langKey]?.find((f: any) => f.ext === "json3");

      if (!json3Track) {
        return { transcript: "" };
      }

      // Fetch the transcript content directly from YouTube's secure CDN link
      const transcriptResponse = await fetch(json3Track.url);
      const transcriptJson = await transcriptResponse.json();

      // Parse events into clean text for your AI Notes Prompt
      const fullText = transcriptJson.events
        ?.filter((event: any) => event.segs)
        ?.map((event: any) => event.segs.map((s: any) => s.utf8).join(""))
        ?.join(" ")
        ?.replace(/\n/g, " ")
        ?.replace(/\s+/g, " ")
        ?.trim();

      return { transcript: (fullText || "").slice(0, TRANSCRIPT_MAX_CHARS) };
    } catch (error) {
      console.error("Transcript Error:", error);
      return { transcript: "" }; // Graceful fallback
    }
  });
