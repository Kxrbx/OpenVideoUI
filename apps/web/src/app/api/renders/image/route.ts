import { NextRequest, NextResponse } from "next/server";
import {
  completeImageRender,
  createRenderRecord,
  failRender,
  getModelCapabilityById,
  getProjectForUser
} from "@openvideoui/database";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { storeAsset } from "@openvideoui/storage";
import { requireSession } from "@/lib/api-auth";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

type ImageRenderRequest = {
  apiKey?: string;
  projectId: string;
  modelId: string;
  prompt: string;
  modalities?: string[];
  imageConfig?: Record<string, unknown>;
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

  const render = await createRenderRecord({
    projectId: project.id,
    modelId: body.modelId,
    mediaType: "image",
    workflowType: "text-to-image",
    status: "processing",
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

  try {
    const client = createOpenRouterClient({ apiKey });
    const response = await client.generateImage({
      model: body.modelId,
      prompt: body.prompt,
      modalities,
      imageConfig: body.imageConfig
    });

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

    return NextResponse.json({ data: completedRender }, { status: 201 });
  } catch (error) {
    const failedRender = await failRender(
      render.id,
      "openrouter_image_error",
      error instanceof Error ? error.message : "Image generation failed."
    );

    return NextResponse.json({ data: failedRender }, { status: 502 });
  }
}
