import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { TelegramScannedFile } from "./telegramParse";

const ConnectionInput = z.object({
  botToken: z.string().min(1),
  chatId: z.string().min(1),
});

const UserSessionInput = z.object({
  apiId: z.number(),
  apiHash: z.string().min(1),
  chatId: z.string().min(1),
  sessionString: z.string(),
});

const SendCodeInput = z.object({
  apiId: z.number(),
  apiHash: z.string().min(1),
  phone: z.string().min(1),
});

const VerifyCodeInput = z.object({
  apiId: z.number(),
  apiHash: z.string().min(1),
  phone: z.string().min(1),
  code: z.string().min(1),
  phoneCodeHash: z.string().min(1),
  pendingSession: z.string().min(1),
});

const DownloadInput = z.object({
  apiId: z.number(),
  apiHash: z.string().min(1),
  chatId: z.string().min(1),
  messageId: z.number(),
  sessionString: z.string(),
});

export interface TelegramChatInfo {
  ok: boolean;
  title: string | null;
  memberCount: number | null;
  error: string | null;
}

// Bot HTTP API health check — no apiId/apiHash needed
export const checkTelegramConnectionServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ConnectionInput.parse(data))
  .handler(async ({ data }): Promise<TelegramChatInfo> => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${data.botToken}/getChat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId }),
        },
      );
      const json = (await res.json()) as {
        ok: boolean;
        result?: { title?: string; first_name?: string };
        description?: string;
      };
      if (!json.ok) {
        return { ok: false, title: null, memberCount: null, error: json.description ?? "Failed" };
      }
      const title = json.result?.title ?? json.result?.first_name ?? "Chat";
      const countRes = await fetch(
        `https://api.telegram.org/bot${data.botToken}/getChatMemberCount`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: data.chatId }),
        },
      );
      const countJson = (await countRes.json()) as { ok: boolean; result?: number };
      const memberCount = countJson.ok ? (countJson.result ?? null) : null;
      return { ok: true, title, memberCount, error: null };
    } catch (e) {
      return {
        ok: false,
        title: null,
        memberCount: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

// Send OTP to phone for user session login
export const sendTelegramCodeServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SendCodeInput.parse(data))
  .handler(
    async ({ data }): Promise<{ ok: boolean; phoneCodeHash?: string; pendingSession?: string; error?: string }> => {
      const { TelegramClient } = await import("telegram");
      const { StringSession } = await import("telegram/sessions");
      const client = new TelegramClient(new StringSession(""), data.apiId, data.apiHash, {
        connectionRetries: 3,
      });
      try {
        await client.connect();
        const result = await client.sendCode(
          { apiId: data.apiId, apiHash: data.apiHash },
          data.phone,
        );
        const pendingSession = (client.session as unknown as { save(): string }).save();
        await client.disconnect();
        return { ok: true, phoneCodeHash: result.phoneCodeHash, pendingSession };
      } catch (e) {
        try {
          await client.disconnect();
        } catch {}
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

// Verify OTP and return session string
export const verifyTelegramCodeServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => VerifyCodeInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; session?: string; error?: string }> => {
    const { TelegramClient } = await import("telegram");
    const { StringSession } = await import("telegram/sessions");
    const client = new TelegramClient(
      new StringSession(data.pendingSession),
      data.apiId,
      data.apiHash,
      { connectionRetries: 3 },
    );
    try {
      await client.connect();
      const Api = (await import("telegram/tl")).Api;
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: data.phone,
          phoneCodeHash: data.phoneCodeHash,
          phoneCode: data.code,
        }),
      );
      const session = (client.session as unknown as { save(): string }).save();
      await client.disconnect();
      return { ok: true, session };
    } catch (e) {
      try {
        await client.disconnect();
      } catch {}
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

// Helper to create an authenticated user client
async function createUserClient(apiId: number, apiHash: string, sessionString: string) {
  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions");
  const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 3,
  });
  await client.connect();
  return client;
}

export const scanTelegramChatServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => UserSessionInput.parse(data))
  .handler(async ({ data }): Promise<TelegramScannedFile[]> => {
    const client = await createUserClient(data.apiId, data.apiHash, data.sessionString);
    try {
      const entity = await client.getEntity(data.chatId);
      const files: TelegramScannedFile[] = [];

      for await (const message of client.iterMessages(entity, { limit: 500 })) {
        if (!message.media) continue;
        const media = message.media as unknown as Record<string, unknown>;
        let doc: Record<string, unknown> | null = null;
        let mimeType = "application/octet-stream";
        let size = 0;
        let fileName: string | undefined;

        if ("document" in media && media.document) {
          doc = media.document as Record<string, unknown>;
          mimeType = (doc.mimeType as string) ?? "application/octet-stream";
          size = Number(doc.size ?? 0);
          const attrs = (doc.attributes as Array<Record<string, unknown>>) ?? [];
          for (const attr of attrs) {
            if (attr.fileName) { fileName = attr.fileName as string; break; }
          }
        } else if ("photo" in media && media.photo) {
          mimeType = "image/jpeg";
          const photo = media.photo as Record<string, unknown>;
          const sizes = (photo.sizes as Array<Record<string, unknown>>) ?? [];
          const largest = sizes[sizes.length - 1];
          size = Number((largest as Record<string, unknown>)?.size ?? 0);
          fileName = `photo_${message.id}.jpg`;
        } else if ("video" in media && media.video) {
          doc = media.video as Record<string, unknown>;
          mimeType = (doc.mimeType as string) ?? "video/mp4";
          size = Number(doc.size ?? 0);
          const attrs = (doc.attributes as Array<Record<string, unknown>>) ?? [];
          for (const attr of attrs) {
            if (attr.fileName) { fileName = attr.fileName as string; break; }
          }
        } else {
          continue;
        }

        if (!fileName) {
          fileName = `telegram_${message.id}`;
          const extMap: Record<string, string> = {
            "application/pdf": ".pdf", "video/mp4": ".mp4",
            "video/x-matroska": ".mkv", "audio/mpeg": ".mp3",
            "image/jpeg": ".jpg", "image/png": ".png",
          };
          fileName += extMap[mimeType] ?? "";
        }

        files.push({
          telegramFileId: String(doc?.id ?? `photo_${message.id}`),
          messageId: message.id,
          name: fileName,
          mimeType,
          size,
          caption: message.message || null,
          date: message.date ?? Math.floor(Date.now() / 1000),
        });
      }

      return files;
    } finally {
      await client.disconnect();
    }
  });

export const downloadTelegramFileServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DownloadInput.parse(data))
  .handler(async ({ data }): Promise<string> => {
    const client = await createUserClient(data.apiId, data.apiHash, data.sessionString);
    try {
      const entity = await client.getEntity(data.chatId);
      const messages = await client.getMessages(entity, { ids: [data.messageId] });
      const msg = messages[0];
      if (!msg || !msg.media) throw new Error("Message not found or has no media");
      const buffer = await client.downloadMedia(msg.media);
      if (!buffer) throw new Error("Download returned empty");
      const bytes = Buffer.isBuffer(buffer)
        ? buffer
        : Buffer.from(buffer as unknown as Uint8Array);
      return bytes.toString("base64");
    } finally {
      await client.disconnect();
    }
  });
