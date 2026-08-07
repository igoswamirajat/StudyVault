import { createServerFn } from "@tanstack/react-start";
import { generateObject, generateText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  createGeminiProvider,
  createLovableAiGatewayProvider,
  createUserAiProvider,
} from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-3-flash-preview";

interface ProviderErrorDetails {
  message: string;
  statusCode?: number;
  responseBody?: string;
  url?: string;
}

function providerErrorDetails(error: unknown): ProviderErrorDetails {
  const value = error as {
    message?: unknown;
    statusCode?: unknown;
    responseBody?: unknown;
    url?: unknown;
    cause?: { message?: unknown };
    lastError?: {
      message?: unknown;
      statusCode?: unknown;
      responseBody?: unknown;
      url?: unknown;
    };
  };
  const nested = value.lastError;
  return {
    message:
      typeof value.message === "string"
        ? value.message === "Retry failed" && typeof nested?.message === "string"
          ? nested.message
          : value.message
        : value.cause && typeof value.cause.message === "string"
          ? value.cause.message
          : String(error),
    statusCode:
      typeof value.statusCode === "number"
        ? value.statusCode
        : typeof nested?.statusCode === "number"
          ? nested.statusCode
          : undefined,
    responseBody:
      typeof value.responseBody === "string"
        ? value.responseBody
        : typeof nested?.responseBody === "string"
          ? nested.responseBody
          : undefined,
    url:
      typeof value.url === "string"
        ? value.url
        : typeof nested?.url === "string"
          ? nested.url
          : undefined,
  };
}

function safeHost(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function normalizeAiError(operation: string, error: unknown): Error {
  const details = providerErrorDetails(error);
  const body = details.responseBody?.trim() ?? "";
  const lower = `${details.message} ${body}`.toLowerCase();
  const status = details.statusCode;
  const host = safeHost(details.url);
  let message = details.message || "AI provider request failed.";

  if (lower.includes("invalid json response")) {
    if (status === 401 || status === 403) {
      message =
        "AI provider rejected request. Check API key, provider, and model in Settings → AI.";
    } else if (status === 404) {
      message =
        "AI endpoint or model was not found. Check Endpoint URL and Model in Settings → AI.";
    } else if (body.startsWith("<")) {
      message =
        "AI endpoint returned HTML instead of JSON. Check Endpoint URL and provider mode in Settings → AI.";
    } else {
      message =
        "AI provider returned an invalid response. Check Endpoint URL, provider mode, and model in Settings → AI.";
    }
  } else if (status === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    message =
      "AI provider rate limit or quota reached. Wait briefly or switch model/provider in Settings → AI.";
  } else if (
    status === 401 ||
    status === 403 ||
    lower.includes("api key not valid") ||
    lower.includes("api_key_invalid")
  ) {
    message = "AI API key was rejected. Check your key and model access in Settings → AI.";
  } else if (status === 404 || lower.includes("model not found") || lower.includes("not_found")) {
    message = "AI model or endpoint was not found. Check Endpoint URL and Model in Settings → AI.";
  }

  const requestId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  console.error(`[AI:${requestId}] ${operation}`, {
    status,
    host,
    providerMessage: details.message,
    responseBodyPreview: body.slice(0, 300),
  });
  const responseHint = [status ? `HTTP ${status}` : "", host ? `from ${host}` : ""]
    .filter(Boolean)
    .join(" ");
  return new Error(`${message}${responseHint ? ` (${responseHint})` : ""} [request ${requestId}]`);
}

async function executeAi<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const details = providerErrorDetails(error);
      const retryable =
        details.statusCode === 429 ||
        (details.statusCode != null && details.statusCode >= 500) ||
        /timeout|timed out|fetch failed|network/i.test(details.message);
      if (attempt === 0 && retryable) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      throw normalizeAiError(operation, error);
    }
  }
  throw new Error("AI request failed");
}

function getProvider(provider?: string, endpoint?: string, apiKey?: string, model?: string) {
  // Native Gemini: unlocks image + video understanding (not the OpenAI shim).
  if (provider === "gemini" && apiKey) {
    return createGeminiProvider(apiKey)(model || "gemini-3-flash-preview");
  }
  if (endpoint && apiKey) {
    let parsedEndpoint: URL;
    try {
      parsedEndpoint = new URL(endpoint);
    } catch {
      throw new Error("Invalid AI Endpoint URL. Use a full https:// URL in Settings → AI.");
    }
    if (!/^https?:$/.test(parsedEndpoint.protocol)) {
      throw new Error("Invalid AI Endpoint URL. Use a full https:// URL in Settings → AI.");
    }
    const p = createUserAiProvider(endpoint, apiKey);
    return p(model || "gpt-4o-mini");
  }
  const key = process.env.LOVABLE_API_KEY;
  if (!key)
    throw new Error(
      "No AI provider configured. Go to Settings → AI to add your endpoint and API key.",
    );
  return createLovableAiGatewayProvider(key)(FALLBACK_MODEL);
}

/**
 * Builds a user message that optionally carries sampled video frames (data
 * URLs) and/or a native video file so vision-capable models can actually see
 * the content. Falls back to a plain text prompt when no media is present.
 */
function buildUserMessage(text: string, images?: string[], videoDataUrl?: string): ModelMessage[] {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: string }
    | { type: "file"; data: string; mediaType: string }
  > = [{ type: "text", text }];

  for (const img of images ?? []) {
    // Only accept inlined base64 data URLs. A remote URL would make the model
    // provider fetch it server-side — which 403s for private Drive thumbnails.
    if (img && img.startsWith("data:")) parts.push({ type: "image", image: img });
  }
  if (videoDataUrl && videoDataUrl.startsWith("data:")) {
    const match = /^data:([^;]+);/.exec(videoDataUrl);
    parts.push({ type: "file", data: videoDataUrl, mediaType: match?.[1] || "video/mp4" });
  }

  return [{ role: "user", content: parts }];
}

function supportsVisualInput(provider?: string, model?: string): boolean {
  if (provider === "gemini") return true;
  const name = (model ?? "").toLowerCase();
  return /gpt-4o|gpt-4\.1|vision|[-_]vl\b|llava|claude-3|claude-4|gemini/.test(name);
}

function allowedMedia(
  provider: string | undefined,
  model: string | undefined,
  images?: string[],
  videoDataUrl?: string,
) {
  return supportsVisualInput(provider, model) ? { images, videoDataUrl } : {};
}

const QuizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string(),
      }),
    )
    .min(3)
    .max(8),
});

const FlashcardSchema = z.object({
  cards: z
    .array(
      z.object({
        front: z.string(),
        back: z.string(),
        hint: z.string().optional(),
      }),
    )
    .min(3)
    .max(15),
});

const AiInput = z.object({
  title: z.string(),
  contentMarkdown: z.string(),
  resourceType: z.string().optional(),
  count: z.number().int().min(3).max(15).optional(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

export const generateQuizAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AiInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("quiz", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.contentMarkdown.slice(0, 8000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nContext, notes & summary:\n"""\n${trimmed}\n"""\n${hasMedia ? "\nVisual media is attached — use only what can actually be seen.\n" : ""}\nGenerate ${data.count ?? 5} questions that test the most important concepts.`;
      const { object } = await generateObject({
        model,
        maxOutputTokens: 1200,
        schema: QuizSchema,
        system:
          "You generate concise multiple-choice study quizzes. Always 4 options, exactly one correct. Base questions only on provided notes/summary and visible media. If source context is insufficient, keep questions limited to known facts.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return object;
    }),
  );

export const generateFlashcardsAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AiInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("flashcards", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.contentMarkdown.slice(0, 8000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nSource context, notes & highlights:\n"""\n${trimmed}\n"""\n${hasMedia ? "\nVisual media is attached — incorporate only concepts you can see.\n" : ""}\nGenerate ${data.count ?? 8} flashcards. Front = clear prompt or cloze-style question. Back = concise answer (1-2 sentences).`;
      const { object } = await generateObject({
        model,
        maxOutputTokens: 1200,
        schema: FlashcardSchema,
        system:
          "You create high-quality study flashcards using the minimum-information principle: each card asks one atomic question. Use the user's notes/highlights and visible media as the source of truth.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return object;
    }),
  );

const SummaryInput = z.object({
  title: z.string(),
  content: z.string(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

export const generateSummaryAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SummaryInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("summary", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.content.slice(0, 12000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Summarize the following study material for "${data.title}".${hasMedia ? " Visual media is attached — describe only what is actually shown, not just the title." : ""}\n\nContext:\n${trimmed}`;
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 900,
        system:
          "You create concise, well-structured study summaries in markdown. Use headings, bullet points, and bold for key terms. Focus on the most important concepts. If source context is insufficient, say that clearly instead of inventing details. Ground any visual claims only in visible media.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return { summary: out };
    }),
  );

const AutoNoteInput = z.object({
  title: z.string(),
  content: z.string(),
  resourceType: z.string().optional(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

export const generateAutoNoteAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AutoNoteInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("auto-note", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.content.slice(0, 12000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Create study notes for "${data.title}" (${data.resourceType ?? "unknown"} resource).${hasMedia ? " Visual media is attached — base notes only on what is actually shown." : ""}\n\nContext:\n${trimmed}`;
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 1200,
        system:
          "You create detailed study notes from provided content. Structure with clear headings, key takeaways, definitions, and important details. Use markdown formatting. Be thorough but avoid verbatim copying. If content is missing, state what is missing. Describe visual media only when it is actually visible.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return { notes: out };
    }),
  );

/* ------------------------------------------------------- Doubt Buster --- */

const ChatTurn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const DoubtInput = z.object({
  title: z.string(),
  context: z.string(),
  history: z.array(ChatTurn).min(1),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  images: z.array(z.string()).optional(),
  videoDataUrl: z.string().optional(),
});

/**
 * Answers a learner's question about ONE specific resource, grounded in the
 * assembled context plus any sampled video frames / native video. Prior turns
 * are replayed so follow-ups keep continuity.
 */
export const answerDoubtAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => DoubtInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("doubt", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const messages: ModelMessage[] = [];
      const history = data.history
        .slice(-8)
        .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 1800) }));
      const currentIndex = [...history].reverse().findIndex((turn) => turn.role === "user");
      const currentUserIndex =
        currentIndex === -1 ? history.length - 1 : history.length - 1 - currentIndex;
      const currentQuestion = history[currentUserIndex]?.content ?? "";

      // Replay compact prior turns, then attach grounding/media to current question.
      for (const [index, turn] of history.entries()) {
        if (index !== currentUserIndex) messages.push({ role: turn.role, content: turn.content });
      }
      const groundText = `You are tutoring me on this study material.\n\nContext:\n"""\n${data.context.slice(0, 7000)}\n"""\n${hasMedia ? "\nVisual media is attached — use only what you can see.\n" : ""}\nCurrent question: ${currentQuestion}`;
      messages.push(...buildUserMessage(groundText, media.images, media.videoDataUrl));

      const { text } = await generateText({
        model,
        maxOutputTokens: 500,
        system: `You are a focused, encouraging tutor for the study resource "${data.title}". Answer strictly from provided context and visible media. If the answer isn't in the material, say so honestly. Never infer unseen YouTube, Drive, Telegram, or local video content. Be concise and use markdown.`,
        messages,
      });
      return { answer: text };
    }),
  );

const SortInput = z.object({
  resources: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      folderPath: z.string().optional(),
    }),
  ),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const suggestSortOrderAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SortInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("sort-order", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const resourceList = data.resources
        .map(
          (r) => `${r.id}: ${r.name} (${r.type}${r.folderPath ? `, folder: ${r.folderPath}` : ""})`,
        )
        .join("\n");
      const { object } = await generateObject({
        model,
        maxOutputTokens: 450,
        schema: z.object({
          orderedIds: z.array(z.string()),
          reasoning: z.string(),
        }),
        system:
          "You suggest optimal study order for resources based on their names, types, and folder structure. Consider logical progression (basics before advanced), topic grouping, and content dependencies.",
        prompt: `Suggest the best study order for these resources:\n\n${resourceList}\n\nReturn the IDs in suggested study order.`,
      });
      return object;
    }),
  );

/* --------------------------------------------------- Study Assistant --- */

/**
 * The assistant can't touch IndexedDB or the router from the server, so it
 * returns a plan: a natural-language `reply` plus a list of typed `actions`
 * the client executes. Mutating actions are confirmed client-side before they
 * run; navigation/generation actions run immediately.
 */
const AssistantAction = z.object({
  type: z.enum([
    "open_resource",
    "go_to_route",
    "next",
    "prev",
    "mark_complete",
    "create_unit",
    "move_to_unit",
    "start_studying",
    "generate_summary",
    "generate_flashcards",
    "generate_quiz",
  ]),
  // Free-form args; only the fields relevant to each type are read client-side.
  resourceName: z.string().optional(),
  resourceId: z.string().optional(),
  route: z.string().optional(),
  unitName: z.string().optional(),
  parentPath: z.string().optional(),
  resourceNames: z.array(z.string()).optional(),
  reason: z.string().optional(),
});

const AssistantSchema = z.object({
  reply: z.string(),
  actions: z.array(AssistantAction).max(6),
});

const AssistantInput = z.object({
  history: z.array(ChatTurn).min(1),
  // A compact snapshot of the current session so the model can resolve
  // "this video", "next one", sibling names, and available routes.
  sessionContext: z.string(),
  provider: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const studyAssistantAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AssistantInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("assistant", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const messages: ModelMessage[] = data.history.slice(-8).map((t) => ({
        role: t.role,
        content: t.content.slice(0, 1800),
      }));
      const { object } = await generateObject({
        model,
        maxOutputTokens: 700,
        schema: AssistantSchema,
        system:
          `You are the in-session study assistant for a personal study app. You can chat AND drive the app via actions.\n\n` +
          `Available actions and when to use them:\n` +
          `- open_resource {resourceName}: open a specific resource in the study room.\n` +
          `- go_to_route {route}: navigate to one of /library /organizer /progress /flashcards /notes /settings.\n` +
          `- next / prev: move to the next/previous item in the current playlist.\n` +
          `- mark_complete {resourceId?}: mark the current (or named) resource complete.\n` +
          `- create_unit {unitName, parentPath?}: create a new folder/"week" (e.g. unitName "Week 2").\n` +
          `- move_to_unit {resourceNames, unitName}: move resources into a folder.\n` +
          `- start_studying {unitName}: open a folder as a playlist and start studying it.\n` +
          `- generate_summary / generate_flashcards / generate_quiz: run AI on the current resource.\n\n` +
          `Rules: Only emit actions the user actually asked for. Prefer resolving names from the provided session context. ` +
          `Keep 'reply' short and friendly; it is shown in the chat. If the user only asks a question, return an empty actions array. ` +
          `Do not invent resource names that aren't in the context.\n\n` +
          `Current session context:\n"""\n${data.sessionContext.slice(0, 8000)}\n"""`,
        messages,
      });
      return object;
    }),
  );
