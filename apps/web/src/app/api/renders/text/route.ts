import { NextRequest, NextResponse } from "next/server";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { normalizeOpenRouterError } from "@openvideoui/shared";
import { requireSession } from "@/lib/api-auth";
import { generateTitleFromPrompt } from "@/lib/generated-title";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

type TextRenderRequest = {
  apiKey?: string;
  modelId: string;
  prompt: string;
  messages?: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  generateTitle?: boolean;
  titleModelId?: string;
};

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json()) as Partial<TextRenderRequest>;
  const apiKey = getOpenRouterApiKey(request, body.apiKey);

  if (!apiKey || !body.modelId || !body.prompt) {
    return NextResponse.json(
      { error: "apiKey, modelId, and prompt are required." },
      { status: 400 }
    );
  }

  try {
    const client = createOpenRouterClient({ apiKey });
    const titlePromise =
      body.generateTitle === true
        ? generateTitleFromPrompt({
            apiKey,
            prompt: body.prompt,
            enabled: true,
            fallback: "Untitled chat",
            modelId: body.titleModelId
          })
        : Promise.resolve<string | null>(null);
    const response = await client.generateText({
      model: body.modelId,
      prompt: body.prompt,
      messages: body.messages
    });

    const text = response.choices[0]?.message?.content ?? "";
    const generatedTitle = await titlePromise;

    return NextResponse.json({
      data: {
        mode: "text",
        modelId: body.modelId,
        prompt: body.prompt,
        text,
        generatedTitle,
        providerResponse: response
      }
    });
  } catch (error) {
    const normalizedError = normalizeOpenRouterError(
      error,
      "openrouter_text_submission_failed",
      "Text generation failed."
    );

    return NextResponse.json(
      {
        code: normalizedError.code,
        error: normalizedError.message
      },
      { status: 502 }
    );
  }
}
