import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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
