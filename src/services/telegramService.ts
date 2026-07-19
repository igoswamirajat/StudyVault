import { nanoid } from "nanoid";
import { getDb, type Resource } from "@/db/schema";
import { classifyTelegramFile, type TelegramScannedFile } from "./telegramParse";
import {
  checkTelegramConnectionServerFn,
  sendTelegramCodeServerFn,
  verifyTelegramCodeServerFn,
  scanTelegramChatServerFn,
  downloadTelegramFileServerFn,
  type TelegramChatInfo,
} from "./telegramScan.functions";
import { getSetting } from "./storageService";

export type { TelegramChatInfo } from "./telegramScan.functions";

export async function checkTelegramHealth(
  botToken: string,
  chatId: string,
): Promise<TelegramChatInfo> {
  return checkTelegramConnectionServerFn({ data: { botToken, chatId } });
}

export async function sendTelegramOtp(
  apiId: number,
  apiHash: string,
  phone: string,
): Promise<{ ok: boolean; phoneCodeHash?: string; pendingSession?: string; error?: string }> {
  return sendTelegramCodeServerFn({ data: { apiId, apiHash, phone } });
}

export async function verifyTelegramOtp(
  apiId: number,
  apiHash: string,
  phone: string,
  code: string,
  phoneCodeHash: string,
  pendingSession: string,
): Promise<{ ok: boolean; session?: string; error?: string }> {
  return verifyTelegramCodeServerFn({ data: { apiId, apiHash, phone, code, phoneCodeHash, pendingSession } });
}

export async function scanTelegramChat(
  token: string,
  chatId: string,
): Promise<TelegramScannedFile[]> {
  const apiId = (await getSetting<number>("telegramApiId")) ?? 0;
  const apiHash = (await getSetting<string>("telegramApiHash")) ?? "";
  const sessionString = (await getSetting<string>("telegramSession")) ?? "";
  if (!apiId || !apiHash || !sessionString) {
    throw new Error("Telegram user session not configured. Complete login first.");
  }
  return scanTelegramChatServerFn({ data: { apiId, apiHash, chatId, sessionString } });
}

export async function ingestTelegramFiles(
  files: TelegramScannedFile[],
): Promise<{ imported: number; skipped: number }> {
  const db = getDb();
  const existing = await db.resources.toArray();
  const existingTgIds = new Set(
    existing.filter((r) => r.telegramFileId).map((r) => r.telegramFileId),
  );
  const existingCount = existing.length;
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (existingTgIds.has(f.telegramFileId)) {
      skipped++;
      continue;
    }

    const id = `tg-${nanoid(10)}`;
    const dayMatch = (f.caption ?? "").match(/day\s*0*(\d+)/i);
    const folderPath = f.caption?.match(/^\/(.+)/)?.[1] ?? "";

    const resource: Resource = {
      id,
      name: f.name,
      type: classifyTelegramFile(f.name, f.mimeType),
      mimeType: f.mimeType,
      driveId: "",
      size: f.size,
      dayAssignment: dayMatch ? Number(dayMatch[1]) : null,
      orderIndex: existingCount + imported + 1,
      isDownloaded: false,
      localPath: null,
      thumbnailUrl: null,
      addedAt: f.date * 1000,
      lastOpenedAt: null,
      durationSeconds: null,
      folderPath: folderPath || undefined,
      source: "telegram",
      telegramFileId: f.telegramFileId,
      telegramMessageId: f.messageId,
    };

    await db.resources.put(resource);
    imported++;
  }

  return { imported, skipped };
}

export async function downloadTelegramFile(
  resourceId: string,
): Promise<ArrayBuffer> {
  const db = getDb();
  const r = await db.resources.get(resourceId);
  if (!r || !r.telegramMessageId) throw new Error("Resource not found or not a Telegram file");

  const apiId = (await getSetting<number>("telegramApiId")) ?? 0;
  const apiHash = (await getSetting<string>("telegramApiHash")) ?? "";
  const sessionString = (await getSetting<string>("telegramSession")) ?? "";
  const chatId = (await getSetting<string>("telegramChatId")) ?? "";
  if (!apiId || !apiHash || !sessionString || !chatId) {
    throw new Error("Telegram not configured");
  }

  const base64 = await downloadTelegramFileServerFn({
    data: { apiId, apiHash, chatId, messageId: r.telegramMessageId, sessionString },
  });

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
