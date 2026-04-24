import { NextRequest, NextResponse } from "next/server";
import {
  attachRenderInputAssets,
  createRenderRecord,
  getModelCapabilityById,
  getProjectForUser,
  updateRenderAfterVideoSubmission,
  failRender,
  updateRenderTitle
} from "@openvideoui/database";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { createRenderQueueClient } from "@openvideoui/queue";
import { storeAsset } from "@openvideoui/storage";
import {
  buildFallbackTitle,
  getErrorMessage,
  normalizeOpenRouterError,
  supportsImageGuidedVideo
} from "@openvideoui/shared";
import { requireSession } from "@/lib/api-auth";
import { generateTitleFromPrompt } from "@/lib/generated-title";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

type VideoRenderRequest = {
  apiKey?: string;
  projectId: string;
  modelId: string;
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
  frameImages?: Array<{ type: string; imageUrl: string; frameType: string }>;
  inputReferences?: Array<{ type?: string; imageUrl: string }>;
  generateTitle?: boolean;
  titleModelId?: string;
};

function getSourceType(url: string) {
  return url.startsWith("data:") ? "inline-data-url" : "url";
}

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json()) as Partial<VideoRenderRequest>;
  const apiKey = getOpenRouterApiKey(request, body.apiKey);

  if (!apiKey || !body.projectId || !body.modelId || !body.prompt) {
    return NextResponse.json(
      { error: "apiKey, projectId, modelId, and prompt are required." },
      { status: 400 }
    );
  }

  const [project, capability] = await Promise.all([
    getProjectForUser(session.id, body.projectId),
    getModelCapabilityById(body.modelId)
  ]);

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  if (!capability || capability.providerType !== "video") {
    return NextResponse.json({ error: "Model is not available for video generation." }, { status: 400 });
  }

  const isImageToVideo = Boolean(body.frameImages?.length || body.inputReferences?.length);
  const workflowType = isImageToVideo ? "image-to-video" : "text-to-video";

  if (isImageToVideo && !supportsImageGuidedVideo(capability)) {
    return NextResponse.json(
      { error: "Selected model does not support image-guided video generation." },
      { status: 400 }
    );
  }

  const requestPayload = {
    model: body.modelId,
    prompt: body.prompt,
    aspect_ratio: body.aspectRatio,
    duration: body.duration,
    resolution: body.resolution,
    generate_audio: body.generateAudio,
    frame_images: body.frameImages?.map((image) => ({
      type: image.type,
      image_url: {
        url: image.imageUrl
      },
      frame_type: image.frameType
    })),
    input_references: body.inputReferences?.map((image) => ({
      type: image.type,
      image_url: {
        url: image.imageUrl
      }
    }))
  };
  const fallbackTitle = buildFallbackTitle(body.prompt);
  const titlePromise = generateTitleFromPrompt({
    apiKey,
    prompt: body.prompt,
    enabled: body.generateTitle ?? true,
    modelId: body.titleModelId
  });

  const render = await createRenderRecord({
    projectId: project.id,
    modelId: body.modelId,
    mediaType: "video",
    workflowType,
    status: "submitting",
    title: fallbackTitle,
    prompt: body.prompt,
    negativePrompt: null,
    settings: {
      aspectRatio: body.aspectRatio ?? null,
      duration: body.duration ?? null,
      resolution: body.resolution ?? null,
      generateAudio: body.generateAudio ?? null
    },
    providerJobId: null,
    providerGenerationId: null,
    providerPollUrl: null,
    providerStatus: "submitting",
    outputUrls: [],
    providerUsage: null,
    providerRequest: requestPayload,
    providerResponse: null,
    failureCode: null,
    failureMessage: null,
    completedAt: null,
    failedAt: null
  });

  try {
    const storedFrameImages = await Promise.all(
      (body.frameImages ?? []).map(async (image, index) => {
        const stored = await storeAsset({
          renderId: render.id,
          mediaType: "image",
          source: image.imageUrl,
          sourceKind: "reference",
          fileNameHint: `frame-${index + 1}.png`
        });

        return {
          role: image.frameType || "frame",
          assetType: "image",
          sourceType: getSourceType(image.imageUrl),
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sourceUrl: stored.publicUrl,
          storageKey: stored.storageKey,
          metadata: {
            index,
            type: image.type,
            frameType: image.frameType,
            originalSourceType: getSourceType(image.imageUrl)
          }
        };
      })
    );
    const storedReferences = await Promise.all(
      (body.inputReferences ?? []).map(async (image, index) => {
        const stored = await storeAsset({
          renderId: render.id,
          mediaType: "image",
          source: image.imageUrl,
          sourceKind: "reference",
          fileNameHint: `reference-${index + 1}.png`
        });

        return {
          role: image.type || "reference",
          assetType: "image",
          sourceType: getSourceType(image.imageUrl),
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sourceUrl: stored.publicUrl,
          storageKey: stored.storageKey,
          metadata: {
            index,
            type: image.type ?? null,
            originalSourceType: getSourceType(image.imageUrl)
          }
        };
      })
    );

    if (storedFrameImages.length > 0 || storedReferences.length > 0) {
      await attachRenderInputAssets(render.id, [...storedFrameImages, ...storedReferences]);
    }
  } catch (error) {
    const failedRender = await failRender(
      render.id,
      "input_asset_storage_error",
      getErrorMessage(error, "Reference image storage failed.")
    );

    return NextResponse.json({ data: failedRender }, { status: 500 });
  }

  try {
    const client = createOpenRouterClient({ apiKey });
    const submission = await client.submitVideoGeneration(requestPayload);
    const updatedRender = await updateRenderAfterVideoSubmission(
      render.id,
      submission,
      requestPayload
    );

    const queue = createRenderQueueClient();

    if (queue) {
      try {
        await queue.connect();
        await queue.enqueueRenderPoll(render.id, 0);
      } catch (queueError) {
        console.warn(
          "[video-route] queue enqueue skipped",
          queueError instanceof Error ? queueError.message : queueError
        );
      } finally {
        await queue.disconnect();
      }
    }

    const generatedTitle = await titlePromise;
    const titledRender =
      updatedRender && generatedTitle !== updatedRender.title
        ? await updateRenderTitle(render.id, generatedTitle)
        : updatedRender;

    return NextResponse.json({ data: titledRender ?? updatedRender }, { status: 202 });
  } catch (error) {
    const normalizedError = normalizeOpenRouterError(
      error,
      "openrouter_video_submission_failed",
      "Video generation submission failed."
    );
    const failedRender = await failRender(
      render.id,
      normalizedError.code,
      normalizedError.message
    );

    return NextResponse.json({ data: failedRender }, { status: 502 });
  }
}
