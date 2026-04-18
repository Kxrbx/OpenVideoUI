import { NextRequest, NextResponse } from "next/server";
import {
  failRender,
  getRenderForUser,
  syncVideoRenderFromProvider
} from "@openvideoui/database";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { storeAsset } from "@openvideoui/storage";
import { requireSession } from "@/lib/api-auth";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

type RouteContext = {
  params: Promise<{
    renderId: string;
  }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const { renderId } = await context.params;
  const apiKey = getOpenRouterApiKey(_request);
  const render = await getRenderForUser(renderId, session.id);

  if (!render) {
    return NextResponse.json({ error: "Render not found." }, { status: 404 });
  }

  if (render.mediaType !== "video") {
    return NextResponse.json({ error: "Only video renders support polling." }, { status: 400 });
  }

  if (!render.providerJobId) {
    return NextResponse.json({ error: "Render does not have a provider job ID." }, { status: 400 });
  }

  if (render.status === "completed" || render.status === "failed" || render.status === "canceled") {
    return NextResponse.json({ data: render });
  }

  if (!apiKey) {
    return NextResponse.json({ error: "OpenRouter API key is required." }, { status: 400 });
  }

  try {
    const client = createOpenRouterClient({ apiKey });
    const status = await client.getVideoGeneration(render.providerJobId);
    let updatedRender;

    if (status.status === "completed" && (status.unsigned_urls?.length ?? 0) > 0) {
      try {
        const storedOutputs = await Promise.all(
          (status.unsigned_urls ?? []).map((source, index) =>
            storeAsset({
              renderId: render.id,
              mediaType: "video",
              source,
              sourceKind: "generated",
              fileNameHint: `video-${index + 1}.mp4`
            })
          )
        );

        updatedRender = await syncVideoRenderFromProvider(render.id, status, storedOutputs);
      } catch (storageError) {
        updatedRender = await failRender(
          render.id,
          "asset_storage_error",
          storageError instanceof Error
            ? storageError.message
            : "Video completed but local asset storage failed.",
          status as Record<string, unknown>
        );
      }
    } else {
      updatedRender = await syncVideoRenderFromProvider(render.id, status);
    }

    return NextResponse.json({ data: updatedRender });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Video polling failed."
      },
      { status: 502 }
    );
  }
}
