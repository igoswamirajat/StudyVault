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
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      if (!res.ok || res.headers.get("content-type")?.indexOf("application/json") === -1) return res;
      const clone = res.clone();
      try {
        const text = await clone.text();
        const json = JSON.parse(text);
        if (json && json.choices && Array.isArray(json.choices)) {
          let modified = false;
          for (const choice of json.choices) {
            let contentString = "";
            if (choice.message && Array.isArray(choice.message.content)) {
              contentString = choice.message.content.map((part: any) => part.text || "").join("");
              modified = true;
            } else if (choice.message && typeof choice.message.content === "string") {
              contentString = choice.message.content;
            }

            if (contentString) {
              contentString = contentString.trim();
              if (contentString.startsWith("{") && !contentString.endsWith("}")) {
                if (contentString.endsWith("]")) contentString += "\n}";
                else if (contentString.endsWith("\"")) contentString += "\n]}\n}";
                else contentString += "\"\n]}\n}";
                choice.message.content = contentString;
                modified = true;
              } else if (modified) {
                choice.message.content = contentString;
              }
            }
          }
          if (modified) {
            return new Response(JSON.stringify(json), {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            });
          }
        }
      } catch (e) {}
      return res;
    },
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
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      if (!res.ok || res.headers.get("content-type")?.indexOf("application/json") === -1) return res;
      const clone = res.clone();
      try {
        const text = await clone.text();
        const json = JSON.parse(text);
        if (json && json.choices && Array.isArray(json.choices)) {
          let modified = false;
          for (const choice of json.choices) {
            let contentString = "";
            if (choice.message && Array.isArray(choice.message.content)) {
              contentString = choice.message.content.map((part: any) => part.text || "").join("");
              modified = true;
            } else if (choice.message && typeof choice.message.content === "string") {
              contentString = choice.message.content;
            }

            if (contentString) {
              contentString = contentString.trim();
              if (contentString.startsWith("{") && !contentString.endsWith("}")) {
                if (contentString.endsWith("]")) contentString += "\n}";
                else if (contentString.endsWith("\"")) contentString += "\n]}\n}";
                else contentString += "\"\n]}\n}";
                choice.message.content = contentString;
                modified = true;
              } else if (modified) {
                choice.message.content = contentString;
              }
            }
          }
          if (modified) {
            return new Response(JSON.stringify(json), {
              status: res.status,
              statusText: res.statusText,
              headers: res.headers,
            });
          }
        }
      } catch (e) {
        // Fall back to original response on parse error
      }
      return res;
    },
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
