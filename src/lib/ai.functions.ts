import { createServerFn } from "@tanstack/react-start";
import { generateObject, generateText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  createGeminiProvider,
  createLovableAiGatewayProvider,
  createUserAiProvider,
} from "./ai-gateway.server";
import {
  QuizSchema,
  FlashcardSchema,
  AiInput,
  SummaryInput,
  JourneyInput,
  JourneyOutput,
  AutoNoteInput,
  DoubtInput,
  AssistantSchema,
  AssistantInput,
  WebExtractionInput,
  FeynmanInput,
  PlannerInput,
  PlannerSchema,
  SortInput,
} from "./ai-schemas";

const FALLBACK_MODEL = "google/gemini-1.5-flash";

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
  } else if (
    lower.includes("cannot read") ||
    lower.includes("does not support image") ||
    lower.includes("does not support vision") ||
    lower.includes("unsupported image") ||
    lower.includes("multimodal")
  ) {
    message =
      "Your AI model rejected the attached image. Switch to a native Gemini provider in Settings → AI for image and video understanding.";
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
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const details = providerErrorDetails(error);
      const retryable =
        details.statusCode === 429 ||
        (details.statusCode != null && details.statusCode >= 500) ||
        /timeout|timed out|fetch failed|network/i.test(details.message);
      const noVisionSupport =
        /cannot read|does not support (image|vision|multimodal|visual)/i.test(details.message) ||
        /model.*(does not support|unsupported).*image/i.test(details.message);
      if (attempt === 0 && (retryable || noVisionSupport)) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      if (attempt === 1 && noVisionSupport) {
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
  // Hard gate: only the native Gemini provider reliably accepts image parts.
  // Model-name heuristics false-positive on proxies/OpenRouter ("vision"
  // named models that still reject images) — the resulting provider error
  // kills generation. OpenAI-compatible endpoints stay text-only.
  return provider === "gemini";
}

function allowedMedia(
  provider: string | undefined,
  model: string | undefined,
  images?: string[],
  videoDataUrl?: string,
) {
  const hasImages = Boolean(images?.length);
  const hasVideo = Boolean(videoDataUrl);
  if (!hasImages && !hasVideo) return {};
  if (!supportsVisualInput(provider, model)) {
    console.warn(`[AI] Provider/model ${provider}/${model} does not support vision, stripping media`);
    return {};
  }
  return { images, videoDataUrl };
}


function cleanJsonResponse(rawText: string): any {
  let clean = rawText
    .replace(/^```(json)?\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

  // Strip trailing commas before closing braces/brackets
  clean = clean.replace(/,\s*([}\]])/g, "$1");

  const firstBrace = clean.indexOf("{");
  const firstBracket = clean.indexOf("[");

  let jsonStr = clean;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    const lastBrace = clean.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      jsonStr = clean.slice(firstBrace, lastBrace + 1);
    }
  } else if (firstBracket !== -1) {
    const lastBracket = clean.lastIndexOf("]");
    if (lastBracket > firstBracket) {
      jsonStr = clean.slice(firstBracket, lastBracket + 1);
    }
  }

  return JSON.parse(jsonStr);
}

function parseAndSanitizeQuiz(rawText: string): { questions: Array<{ question: string; options: string[]; correctIndex: number; explanation: string }> } {
  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawText);
  } catch (e) {
    console.error("[Quiz JSON Parse Error]:", e, "Raw text:", rawText);
    throw new Error(`AI generated a response that could not be parsed as valid JSON. Please try again.`);
  }

  const rawQuestions = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.questions)
      ? parsed.questions
      : Array.isArray(parsed?.quiz)
        ? parsed.quiz
        : [];

  if (rawQuestions.length === 0) {
    throw new Error("AI response did not contain any valid quiz questions. Please try again.");
  }

  const questions = rawQuestions.map((q: any, idx: number) => {
    const question = String(q.question || q.q || q.title || `Question ${idx + 1}`).trim();
    let options: string[] = Array.isArray(q.options)
      ? q.options.map(String)
      : Array.isArray(q.choices)
        ? q.choices.map(String)
        : ["Option A", "Option B", "Option C", "Option D"];

    while (options.length < 4) {
      options.push(`Option ${String.fromCharCode(65 + options.length)}`);
    }
    if (options.length > 4) {
      options = options.slice(0, 4);
    }

    let correctIndex =
      typeof q.correctIndex === "number"
        ? q.correctIndex
        : typeof q.correct_index === "number"
          ? q.correct_index
          : parseInt(String(q.correctIndex ?? q.correct_index ?? q.answer ?? 0), 10);

    if (isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      correctIndex = 0;
    }

    const explanation = String(q.explanation || q.reason || q.rationale || "").trim();

    return {
      question,
      options,
      correctIndex,
      explanation,
    };
  });

  return { questions };
}

function parseAndSanitizeFlashcards(rawText: string): { cards: Array<{ front: string; back: string; hint?: string }> } {
  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawText);
  } catch (e) {
    console.error("[Flashcards JSON Parse Error]:", e, "Raw text:", rawText);
    throw new Error(`AI generated a response that could not be parsed as valid JSON. Please try again.`);
  }

  const rawCards = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.cards)
      ? parsed.cards
      : Array.isArray(parsed?.flashcards)
        ? parsed.flashcards
        : [];

  if (rawCards.length === 0) {
    throw new Error("AI response did not contain any valid flashcards. Please try again.");
  }

  const cards = rawCards
    .map((c: any, idx: number) => {
      const front = String(c.front || c.question || c.prompt || `Flashcard ${idx + 1}`).trim();
      const back = String(c.back || c.answer || c.response || "").trim();
      const hint = c.hint ? String(c.hint).trim() : undefined;
      return { front, back, hint };
    })
    .filter((c: any) => c.front.length > 0 && c.back.length > 0);

  return { cards };
}

export const generateQuizAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => AiInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("quiz", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.contentMarkdown.slice(0, 120000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nContext, notes & summary:\n"""\n${trimmed}\n"""\n${hasMedia ? "\nVisual media is attached — use only what can actually be seen.\n" : ""}\nGenerate ${data.count ?? 5} multiple choice quiz questions based on the provided notes and material.

Return ONLY a raw JSON object with this exact shape:
{
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctIndex": 0,
      "explanation": "Brief explanation."
    }
  ]
}`;
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 16000,
        system:
          "You generate concise multiple-choice study quizzes. Always provide 4 options and exactly one zero-indexed integer correctIndex (0, 1, 2, or 3). Base questions on ALL provided notes, summary, transcript, and visible media. Return ONLY a raw JSON object. Do NOT wrap the output in markdown code blocks.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return parseAndSanitizeQuiz(out);
    }),
  );

export const generateFlashcardsAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => AiInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("flashcards", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.contentMarkdown.slice(0, 120000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nSource context, notes & highlights:\n"""\n${trimmed}\n"""\n${hasMedia ? "\nVisual media is attached — incorporate only concepts you can see.\n" : ""}\nGenerate ${data.count ?? 8} flashcards.

Return ONLY a raw JSON object with this exact shape:
{
  "cards": [
    {
      "front": "Question or prompt",
      "back": "Concise answer",
      "hint": "Optional hint"
    }
  ]
}`;
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 16000,
        system:
          "You create high-quality study flashcards using the minimum-information principle. Use ALL provided notes, highlights, transcript, and visible media. Return ONLY a raw JSON object. Do NOT wrap the output in markdown code blocks.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return parseAndSanitizeFlashcards(out);
    }),
  );


export const generateSummaryAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => SummaryInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("summary", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.content.slice(0, 120000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Summarize the following study material for "${data.title}".${hasMedia ? " Visual media is attached — describe only what is actually shown, not just the title." : ""}\n\nContext:\n${trimmed}`;
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 8000,
        system:
          "You create concise, well-structured study summaries in markdown. Use headings, bullet points, and bold for key terms. Focus on the most important concepts. If source context is insufficient, say that clearly instead of inventing details. Ground any visual claims only in visible media.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return { summary: out };
    }),
  );

/* ------------------------------------------------- Learning Journey --- */


function parseAndSanitizeLearningJourney(rawText: string): { phases: any[]; startingPoint?: string; reasoning: string } {
  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawText);
  } catch (e) {
    console.error("[Journey JSON Parse Error]:", e, "Raw text:", rawText);
    return { phases: [], reasoning: "Failed to parse AI curriculum response." };
  }
  const phases = Array.isArray(parsed?.phases) ? parsed.phases : Array.isArray(parsed) ? parsed : [];
  const reasoning = String(parsed?.reasoning || "Generated curriculum based on prerequisites and upload order.").trim();
  const startingPoint = parsed?.startingPoint ? String(parsed.startingPoint) : undefined;
  return { phases, startingPoint, reasoning };
}

function parseAndSanitizeSortOrder(rawText: string): { orderedIds: string[]; reasoning: string } {
  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawText);
  } catch (e) {
    console.error("[Sort JSON Parse Error]:", e, "Raw text:", rawText);
    return { orderedIds: [], reasoning: "Failed to parse AI sort order response." };
  }
  const orderedIds = Array.isArray(parsed?.orderedIds) ? parsed.orderedIds.map(String) : Array.isArray(parsed) ? parsed.map(String) : [];
  const reasoning = String(parsed?.reasoning || "Sorted based on prerequisites and folder structure.").trim();
  return { orderedIds, reasoning };
}

function parseAndSanitizeAssistant(rawText: string): { reply: string; actions: any[] } {
  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawText);
  } catch (e) {
    return { reply: rawText.trim(), actions: [] };
  }
  const reply = String(parsed?.reply || parsed?.response || rawText).trim();
  const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
  return { reply, actions };
}

function parseAndSanitizeFeynman(rawText: string): { score: number; feedback: string } {
  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawText);
  } catch (e) {
    return { score: 5, feedback: rawText.trim() };
  }
  const score = Math.max(0, Math.min(10, Number(parsed?.score) || 5));
  const feedback = String(parsed?.feedback || "Evaluation completed.").trim();
  return { score, feedback };
}

function parseAndSanitizePlanner(rawText: string): { days: any[] } {
  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawText);
  } catch (e) {
    console.error("[Planner JSON Parse Error]:", e, "Raw text:", rawText);
    return { days: [] };
  }
  const days = Array.isArray(parsed?.days) ? parsed.days : Array.isArray(parsed) ? parsed : [];
  return { days };
}

export const generateLearningJourneyAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => JourneyInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("learning-journey", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const progress = data.progress ?? {};

      const resourcesList = data.resources
        .map((r) => {
          const dateStr = r.addedAt ? new Date(r.addedAt).toLocaleDateString() : "unknown";
          return `${r.id}: ${r.name} (${r.type}${r.folderPath ? `, folder: ${r.folderPath}` : ""}, uploaded: ${dateStr})${progress[r.id] ? `, progress: ${progress[r.id]}` : ""}`;
        })
        .join("\n");

      const notesList = data.notes
        .map(
          (n) =>
            `${n.id}: ${n.title} (${n.isSummary ? "summary" : "note"}${n.resourceId ? ` → ${n.resourceId}` : ""})`,
        )
        .join("\n");

      const foldersList = data.folders
        .map((f) => `${f.path}: ${f.name}`)
        .join("\n");

      const prompt = `
You are designing a personalized learning curriculum for a student. Given their resources, notes, and current progress, create a structured learning journey with clear phases.

Resources:
${resourcesList || "(none)"}

Notes & Summaries:
${notesList || "(none)"}

Folders:
${foldersList || "(none)"}

Current Progress:
${Object.entries(progress)
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n") || "(no progress recorded)"}

Create a learning journey with 3-6 phases.
Return ONLY a raw JSON object with this exact shape:
{
  "phases": [
    {
      "title": "Phase 1: Foundations",
      "description": "Description of phase",
      "resources": [
        { "id": "resource_id_here", "title": "Resource Name", "status": "available", "reason": "Reason for inclusion" }
      ]
    }
  ],
  "startingPoint": "Where to start",
  "reasoning": "Reasoning for journey design"
}
`;

      const { text: out } = await generateText({
        model,
        maxOutputTokens: 16000,
        temperature: 0.2,
        system:
          "You design personalized learning curriculums. Return ONLY a valid JSON object matching the requested schema. Do NOT wrap it in markdown code blocks.",
        prompt,
      });
      return parseAndSanitizeLearningJourney(out);
    }),
  );


export const generateAutoNoteAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => AutoNoteInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("auto-note", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmed = data.content.slice(0, 120000);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const text = `Create study notes for "${data.title}" (${data.resourceType ?? "unknown"} resource).${hasMedia ? " Visual media is attached — base notes only on what is actually shown." : ""}\n\nContext:\n${trimmed}`;
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 8000,
        system:
          "You create detailed study notes from provided content. Structure with clear headings, key takeaways, definitions, and important details. Use markdown formatting. Be thorough but avoid verbatim copying. If content is missing, state what is missing. Describe visual media only when it is actually visible.",
        messages: buildUserMessage(text, media.images, media.videoDataUrl),
      });
      return { notes: out };
    }),
  );

/* ------------------------------------------------------- Doubt Buster --- */


/**
 * Answers a learner's question about ONE specific resource, grounded in the
 * assembled context plus any sampled video frames / native video. Prior turns
 * are replayed so follow-ups keep continuity.
 */
export const answerDoubtAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => DoubtInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("doubt", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const media = allowedMedia(data.provider, data.model, data.images, data.videoDataUrl);
      const hasMedia = Boolean(media.images?.length || media.videoDataUrl);
      const messages: ModelMessage[] = [];
      const history = data.history
        .slice(-8)
        .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 20000) }));
      const currentIndex = [...history].reverse().findIndex((turn) => turn.role === "user");
      const currentUserIndex =
        currentIndex === -1 ? history.length - 1 : history.length - 1 - currentIndex;
      const currentQuestion = history[currentUserIndex]?.content ?? "";

      // Replay compact prior turns, then attach grounding/media to current question.
      for (const [index, turn] of history.entries()) {
        if (index !== currentUserIndex) messages.push({ role: turn.role, content: turn.content });
      }
      const groundText = `You are tutoring me on this study material.\n\nContext:\n"""\n${data.context.slice(0, 120000)}\n"""\n${hasMedia ? "\nVisual media is attached — use only what you can see.\n" : ""}\nCurrent question: ${currentQuestion}`;
      messages.push(...buildUserMessage(groundText, media.images, media.videoDataUrl));

      const { text } = await generateText({
        model,
        maxOutputTokens: 8000,
        system: `You are a focused, encouraging tutor for the study resource "${data.title}". Answer strictly from provided context and visible media. If the answer isn't in the material, say so honestly. Never infer unseen YouTube, Drive, Telegram, or local video content. Be concise and use markdown.`,
        messages,
      });
      return { answer: text };
    }),
  );


export const suggestSortOrderAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => SortInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("sort-order", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const resourceList = data.resources
        .map(
          (r: any) => `${r.id}: ${r.name} (${r.type}${r.folderPath ? `, folder: ${r.folderPath}` : ""})`,
        )
        .join("\n");
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 16000,
        system:
          "You suggest optimal study order for resources based on their names, types, and folder structure. Return ONLY a raw JSON object with 'orderedIds' (array of string IDs) and 'reasoning' (string). Do NOT wrap in markdown code blocks.",
        prompt: `Suggest the best study order for these resources:\n\n${resourceList}\n\nReturn ONLY a JSON object with 'orderedIds' and 'reasoning'.`,
      });
      return parseAndSanitizeSortOrder(out);
    }),
  );

/* --------------------------------------------------- Study Assistant --- */

/**
 * The assistant can't touch IndexedDB or the router from the server, so it
 * returns a plan: a natural-language `reply` plus a list of typed `actions`
 * the client executes. Mutating actions are confirmed client-side before they
 * run; navigation/generation actions run immediately.
 */

export const studyAssistantAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => AssistantInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("assistant", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const messages: ModelMessage[] = data.history.slice(-8).map((t) => ({
        role: t.role,
        content: t.content.slice(0, 20000),
      }));
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 16000,
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
          `- generate_summary / generate_flashcards / generate_quiz: run AI on the current resource.\n` +
          `- create_note_from_chat {title, content}: save the assistant's last reply as a new note.\n\n` +
          `Rules: Only emit actions the user actually asked for. Prefer resolving names from the provided session context. ` +
          `Keep 'reply' short and friendly; it is shown in the chat. If the user only asks a question, return an empty actions array. ` +
          `Do not invent resource names that aren't in the context.\n\n` +
          `Return ONLY a raw JSON object with 'reply' (string) and 'actions' (array). Do NOT wrap in markdown code blocks.\n\n` +
          `Current session context:\n"""\n${data.sessionContext.slice(0, 120000)}\n"""`,
        messages,
      });
      return parseAndSanitizeAssistant(out);
    }),
  );

export const extractWebArticleAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => WebExtractionInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("web-extraction", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      
      let htmlContent = "";
      try {
        const response = await fetch(data.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
          }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        htmlContent = await response.text();
      } catch (err) {
        throw new Error(`Failed to fetch web page: ${err instanceof Error ? err.message : String(err)}`);
      }

      const text = `I have fetched the HTML content of the following URL: ${data.url}\n\nRaw HTML Snippet (truncated):\n"""\n${htmlContent.slice(0, 200000)}\n"""\n\nPlease extract the main article content (ignoring navbars, sidebars, footers, and ads) and format it as clean, rich Markdown. Preserve images (as markdown image links), headers, lists, and links. Do not wrap in \`\`\`markdown tags. Return ONLY the Markdown text.`;
      
      const { text: mdText } = await generateText({
        model,
        maxOutputTokens: 16000,
        system: "You are an expert web scraper and data structurer. You output ONLY clean, rich Markdown representing the core article. No yapping or markdown code blocks.",
        messages: buildUserMessage(text),
      });
      
      try {
        const cleanedMd = mdText.replace(/^```(markdown)?\s*/i, "").replace(/\s*```$/, "").trim();
        return { markdown: cleanedMd };
      } catch (e) {
        throw new Error("AI failed to extract the article.");
      }
    }),
  );

export const evaluateFeynmanAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => FeynmanInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("feynman", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const trimmedContext = data.context.slice(0, 120000);
      const text = `Resource: ${data.title}\n\nOriginal Material Context:\n"""\n${trimmedContext}\n"""\n\nStudent's Spoken Explanation (Feynman Technique):\n"""\n${data.transcript}\n"""\n\nEvaluate the student's explanation. You are a strict but fair examiner. Grade them out of 10 based on accuracy, completeness, and clarity. Identify exact gaps or misconceptions in their understanding. Return a raw JSON object with 'score' (number) and 'feedback' (string). Do not wrap in markdown tags like \`\`\`json.`;
      
      const { text: jsonText } = await generateText({
        model,
        maxOutputTokens: 8000,
        system: "You evaluate student explanations using the Feynman technique. Be strict and honest. Return ONLY a valid JSON object with 'score' and 'feedback'.",
        prompt: text,
      });
      
      return parseAndSanitizeFeynman(jsonText);
    }),
  );

export const generatePlannerAI = createServerFn({ method: "POST" })
  .validator((data: unknown) => PlannerInput.parse(data))
  .handler(async ({ data }) =>
    executeAi("planner", async () => {
      const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
      const text = `Resources to schedule:\n${JSON.stringify(data.resources, null, 2)}\n\nUser Constraints:\n${data.prompt}\n\nReturn ONLY a raw JSON object with a 'days' array. Each day must contain 'dayNumber' (number), 'title' (string), and 'resourceIds' (array of string IDs only).`;
      
      const { text: out } = await generateText({
        model,
        maxOutputTokens: 16000,
        temperature: 0.2,
        system: "You are an expert study planner. Distribute the provided resources into sequential days based on the user's constraints. Return ONLY a single raw JSON object with a 'days' array.",
        messages: buildUserMessage(text),
      });
      return parseAndSanitizePlanner(out);
    }),
  );
