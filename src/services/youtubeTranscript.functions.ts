import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTranscript } from "youtube-transcript";

const Input = z.object({
  videoId: z.string().min(1),
});

const TRANSCRIPT_MAX_CHARS = 10_000;

/**
 * Server-side YouTube transcript extraction.
 * Uses youtube-transcript (InnerTube API) — works on residential IPs,
 * may fail from datacenter/cloud environments.
 */
export const fetchYoutubeTranscriptServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<{ transcript: string }> => {
    const snippets = await fetchTranscript(data.videoId);
    if (!snippets.length) {
      return { transcript: "" };
    }

    const text = snippets
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return { transcript: text.slice(0, TRANSCRIPT_MAX_CHARS) };
  });
