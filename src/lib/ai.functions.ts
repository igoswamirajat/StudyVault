import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const MODEL = "google/gemini-3-flash-preview";

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

const Input = z.object({
  title: z.string(),
  contentMarkdown: z.string(),
  resourceType: z.string().optional(),
  count: z.number().int().min(3).max(15).optional(),
});

export const generateQuizAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const trimmed = data.contentMarkdown.slice(0, 8000);
    const { object } = await generateObject({
      model: gateway(MODEL),
      schema: QuizSchema,
      system:
        "You generate concise multiple-choice study quizzes. Always 4 options, exactly one correct. Base questions strictly on the provided notes/summary.",
      prompt: `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nNotes & Summary:\n"""\n${trimmed}\n"""\n\nGenerate ${data.count ?? 5} questions that test the most important concepts.`,
    });
    return object;
  });

export const generateFlashcardsAI = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);
    const trimmed = data.contentMarkdown.slice(0, 8000);
    const { object } = await generateObject({
      model: gateway(MODEL),
      schema: FlashcardSchema,
      system:
        "You create high-quality study flashcards using the minimum-information principle: each card asks one atomic question. Use the user's notes/highlights as the source of truth.",
      prompt: `Resource: ${data.title}\nType: ${data.resourceType ?? "unknown"}\n\nSource notes/highlights:\n"""\n${trimmed}\n"""\n\nGenerate ${data.count ?? 8} flashcards. Front = clear prompt or cloze-style question. Back = concise answer (1-2 sentences).`,
    });
    return object;
  });
