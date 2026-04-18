import { NextRequest, NextResponse } from "next/server";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { requireSession } from "@/lib/api-auth";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

type TextRenderRequest = {
  apiKey?: string;
  modelId: string;
  prompt: string;
  messages?: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
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
    const response = await client.generateText({
      model: body.modelId,
      prompt: body.prompt,
      messages: body.messages
    });

    const text = response.choices[0]?.message?.content ?? "";

    return NextResponse.json({
      data: {
        mode: "text",
        modelId: body.modelId,
        prompt: body.prompt,
        text,
        providerResponse: response
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Text generation failed."
      },
      { status: 502 }
    );
  }
}
