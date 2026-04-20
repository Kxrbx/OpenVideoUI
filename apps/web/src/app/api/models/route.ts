import { NextRequest, NextResponse } from "next/server";
import { listModelCapabilities } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

const ROUTER_MODEL_PRIORITY = new Map<string, number>([
  ["openrouter/auto", 0],
  ["openrouter/free", 1]
]);

function sortRouterModelsFirst<T extends { id: string }>(models: T[]) {
  return [...models].sort((left, right) => {
    const leftPriority = ROUTER_MODEL_PRIORITY.get(left.id) ?? Number.POSITIVE_INFINITY;
    const rightPriority = ROUTER_MODEL_PRIORITY.get(right.id) ?? Number.POSITIVE_INFINITY;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.id.localeCompare(right.id);
  });
}

export async function GET(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const providerType = request.nextUrl.searchParams.get("type");

  if (providerType && providerType !== "image" && providerType !== "video") {
    return NextResponse.json({ error: "Invalid model type." }, { status: 400 });
  }

  const models = await listModelCapabilities(
    providerType ? (providerType as "image" | "video") : undefined
  );

  return NextResponse.json({
    data: sortRouterModelsFirst(models.map((model) => ({
      id: model.modelId,
      name: model.name || model.modelId,
      description:
        model.description ||
        (model.providerType === "video" ? "Video generation model" : "Image generation model"),
      providerType: model.providerType,
      inputModalities: model.inputModalities,
      outputModalities: model.outputModalities,
      supportedAspectRatios: model.supportedAspectRatios,
      supportedDurations: model.supportedDurations,
      supportedResolutions: model.supportedResolutions,
      supportedFrameImages: model.supportedFrameImages,
      allowedPassthroughParameters: model.allowedPassthroughParameters,
      generateAudio: model.generateAudio,
      supportsImageToVideo: model.supportedFrameImages.length > 0,
      supportsReferenceImages: model.allowedPassthroughParameters.includes("input_references"),
      pricingPrompt:
        typeof model.rawPayload?.pricing === "object" &&
        model.rawPayload?.pricing &&
        "prompt" in model.rawPayload.pricing
          ? model.rawPayload.pricing.prompt
          : null,
      pricingCompletion:
        typeof model.rawPayload?.pricing === "object" &&
        model.rawPayload?.pricing &&
        "completion" in model.rawPayload.pricing
          ? model.rawPayload.pricing.completion
          : null,
      pricingRequest:
        typeof model.rawPayload?.pricing === "object" &&
        model.rawPayload?.pricing &&
        "request" in model.rawPayload.pricing
          ? model.rawPayload.pricing.request
          : null,
      pricingImage:
        typeof model.rawPayload?.pricing === "object" &&
        model.rawPayload?.pricing &&
        "image" in model.rawPayload.pricing
          ? model.rawPayload.pricing.image
          : null,
      pricingSkus:
        typeof model.rawPayload?.pricing_skus === "object" && model.rawPayload?.pricing_skus
          ? model.rawPayload.pricing_skus
          : null,
      pricingNote: model.modelId === "openrouter/auto" ? "Routing-dependent pricing" : undefined
    })))
  });
}
