import { readRuntimeEnv } from "@openvideoui/shared";
import type {
  OpenRouterChatMessage,
  OpenRouterImageGenerationResponse,
  OpenRouterModelsResponse,
  OpenRouterTextGenerationResponse,
  OpenRouterVideoGenerationRequest,
  OpenRouterVideoGenerationStatus,
  OpenRouterVideoGenerationSubmission,
  OpenRouterVideoModelsResponse
} from "./types";

type RequestOptions = {
  method?: string;
  body?: unknown;
};

type OpenRouterClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  httpReferer?: string;
  title?: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ERROR_BODY_LENGTH = 1_000;

export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly httpReferer?: string;
  private readonly title?: string;
  private readonly timeoutMs: number;

  constructor(options: OpenRouterClientOptions = {}) {
    const env = readRuntimeEnv();

    this.apiKey = options.apiKey ?? env.openRouterApiKey;
    this.baseUrl = options.baseUrl ?? env.openRouterBaseUrl;
    this.httpReferer = options.httpReferer ?? env.openRouterHttpReferer;
    this.title = options.title ?? env.openRouterTitle;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is required.");
    }
  }

  async listModels(outputModalities?: string[]) {
    const query = outputModalities?.length
      ? `?output_modalities=${encodeURIComponent(outputModalities.join(","))}`
      : "";

    return this.request<OpenRouterModelsResponse>(`/models${query}`);
  }

  async listVideoModels() {
    return this.request<OpenRouterVideoModelsResponse>("/videos/models");
  }

  async generateImage(input: {
    model: string;
    prompt: string;
    modalities: string[];
    imageConfig?: Record<string, unknown>;
  }) {
    return this.request<OpenRouterImageGenerationResponse>("/chat/completions", {
      method: "POST",
      body: {
        model: input.model,
        messages: [
          {
            role: "user",
            content: input.prompt
          }
        ],
        modalities: input.modalities,
        image_config: input.imageConfig,
        stream: false
      }
    });
  }

  async generateText(input: {
    model: string;
    prompt?: string;
    messages?: OpenRouterChatMessage[];
  }) {
    const messages =
      input.messages && input.messages.length > 0
        ? input.messages
        : input.prompt
          ? [
              {
                role: "user" as const,
                content: input.prompt
              }
            ]
          : [];

    return this.request<OpenRouterTextGenerationResponse>("/chat/completions", {
      method: "POST",
      body: {
        model: input.model,
        messages,
        stream: false
      }
    });
  }

  async submitVideoGeneration(input: OpenRouterVideoGenerationRequest) {
    return this.request<OpenRouterVideoGenerationSubmission>("/videos", {
      method: "POST",
      body: input
    });
  }

  async getVideoGeneration(jobId: string) {
    return this.request<OpenRouterVideoGenerationStatus>(`/videos/${jobId}`);
  }

  getVideoContentUrl(jobId: string, index = 0) {
    return `${this.baseUrl}/videos/${jobId}/content?index=${index}`;
  }

  private async request<T>(path: string, options: RequestOptions = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: this.buildHeaders(),
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`OpenRouter request timed out after ${this.timeoutMs}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
      throw new Error(
        `OpenRouter request failed (${response.status} ${response.statusText}): ${errorBody}`
      );
    }

    return (await response.json()) as T;
  }

  private buildHeaders() {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };

    if (this.httpReferer) {
      headers["HTTP-Referer"] = this.httpReferer;
    }

    if (this.title) {
      headers["X-OpenRouter-Title"] = this.title;
    }

    return headers;
  }
}

export function createOpenRouterClient(options?: OpenRouterClientOptions) {
  return new OpenRouterClient(options);
}
