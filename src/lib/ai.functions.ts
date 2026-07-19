import { createServerFn } from "@tanstack/react-start";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider, createUserAiProvider } from "./ai-gateway.server";

const FALLBACK_MODEL = "google/gemini-3-flash-preview";

function getProvider(endpoint?: string, apiKey?: string, model?: string) {
  if (endpoint && apiKey) {
    const provider = createUserAiProvider(endpoint, apiKey);
    return provider(model || "gpt-4o-mini");
  }
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("No AI provider configured. Go to Settings → AI to add your endpoint and API key.");
  return createLovableAiGatewayProvider(key)(FALLBACK_MODEL);
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
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const generateQuizAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AiInput.parse(data))
  .handler(async ({ data }) => {
    const model = getProvider(data.endpoint, data.apiKey, data.model);
    const trimmed = data.contentMarkdown.slice(0, 8000);
    const { object } = await generateObject({
      model,
      schema: QuizSchema,
      system:
        "You generate concise multiple-choice study quizzes. Always 4 options, exactly one correct. Base questions strictly on the provided notes/summary.",
      prompt: `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nNotes & Summary:\n"""\n${trimmed}\n"""\n\nGenerate ${data.count ?? 5} questions that test the most important concepts.`,
    });
    return object;
  });

export const generateFlashcardsAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AiInput.parse(data))
  .handler(async ({ data }) => {
    const model = getProvider(data.endpoint, data.apiKey, data.model);
    const trimmed = data.contentMarkdown.slice(0, 8000);
    const { object } = await generateObject({
      model,
      schema: FlashcardSchema,
      system:
        "You create high-quality study flashcards using the minimum-information principle: each card asks one atomic question. Use the user's notes/highlights as the source of truth.",
      prompt: `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nSource notes/highlights:\n"""\n${trimmed}\n"""\n\nGenerate ${data.count ?? 8} flashcards. Front = clear prompt or cloze-style question. Back = concise answer (1-2 sentences).`,
    });
    return object;
  });

const SummaryInput = z.object({
  title: z.string(),
  content: z.string(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const generateSummaryAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SummaryInput.parse(data))
  .handler(async ({ data }) => {
    const model = getProvider(data.endpoint, data.apiKey, data.model);
    const trimmed = data.content.slice(0, 12000);
    const { text } = await generateText({
      model,
      system:
        "You create concise, well-structured study summaries in markdown. Use headings, bullet points, and bold for key terms. Focus on the most important concepts.",
      prompt: `Summarize the following study material for "${data.title}":\n\n${trimmed}`,
    });
    return { summary: text };
  });

const AutoNoteInput = z.object({
  title: z.string(),
  content: z.string(),
  resourceType: z.string().optional(),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const generateAutoNoteAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AutoNoteInput.parse(data))
  .handler(async ({ data }) => {
    const model = getProvider(data.endpoint, data.apiKey, data.model);
    const trimmed = data.content.slice(0, 12000);
    const { text } = await generateText({
      model,
      system:
        "You create detailed study notes from provided content. Structure with clear headings, key takeaways, definitions, and important details. Use markdown formatting. Be thorough but avoid verbatim copying — rephrase for better understanding.",
      prompt: `Create study notes for "${data.title}" (${data.resourceType ?? "unknown"} resource):\n\n${trimmed}`,
    });
    return { notes: text };
  });

const SortInput = z.object({
  resources: z.array(z.object({ id: z.string(), name: z.string(), type: z.string(), folderPath: z.string().optional() })),
  endpoint: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const suggestSortOrderAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SortInput.parse(data))
  .handler(async ({ data }) => {
    const model = getProvider(data.endpoint, data.apiKey, data.model);
    const resourceList = data.resources.map((r) => `${r.id}: ${r.name} (${r.type}${r.folderPath ? `, folder: ${r.folderPath}` : ""})`).join("\n");
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
