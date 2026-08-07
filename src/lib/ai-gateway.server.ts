import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Native Google provider. Unlike the OpenAI-compatible Gemini shim, this
 * endpoint accepts image AND video parts, which is what makes real
 * "the AI can see the video" behaviour possible.
 */
export function createGeminiProvider(apiKey: string) {
  return createGoogleGenerativeAI({ apiKey });
}

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}

export function createUserAiProvider(endpoint: string, apiKey: string) {
  return createOpenAICompatible({
    name: "user-ai",
    baseURL: endpoint.replace(/\/$/, ""),
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}
