import { type ResourceType } from "@/db/schema";
import { classifyByName } from "./driveParse";

export interface TelegramScannedFile {
  telegramFileId: string;
  messageId: number;
  name: string;
  mimeType: string;
  size: number;
  caption: string | null;
  date: number;
}

export function classifyTelegramFile(name: string, mimeType: string): ResourceType {
  return classifyByName(name, mimeType);
}

export function extractChatId(input: string): string | null {
  const trimmed = input.trim();
  if (/^-?\d+$/.test(trimmed)) return trimmed;
  const usernameMatch = trimmed.match(/^@([a-zA-Z][a-zA-Z0-9_]{3,31})$/);
  if (usernameMatch) return `@${usernameMatch[1]}`;
  const linkMatch = trimmed.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z][a-zA-Z0-9_]{3,31})/);
  if (linkMatch) return `@${linkMatch[1]}`;
  return null;
}

export function looksLikeChatId(input: string): boolean {
  return extractChatId(input) !== null;
}

export function formatTelegramFileName(doc: {
  fileName?: string;
  mimeType: string;
  id: string;
}): string {
  if (doc.fileName) return doc.fileName;
  const ext = mimeToExt(doc.mimeType);
  return `telegram_${doc.id}${ext}`;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "video/mp4": ".mp4",
    "video/x-matroska": ".mkv",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "text/markdown": ".md",
    "text/html": ".html",
    "text/plain": ".txt",
  };
  return map[mime] ?? "";
}

export function looksLikeBotToken(token: string): boolean {
  return /^\d{8,10}:[A-Za-z0-9_-]{35}$/.test(token.trim());
}
