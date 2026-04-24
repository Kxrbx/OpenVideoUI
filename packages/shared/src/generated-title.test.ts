import { describe, expect, it } from "vitest";
import {
  buildFallbackTitle,
  buildTitleGenerationMessages,
  sanitizeGeneratedTitle
} from "./generated-title";

describe("generated title helpers", () => {
  it("sanitizes decorated model responses", () => {
    expect(sanitizeGeneratedTitle('"Title: Neon Harbor Chase."')).toBe("Neon Harbor Chase");
    expect(sanitizeGeneratedTitle("Titre: Portrait lunaire calme\nAlternative: unused")).toBe(
      "Portrait lunaire calme"
    );
  });

  it("rejects meta reasoning titles", () => {
    expect(sanitizeGeneratedTitle("Okay, the user is asking about openrouter/free")).toBeNull();
    expect(sanitizeGeneratedTitle("Question about AI quantization")).toBeNull();
  });

  it("limits generated titles to six words and sixty characters", () => {
    const title = sanitizeGeneratedTitle(
      "A very cinematic portrait of a chrome astronaut walking alone"
    );

    expect(title).toBe("A very cinematic portrait of a");
    expect(title!.length).toBeLessThanOrEqual(60);
  });

  it("falls back to a short deterministic title from the prompt", () => {
    expect(
      buildFallbackTitle(
        "A massive aerial establishing shot of a rainforest city at sunrise with glowing transit lines"
      )
    ).toBe("A massive aerial establishing shot of");
    expect(buildFallbackTitle("", "Untitled chat")).toBe("Untitled chat");
  });

  it("builds the OpenRouter title prompt", () => {
    const messages = buildTitleGenerationMessages("un chat dans Paris");

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("2 to 6 words");
    expect(messages[0].content).toContain("Never mention the user");
    expect(messages[1]).toEqual({
      role: "user",
      content: "un chat dans Paris"
    });
  });
});
