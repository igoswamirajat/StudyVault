// Server-side Google Drive proxy. The public `embeddedfolderview` endpoint does
// NOT send CORS headers, so fetching it directly from the browser always fails.
// Running the fetch on the server (TanStack Start / Nitro) sidesteps CORS and
// lets users connect a public Drive folder WITHOUT an API key.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseEmbedHtml, type ScannedFile } from "./driveParse";

const Input = z.object({ folderId: z.string().min(1) });

function embedUrl(folderId: string): string {
  return `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
}

async function fetchEmbedHtml(folderId: string): Promise<string> {
  const res = await fetch(embedUrl(folderId), {
    headers: {
      // A normal UA avoids Google occasionally returning a stripped response.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(
      `Drive returned ${res.status}: the folder may be private or the link is wrong.`,
    );
  }
  return res.text();
}

/**
 * Scan a public Drive folder via the server-side embed proxy (root-only — the
 * embed view does not expose subfolders). Returns the parsed file list.
 */
export const scanDriveEmbedServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<ScannedFile[]> => {
    const html = await fetchEmbedHtml(data.folderId);
    return parseEmbedHtml(html, data.folderId);
  });

export interface EmbedHealth {
  ok: boolean;
  fileCount: number;
  error: string | null;
}

/** Lightweight probe of a public folder via the server-side embed proxy. */
export const checkDriveEmbedServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<EmbedHealth> => {
    try {
      const html = await fetchEmbedHtml(data.folderId);
      const files = parseEmbedHtml(html, data.folderId);
      return { ok: files.length > 0, fileCount: files.length, error: null };
    } catch (e) {
      return { ok: false, fileCount: 0, error: e instanceof Error ? e.message : String(e) };
    }
  });
