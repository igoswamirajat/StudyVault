import { createServerFn } from "@tanstack/react-start";
import { generateObject, generateText, type ModelMessage } from "ai";
import { z } from "zod";
import {
  createGeminiProvider,
  createLovableAiGatewayProvider,
  createUserAiProvider,
} from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-3-flash-preview";

function getProvider(provider?: string, endpoint?: string, apiKey?: string, model?: string) {
  // Native Gemini: unlocks image + video understanding (not the OpenAI shim).
  if (provider === "gemini" && apiKey) {
    return createGeminiProvider(apiKey)(model || "gemini-3-flash-preview");
  }
  if (endpoint && apiKey) {
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
  .handler(async ({ data }) => {
    const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
    const trimmed = data.contentMarkdown.slice(0, 8000);
    const hasMedia = Boolean(data.images?.length || data.videoDataUrl);
    const text = `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nContext, notes & summary:\n"""\n${trimmed}\n"""\n${hasMedia ? "\nVideo frames/footage are attached — use what you can see in them.\n" : ""}\nGenerate ${data.count ?? 5} questions that test the most important concepts.`;
    const { object } = await generateObject({
      model,
      schema: QuizSchema,
      system:
        "You generate concise multiple-choice study quizzes. Always 4 options, exactly one correct. Base questions on the provided notes/summary and any attached video frames.",
      messages: buildUserMessage(text, data.images, data.videoDataUrl),
    });
    return object;
  });

export const generateFlashcardsAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AiInput.parse(data))
  .handler(async ({ data }) => {
    const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
    const trimmed = data.contentMarkdown.slice(0, 8000);
    const hasMedia = Boolean(data.images?.length || data.videoDataUrl);
    const text = `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nSource context, notes & highlights:\n"""\n${trimmed}\n"""\n${hasMedia ? "\nVideo frames/footage are attached — incorporate concepts you can see in them.\n" : ""}\nGenerate ${data.count ?? 8} flashcards. Front = clear prompt or cloze-style question. Back = concise answer (1-2 sentences).`;
    const { object } = await generateObject({
      model,
      schema: FlashcardSchema,
      system:
        "You create high-quality study flashcards using the minimum-information principle: each card asks one atomic question. Use the user's notes/highlights and any attached video frames as the source of truth.",
      messages: buildUserMessage(text, data.images, data.videoDataUrl),
    });
    return object;
  });

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
  .handler(async ({ data }) => {
    const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
    const trimmed = data.content.slice(0, 12000);
    const hasMedia = Boolean(data.images?.length || data.videoDataUrl);
    const text = `Summarize the following study material for "${data.title}".${hasMedia ? " Video frames/footage are attached — describe and summarize what is actually shown, not just the title." : ""}\n\nContext:\n${trimmed}`;
    const { text: out } = await generateText({
      model,
      system:
        "You create concise, well-structured study summaries in markdown. Use headings, bullet points, and bold for key terms. Focus on the most important concepts. When video frames are attached, ground the summary in what they depict.",
      messages: buildUserMessage(text, data.images, data.videoDataUrl),
    });
    return { summary: out };
  });

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
  .handler(async ({ data }) => {
    const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
    const trimmed = data.content.slice(0, 12000);
    const hasMedia = Boolean(data.images?.length || data.videoDataUrl);
    const text = `Create study notes for "${data.title}" (${data.resourceType ?? "unknown"} resource).${hasMedia ? " Video frames/footage are attached — base the notes on what is actually shown in them." : ""}\n\nContext:\n${trimmed}`;
    const { text: out } = await generateText({
      model,
      system:
        "You create detailed study notes from provided content. Structure with clear headings, key takeaways, definitions, and important details. Use markdown formatting. Be thorough but avoid verbatim copying — rephrase for better understanding. When video frames are attached, describe and explain what they show.",
      messages: buildUserMessage(text, data.images, data.videoDataUrl),
    });
    return { notes: out };
  });

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
  .handler(async ({ data }) => {
    const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
    const hasMedia = Boolean(data.images?.length || data.videoDataUrl);
    const messages: ModelMessage[] = [];

    // First user turn carries the grounding context + media.
    const [first, ...rest] = data.history;
    const groundText = `You are tutoring me on this study material.\n\nContext:\n"""\n${data.context.slice(0, 12000)}\n"""\n${hasMedia ? "\nVideo frames/footage are attached — use what you can see.\n" : ""}\nMy question: ${first.content}`;
    messages.push(...buildUserMessage(groundText, data.images, data.videoDataUrl));
    for (const turn of rest) {
      messages.push({ role: turn.role, content: turn.content });
    }

    const { text } = await generateText({
      model,
      system: `You are a focused, encouraging tutor for the study resource "${data.title}". Answer strictly from the provided context and any attached video frames. If the answer isn't in the material, say so honestly and suggest what part of the video/notes to revisit. Be concise and use markdown.`,
      messages,
    });
    return { answer: text };
  });

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
  .handler(async ({ data }) => {
    const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
    const resourceList = data.resources
      .map(
        (r) => `${r.id}: ${r.name} (${r.type}${r.folderPath ? `, folder: ${r.folderPath}` : ""})`,
      )
      .join("\n");
    const { object } = await generateObject({
      model,
      schema: z.object({
        orderedIds: z.array(z.string()),
        reasoning: z.string(),
      }),
      system:
        "You suggest optimal study order for resources based on their names, types, and folder structure. Consider logical progression (basics before advanced), topic grouping, and content dependencies.",
      prompt: `Suggest the best study order for these resources:\n\n${resourceList}\n\nReturn the IDs in suggested study order.`,
    });
    return object;
  });

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
  .handler(async ({ data }) => {
    const model = getProvider(data.provider, data.endpoint, data.apiKey, data.model);
    const messages: ModelMessage[] = data.history.map((t) => ({
      role: t.role,
      content: t.content,
    }));
    const { object } = await generateObject({
      model,
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
  });
