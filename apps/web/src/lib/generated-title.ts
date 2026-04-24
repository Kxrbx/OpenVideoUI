import { createOpenRouterClient } from "@openvideoui/openrouter";
import {
  buildFallbackTitle,
  buildTitleGenerationMessages,
  sanitizeGeneratedTitle
} from "@openvideoui/shared";

export const TITLE_MODEL_ID = "openrouter/free";
export const DEFAULT_TITLE_MODEL_ID = TITLE_MODEL_ID;

const TITLE_TIMEOUT_MS = 10_000;
const TITLE_MAX_TOKENS = 24;
const TITLE_TEMPERATURE = 0.2;

export async function generateTitleFromPrompt(input: {
  apiKey: string;
  prompt: string;
  enabled?: boolean;
  fallback?: string;
  modelId?: string;
}) {
  const fallbackTitle = buildFallbackTitle(input.prompt, input.fallback);

  if (input.enabled === false) {
    return fallbackTitle;
  }

  try {
    const client = createOpenRouterClient({
      apiKey: input.apiKey,
      timeoutMs: TITLE_TIMEOUT_MS
    });
    const response = await client.generateText({
      model: input.modelId || DEFAULT_TITLE_MODEL_ID,
      messages: buildTitleGenerationMessages(input.prompt),
      maxTokens: TITLE_MAX_TOKENS,
      temperature: TITLE_TEMPERATURE
    });
    const generatedTitle = sanitizeGeneratedTitle(response.choices[0]?.message?.content);

    return generatedTitle ?? fallbackTitle;
  } catch {
    return fallbackTitle;
  }
}
