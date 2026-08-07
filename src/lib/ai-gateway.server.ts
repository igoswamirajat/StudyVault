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
    transformRequestBody: forceNonStreamingForGenerate,
  });
}

export function createUserAiProvider(endpoint: string, apiKey: string) {
  const baseURL = endpoint.replace(/\/$/, "");
  const localTestHeaders: Record<string, string> = isLocalEndpoint(baseURL)
    ? { "x-internal-test": "true" }
    : {};
  return createOpenAICompatible({
    name: "user-ai",
    baseURL,
    headers: { Authorization: `Bearer ${apiKey}`, ...localTestHeaders },
    transformRequestBody: forceNonStreamingForGenerate,
  });
}

function forceNonStreamingForGenerate(body: Record<string, unknown>): Record<string, unknown> {
  // Omniroute defaults omitted `stream` to SSE, but AI SDK doGenerate expects
  // one JSON completion. Keep explicit true for future streamText callers.
  return body.stream === undefined ? { ...body, stream: false } : body;
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
