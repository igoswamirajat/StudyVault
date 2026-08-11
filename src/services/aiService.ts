import { getDb } from "@/db/schema";
import {
  generateQuizAI,
  generateFlashcardsAI,
  generateSummaryAI,
  generateAutoNoteAI,
  suggestSortOrderAI,
  answerDoubtAI,
  studyAssistantAI,
  generateLearningJourneyAI,
} from "@/lib/ai.functions";

/** A single turn in a doubt/assistant conversation. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Translates a raw AI-provider error into something a user can act on. Provider
 * messages are dense ("limit: 0, model: gemini-2.5-pro") and routinely confuse
 * free-tier users, so we pattern-match the common failure modes and point at the
 * concrete fix (usually: change the model in Settings → AI).
 */
export function describeAiError(e: unknown): Error {
  const raw = e instanceof Error ? e.message : String(e);
  const text = raw.toLowerCase();
  const isGemini = text.includes("gemini");

  // Google has pulled gemini-2.5-pro off the free tier entirely (quota limit: 0).
  if (isGemini && text.includes("quota") && text.includes("limit: 0")) {
    return new Error(
      "Your free Gemini key has no quota for this model (Google set it to 0). " +
        "Go to Settings → AI and switch the Model to a free-tier one like " +
        "gemini-3-flash-preview or gemini-3.5-flash-lite.",
    );
  }
  // "models/gemini-2.5-flash is no longer available to new users" etc.
  if (text.includes("no longer available")) {
    if (!isGemini) {
      return new Error(
        "The configured AI model is no longer available. Check Provider, Endpoint URL, and Model in Settings → AI.",
      );
    }
    return new Error(
      "That Gemini model is no longer available to new free-tier keys. " +
        "Go to Settings → AI and switch the Model to gemini-3-flash-preview " +
        "or gemini-3.5-flash-lite.",
    );
  }
  // gemini-2.0-flash is fully shut down.
  if (text.includes("shut down") || text.includes("not found") || text.includes("not_found")) {
    if (!isGemini) {
      return new Error(
        "The configured AI model or endpoint was not found. Check the exact model ID from the provider's /v1/models catalog.",
      );
    }
    return new Error(
      "That Gemini model is no longer available. Go to Settings → AI and switch " +
        "the Model to gemini-3-flash-preview or gemini-3.5-flash-lite.",
    );
  }
  if (
    text.includes("api key not valid") ||
    text.includes("api_key_invalid") ||
    text.includes("api_key")
  ) {
    return new Error(
      "Your API key was rejected. Go to Settings → AI and double-check the key " +
        "(it should start with AIza... for Gemini or sk-... for OpenAI-compatible).",
    );
  }
  if (text.includes("permission denied") || text.includes("permission_denied")) {
    return new Error(
      "Your API key doesn't have access to this model. Either enable the model " +
        "in your provider dashboard or pick a different Model in Settings → AI.",
    );
  }
  // Rate limits — transient, worth a retry.
  if (text.includes("429") || text.includes("rate limit") || text.includes("rate_limit")) {
    return new Error(
      "The AI provider is rate-limiting you right now. Wait a few seconds and try again.",
    );
  }
  if (text.includes("no ai provider configured")) {
    return new Error(
      "No AI provider configured. Go to Settings → AI to add your endpoint and API key.",
    );
  }
  if (text.includes("invalid json response")) {
    return new Error(
      "AI provider returned an invalid response. Check Provider, Endpoint URL, and Model in Settings → AI.",
    );
  }
  // Fall back to the provider's own message rather than swallowing it — the
  // user still gets a hint, just not a curated one.
  return new Error(raw || "AI request failed");
}

async function callAi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw describeAiError(error);
  }
}

async function getAiConfig() {
  const db = getDb();
  const [endpointRow, keyRow, modelRow, providerRow] = await Promise.all([
    db.settings.get("openaiEndpoint"),
    db.settings.get("openaiApiKey"),
    db.settings.get("aiModel"),
    db.settings.get("aiProvider"),
  ]);
  const provider = (providerRow?.value as string) ?? "openai-compatible";
  let endpoint = (endpointRow?.value as string) ?? "";
  const apiKey = (keyRow?.value as string) ?? "";
  let model = (modelRow?.value as string) ?? "";

  if (provider === "gemini") {
    // Native Gemini provider ignores endpoint, but keep the shim URL as a
    // sensible default for anyone who switches provider back.
    if (!endpoint) endpoint = "https://generativelanguage.googleapis.com/v1beta/openai";
    if (!model) model = "gemini-3-flash-preview";
  } else {
    // OpenAI-compatible: default the endpoint/model so a user who only pasted
    // an API key still works without re-entering the URL every time.
    if (!endpoint) endpoint = "https://api.openai.com/v1";
    if (!model) model = "gpt-4o-mini";
  }

  return { provider, endpoint, apiKey, model };
}

/** Media payload for content-aware AI (sampled frames and/or native video). */
export interface AiMedia {
  images?: string[];
  videoDataUrl?: string;
}

export function supportsAiVision(provider: string, model: string): boolean {
  // Hard gate: only the native Gemini provider reliably accepts image parts.
  // OpenAI-compatible model names are unreliable signals — many "vision"
  // named models on proxies/OpenRouter reject image input, and the provider
  // error ("Cannot read image.png") is fatal to generation. Text-only for all
  // OpenAI-compatible endpoints, always.
  return provider === "gemini";
}

/** True when the configured provider can accept images — callers can then
 *  skip expensive frame sampling entirely. */
export async function aiCanSendMedia(): Promise<boolean> {
  const { provider } = await getAiConfig();
  return supportsAiVision(provider, "");
}

function prepareMedia(provider: string, model: string, media?: AiMedia): AiMedia {
  return media && supportsAiVision(provider, model) ? media : {};
}

/** One turn of a grounded chat (Doubt Buster / assistant). */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export function trimChatHistory(history: ChatTurn[], maxTurns = 8, maxChars = 7000): ChatTurn[] {
  const turns = history.slice(-maxTurns).map((turn) => ({
    role: turn.role,
    content: turn.content.slice(0, 1800),
  }));
  while (turns.length > 1 && JSON.stringify(turns).length > maxChars) turns.shift();
  return turns;
}

export async function aiGenerateQuiz(
  title: string,
  contentMarkdown: string,
  resourceType?: string,
  count?: number,
  media?: AiMedia,
) {
  const { provider, endpoint, apiKey, model } = await getAiConfig();
  return callAi(() =>
    generateQuizAI({
      data: {
        title,
        contentMarkdown,
        resourceType,
        count,
        provider,
        endpoint,
        apiKey,
        model,
        ...prepareMedia(provider, model, media),
      },
    }),
  );
}

export async function aiGenerateFlashcards(
  title: string,
  contentMarkdown: string,
  resourceType?: string,
  count?: number,
  media?: AiMedia,
) {
  const { provider, endpoint, apiKey, model } = await getAiConfig();
  return callAi(() =>
    generateFlashcardsAI({
      data: {
        title,
        contentMarkdown,
        resourceType,
        count,
        provider,
        endpoint,
        apiKey,
        model,
        ...prepareMedia(provider, model, media),
      },
    }),
  );
}

export async function aiGenerateSummary(title: string, content: string, media?: AiMedia) {
  const { provider, endpoint, apiKey, model } = await getAiConfig();
  try {
    return await callAi(() =>
      generateSummaryAI({
        data: {
          title,
          content,
          provider,
          endpoint,
          apiKey,
          model,
          ...prepareMedia(provider, model, media),
        },
      }),
    );
  } catch (e) {
    throw describeAiError(e);
  }
}

export async function aiGenerateAutoNote(
  title: string,
  content: string,
  resourceType?: string,
  media?: AiMedia,
) {
  const { provider, endpoint, apiKey, model } = await getAiConfig();
  try {
    return await callAi(() =>
      generateAutoNoteAI({
        data: {
          title,
          content,
          resourceType,
          provider,
          endpoint,
          apiKey,
          model,
          ...prepareMedia(provider, model, media),
        },
      }),
    );
  } catch (e) {
    throw describeAiError(e);
  }
}

export async function aiSuggestSortOrder(
  resources: Array<{ id: string; name: string; type: string; folderPath?: string }>,
) {
  const { provider, endpoint, apiKey, model } = await getAiConfig();
  return callAi(() =>
    suggestSortOrderAI({ data: { resources, provider, endpoint, apiKey, model } }),
  );
}

export async function aiAnswerDoubt(
  title: string,
  context: string,
  history: ChatTurn[],
  media?: AiMedia,
) {
  const { provider, endpoint, apiKey, model } = await getAiConfig();
  try {
    return await callAi(() =>
      answerDoubtAI({
        data: {
          title,
          context,
          history,
          provider,
          endpoint,
          apiKey,
          model,
          ...prepareMedia(provider, model, media),
        },
      }),
    );
  } catch (e) {
    throw describeAiError(e);
  }
}

/** A single action the assistant asks the client to perform. */
export interface AssistantAction {
  type:
    | "open_resource"
    | "go_to_route"
    | "next"
    | "prev"
    | "mark_complete"
    | "create_unit"
    | "move_to_unit"
    | "start_studying"
    | "generate_summary"
    | "generate_flashcards"
    | "generate_quiz"
    | "create_note_from_chat";
  resourceName?: string;
  resourceId?: string;
  route?: string;
  unitName?: string;
  parentPath?: string;
  resourceNames?: string[];
  reason?: string;
  title?: string;
  content?: string;
}

/**
 * Actions that change stored data and therefore need explicit user
 * confirmation before running. Navigation and AI-generation actions are
 * reversible/safe and run immediately.
 */
const MUTATING_ACTION_TYPES = new Set<AssistantAction["type"]>([
  "mark_complete",
  "create_unit",
  "move_to_unit",
]);

export function isMutatingAction(action: AssistantAction): boolean {
  return MUTATING_ACTION_TYPES.has(action.type);
}

export async function aiStudyAssistant(
  history: ChatTurn[],
  sessionContext: string,
): Promise<{ reply: string; actions: AssistantAction[] }> {
  const { provider, endpoint, apiKey, model } = await getAiConfig();
  try {
    return await callAi(() =>
      studyAssistantAI({
        data: { history, sessionContext, provider, endpoint, apiKey, model },
      }),
    );
  } catch (e) {
    throw describeAiError(e);
  }
}

export async function isAiConfigured(): Promise<boolean> {
  const { endpoint, apiKey } = await getAiConfig();
  return Boolean(endpoint && apiKey);
}

export interface JourneyPhaseResource {
  id: string;
  title: string;
  status: "locked" | "available" | "in-progress" | "completed";
  reason?: string;
}

export interface JourneyPhase {
  id: string;
  title: string;
  description: string;
  order: number;
  resources: JourneyPhaseResource[];
}

export interface LearningJourney {
  phases: JourneyPhase[];
  startingPoint?: string;
  reasoning: string;
}

export async function aiGenerateLearningJourney(): Promise<LearningJourney> {
  const db = getDb();
  const { provider, endpoint, apiKey, model } = await getAiConfig();

  const resources = await db.resources.toArray();
  const notes = await db.notes.toArray();
  const folders = await db.folders.toArray();
  const progressEntries = await db.progress.toArray();
  const progress: Record<string, string> = {};
  for (const p of progressEntries) {
    progress[p.resourceId] = p.status;
  }

  try {
    return await callAi(() =>
      generateLearningJourneyAI({
        data: {
          resources: resources.map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            folderPath: r.folderPath,
          })),
          notes: notes.map((n) => ({
            id: n.id,
            title: n.title,
            isSummary: n.isSummary,
            resourceId: n.resourceId,
          })),
          folders: folders.map((f) => ({
            path: f.path,
            name: f.name,
          })),
          progress,
          provider,
          endpoint,
          apiKey,
          model,
        },
      }),
    );
  } catch (e) {
    throw describeAiError(e);
  }
}
