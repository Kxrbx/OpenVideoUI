import { NextRequest, NextResponse } from "next/server";
import { syncOpenRouterModelCapabilities } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  try {
    const apiKey = getOpenRouterApiKey(request);
    const result = await syncOpenRouterModelCapabilities(apiKey);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Model sync failed."
      },
      { status: 500 }
    );
  }
}
