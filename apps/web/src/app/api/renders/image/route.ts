import { NextRequest, NextResponse } from "next/server";
import {
  completeImageRender,
  createRenderRecord,
  failRender,
  getModelCapabilityById,
  getProjectForUser,
  updateRenderTitle
} from "@openvideoui/database";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import type { OpenRouterImageGenerationResponse } from "@openvideoui/openrouter";
import { storeAsset } from "@openvideoui/storage";
import { buildFallbackTitle, getErrorMessage, normalizeOpenRouterError } from "@openvideoui/shared";
import { requireSession } from "@/lib/api-auth";
import { generateTitleFromPrompt } from "@/lib/generated-title";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

type ImageRenderRequest = {
  apiKey?: string;
  projectId: string;
  modelId: string;
  prompt: string;
  modalities?: string[];
  imageConfig?: Record<string, unknown>;
  generateTitle?: boolean;
  titleModelId?: string;
};

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json()) as Partial<ImageRenderRequest>;
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

  if (!capability || capability.providerType !== "image") {
    return NextResponse.json({ error: "Model is not available for image generation." }, { status: 400 });
  }

  const modalities =
    body.modalities && body.modalities.length > 0
      ? body.modalities
      : capability.outputModalities.includes("text")
        ? ["image", "text"]
        : ["image"];
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
    mediaType: "image",
    workflowType: "text-to-image",
    status: "processing",
    title: fallbackTitle,
    prompt: body.prompt,
    negativePrompt: null,
    settings: {
      modalities,
      imageConfig: body.imageConfig ?? {}
    },
    providerJobId: null,
    providerGenerationId: null,
    providerPollUrl: null,
    providerStatus: "processing",
    outputUrls: [],
    providerUsage: null,
    providerRequest: {
      model: body.modelId,
      prompt: body.prompt,
      modalities,
      image_config: body.imageConfig ?? {}
    },
    providerResponse: null,
    failureCode: null,
    failureMessage: null,
    completedAt: null,
    failedAt: null
  });

  const client = createOpenRouterClient({ apiKey });
  let response: OpenRouterImageGenerationResponse;

  try {
    response = await client.generateImage({
      model: body.modelId,
      prompt: body.prompt,
      modalities,
      imageConfig: body.imageConfig
    });
  } catch (error) {
    const normalizedError = normalizeOpenRouterError(
      error,
      "openrouter_image_submission_failed",
      "Image generation failed."
    );
    const failedRender = await failRender(
      render.id,
      normalizedError.code,
      normalizedError.message
    );

    return NextResponse.json({ data: failedRender }, { status: 502 });
  }

  try {
    const outputUrls =
      response.choices.flatMap((choice) =>
        choice.message.images?.map((image) => image.image_url.url) ?? []
      );
    const storedOutputs = await Promise.all(
      outputUrls.map((source, index) =>
        storeAsset({
          renderId: render.id,
          mediaType: "image",
          source,
          sourceKind: "generated",
          fileNameHint: `image-${index + 1}.png`
        })
      )
    );

    const completedRender = await completeImageRender(
      render.id,
      response as Record<string, unknown>,
      storedOutputs.map((asset) => asset.publicUrl),
      (response.usage ?? null) as Record<string, unknown> | undefined,
      storedOutputs
    );
    const generatedTitle = await titlePromise;
    const titledRender =
      generatedTitle !== completedRender.title
        ? await updateRenderTitle(render.id, generatedTitle)
        : completedRender;

    return NextResponse.json({ data: titledRender ?? completedRender }, { status: 201 });
  } catch (error) {
    const failedRender = await failRender(
      render.id,
      "asset_storage_error",
      getErrorMessage(error, "Generated image storage failed.")
    );

    return NextResponse.json({ data: failedRender }, { status: 500 });
  }
}
