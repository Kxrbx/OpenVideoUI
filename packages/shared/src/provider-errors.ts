export type GenerationFailureCode =
  | "validation_error"
  | "openrouter_auth_failed"
  | "openrouter_rate_limited"
  | "openrouter_request_rejected"
  | "openrouter_timeout"
  | "openrouter_image_submission_failed"
  | "openrouter_video_submission_failed"
  | "openrouter_text_submission_failed"
  | "provider_poll_failed"
  | "input_asset_storage_error"
  | "asset_storage_error"
  | "submission_stalled";

export type NormalizedGenerationError = {
  code: GenerationFailureCode;
  message: string;
};

export function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallbackMessage;
}

export function normalizeOpenRouterError(
  error: unknown,
  fallbackCode: GenerationFailureCode,
  fallbackMessage: string
): NormalizedGenerationError {
  const message = getErrorMessage(error, fallbackMessage);
  const normalized = message.toLowerCase();

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return {
      code: "openrouter_timeout",
      message
    };
  }

  if (normalized.includes("(401") || normalized.includes("(403") || normalized.includes("unauthorized")) {
    return {
      code: "openrouter_auth_failed",
      message: "OpenRouter rejected the API key or request authorization."
    };
  }

  if (normalized.includes("(429") || normalized.includes("rate limit")) {
    return {
      code: "openrouter_rate_limited",
      message: "OpenRouter rate limited this request. Try again after a short pause."
    };
  }

  if (normalized.includes("(400") || normalized.includes("(422")) {
    return {
      code: "openrouter_request_rejected",
      message
    };
  }

  return {
    code: fallbackCode,
    message
  };
}
