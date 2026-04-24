import { describe, expect, it } from "vitest";
import { supportsImageGuidedVideo } from "./model-capabilities";

describe("model capability helpers", () => {
  it("detects frame-based and reference-based image guidance", () => {
    expect(supportsImageGuidedVideo({ supportedFrameImages: ["first_frame"] })).toBe(true);
    expect(
      supportsImageGuidedVideo({ allowedPassthroughParameters: ["input_references"] })
    ).toBe(true);
    expect(supportsImageGuidedVideo({ supportedFrameImages: [] })).toBe(false);
  });
});
