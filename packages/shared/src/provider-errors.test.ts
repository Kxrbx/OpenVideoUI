import { describe, expect, it } from "vitest";
import { normalizeOpenRouterError } from "./provider-errors";

describe("provider error normalization", () => {
  it("maps common OpenRouter failures to stable codes", () => {
    expect(
      normalizeOpenRouterError(
        new Error("OpenRouter request failed (401 Unauthorized): bad key"),
        "openrouter_image_submission_failed",
        "Image failed."
      )
    ).toEqual({
      code: "openrouter_auth_failed",
      message: "OpenRouter rejected the API key or request authorization."
    });

    expect(
      normalizeOpenRouterError(
        new Error("OpenRouter request timed out after 60000ms."),
        "openrouter_video_submission_failed",
        "Video failed."
      ).code
    ).toBe("openrouter_timeout");
  });
});
