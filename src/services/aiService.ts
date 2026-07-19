import { getDb } from "@/db/schema";
import { generateQuizAI, generateFlashcardsAI, generateSummaryAI, generateAutoNoteAI, suggestSortOrderAI } from "@/lib/ai.functions";

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

  if (provider === "gemini" && !endpoint) {
    endpoint = "https://generativelanguage.googleapis.com/v1beta/openai";
    if (!model) model = "gemini-2.0-flash";
  }

  return { endpoint, apiKey, model };
}

export async function aiGenerateQuiz(title: string, contentMarkdown: string, resourceType?: string, count?: number) {
  const { endpoint, apiKey, model } = await getAiConfig();
  return generateQuizAI({ data: { title, contentMarkdown, resourceType, count, endpoint, apiKey, model } });
}

export async function aiGenerateFlashcards(title: string, contentMarkdown: string, resourceType?: string, count?: number) {
  const { endpoint, apiKey, model } = await getAiConfig();
  return generateFlashcardsAI({ data: { title, contentMarkdown, resourceType, count, endpoint, apiKey, model } });
}

export async function aiGenerateSummary(title: string, content: string) {
  const { endpoint, apiKey, model } = await getAiConfig();
  return generateSummaryAI({ data: { title, content, endpoint, apiKey, model } });
}

export async function aiGenerateAutoNote(title: string, content: string, resourceType?: string) {
  const { endpoint, apiKey, model } = await getAiConfig();
  return generateAutoNoteAI({ data: { title, content, resourceType, endpoint, apiKey, model } });
}

export async function aiSuggestSortOrder(resources: Array<{ id: string; name: string; type: string; folderPath?: string }>) {
  const { endpoint, apiKey, model } = await getAiConfig();
  return suggestSortOrderAI({ data: { resources, endpoint, apiKey, model } });
}

export async function isAiConfigured(): Promise<boolean> {
  const { endpoint, apiKey } = await getAiConfig();
  return Boolean(endpoint && apiKey);
}
