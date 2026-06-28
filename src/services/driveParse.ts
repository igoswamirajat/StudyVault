// Pure Google Drive parsing/helpers — NO Dexie, NO `window`, NO network.
// Safe to import from both the client and the server (used by the keyless
// Drive scan server function in driveScan.functions.ts).
import type { ResourceType } from "@/db/schema";

const FOLDER_ID_RE = /folders\/([a-zA-Z0-9_-]+)/;

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export function extractFolderId(url: string): string | null {
  const trimmed = url.trim();
  // Plain ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(FOLDER_ID_RE);
  return m ? m[1] : null;
}

/**
 * Best-effort check that a string looks like a Drive folder link or bare id,
 * used to gate the scan button before any network call.
 */
export function looksLikeDriveFolder(url: string): boolean {
  return extractFolderId(url) !== null;
}

export function driveDownloadUrl(driveId: string): string {
  return `https://drive.google.com/uc?export=download&id=${driveId}`;
}

export function driveOpenUrl(driveId: string): string {
  return `https://drive.google.com/file/d/${driveId}/view`;
}

export function driveThumbUrl(driveId: string): string {
  return `https://drive.google.com/thumbnail?id=${driveId}&sz=w400`;
}

export function classifyByName(name: string, mime?: string): ResourceType {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mkv", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  if (["md", "markdown", "txt"].includes(ext)) return "markdown";
  if (["html", "htm"].includes(ext)) return "html";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (mime) {
    if (mime.startsWith("video/")) return "video";
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("image/")) return "image";
    if (mime === "text/html") return "html";
    if (mime.startsWith("text/")) return "markdown";
  }
  return "other";
}

export interface ScannedFile {
  driveId: string;
  name: string;
  mimeType: string;
  size: number;
  thumbnailUrl: string | null;
  folderPath: string;
  parentFolderId: string;
  createdTime: number | null; // ms epoch, from Drive createdTime
}

/**
 * Parse Google Drive's `embeddedfolderview` HTML.
 *
 * The markup nests several `<div>`s per entry (icon → visual-card → visual)
 * BEFORE the title, so we can't bound an entry by "the next three </div>".
 * Instead we slice from each `id="entry-<id>"` to the start of the next one,
 * which is robust to whatever nesting Google ships.
 *
 * Folders are returned with `mimeType === FOLDER_MIME` so callers can tell them
 * apart from files — the embed view lists subfolders but can't scan inside them.
 */
export function parseEmbedHtml(html: string, parentFolderId = ""): ScannedFile[] {
  const out: ScannedFile[] = [];
  const idRe = /id="entry-([a-zA-Z0-9_-]+)"/g;
  const starts: Array<{ id: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(html)) !== null) starts.push({ id: m[1], index: m.index });

  for (let i = 0; i < starts.length; i++) {
    const driveId = starts[i].id;
    const end = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const block = html.slice(starts[i].index, end);

    const titleMatch = block.match(/class="flip-entry-title"[^>]*>([^<]*)</);
    const name =
      titleMatch && titleMatch[1].trim() ? decodeHtml(titleMatch[1].trim()) : `file-${driveId}`;

    // Folders carry a "Folder" aria-label / folder sprite, and their link points
    // at /drive/folders/<id> rather than /file/d/<id>.
    const isFolder =
      /aria-label="Folder"/.test(block) ||
      /drive-sprite-folder-/.test(block) ||
      /\/drive\/folders\//.test(block);

    const thumbMatch = block.match(/<img[^>]+src="([^"]+)"/);
    out.push({
      driveId,
      name,
      mimeType: isFolder ? FOLDER_MIME : "",
      size: 0,
      thumbnailUrl: thumbMatch ? thumbMatch[1] : driveThumbUrl(driveId),
      folderPath: "",
      parentFolderId,
      createdTime: null,
    });
  }
  return out;
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
