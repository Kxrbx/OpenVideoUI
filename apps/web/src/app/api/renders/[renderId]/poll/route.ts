import { NextRequest, NextResponse } from "next/server";
import {
  getRenderForUser,
  syncVideoRenderFromProvider
} from "@openvideoui/database";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { storeAsset } from "@openvideoui/storage";
import { normalizeOpenRouterError } from "@openvideoui/shared";
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

  const canRecoverFailedAssetDownload =
    render.status === "failed" &&
    render.failureCode === "asset_storage_error" &&
    render.mediaType === "video";

  if (
    render.status === "completed" ||
    render.status === "canceled" ||
    (render.status === "failed" && !canRecoverFailedAssetDownload)
  ) {
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
          (status.unsigned_urls ?? []).map((_source, index) =>
            storeAsset({
              renderId: render.id,
              mediaType: "video",
              source: client.getVideoContentUrl(render.providerJobId!, index),
              sourceKind: "generated",
              fileNameHint: `video-${index + 1}.mp4`,
              headers: {
                Authorization: `Bearer ${apiKey}`
              }
            })
          )
        );

        updatedRender = await syncVideoRenderFromProvider(render.id, status, storedOutputs);
      } catch (storageError) {
        console.warn(
          `[render poll] local video asset storage failed for ${render.id}; falling back to provider URLs`,
          storageError instanceof Error ? storageError.message : storageError
        );
        updatedRender = await syncVideoRenderFromProvider(render.id, status);
      }
    } else {
      updatedRender = await syncVideoRenderFromProvider(render.id, status);
    }

    const detailedRender = await getRenderForUser(render.id, session.id);

    return NextResponse.json({ data: detailedRender ?? updatedRender });
  } catch (error) {
    const normalizedError = normalizeOpenRouterError(
      error,
      "provider_poll_failed",
      "Video polling failed."
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
