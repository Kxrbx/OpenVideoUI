import { NextRequest, NextResponse } from "next/server";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { getOpenRouterApiKey } from "@/lib/openrouter-key";

type RequestBody = {
  apiKey?: string;
  type?: "image" | "video" | "text";
};

const FREE_MODELS_ROUTER = {
  id: "openrouter/free",
  name: "Free Models Router",
  description: "Routes text requests to currently available free models on OpenRouter.",
  providerType: "text",
  pricingPrompt: null,
  pricingCompletion: null,
  pricingRequest: null,
  pricingImage: null,
  pricingSkus: null,
  pricingNote: "Free models only"
} as const;

const AUTO_MODELS_ROUTER_ID = "openrouter/auto";

function sortRouterModelsFirst<T extends { id: string }>(models: T[]) {
  const priority = new Map<string, number>([
    [AUTO_MODELS_ROUTER_ID, 0],
    [FREE_MODELS_ROUTER.id, 1]
  ]);

  return [...models].sort((left, right) => {
    const leftPriority = priority.get(left.id) ?? Number.POSITIVE_INFINITY;
    const rightPriority = priority.get(right.id) ?? Number.POSITIVE_INFINITY;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.id.localeCompare(right.id);
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RequestBody;
  const type = body.type || "video";
  const apiKey = getOpenRouterApiKey(request, body.apiKey);

  if (!apiKey) {
    return NextResponse.json({ error: "OpenRouter API key is required." }, { status: 400 });
  }

  const client = createOpenRouterClient({ apiKey });

  try {
    if (type === "video") {
      const result = await client.listVideoModels();
      return NextResponse.json({
        data: sortRouterModelsFirst(result.data.map((model) => ({
          id: model.id,
          name: model.name || model.id,
          description: model.description || "Video generation model",
          providerType: "video",
          pricingPrompt: null,
          pricingCompletion: null,
          pricingRequest: null,
          pricingImage: null,
          pricingSkus: model.pricing_skus ?? null
        })))
      });
    }

    const outputModalities = type === "image" ? ["image"] : ["text"];
    const result = await client.listModels(outputModalities);
    const models = result.data.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      description: model.description || `${type} generation model`,
      providerType: type,
      pricingPrompt: model.pricing?.prompt ?? null,
      pricingCompletion: model.pricing?.completion ?? null,
      pricingRequest: model.pricing?.request ?? null,
      pricingImage: model.pricing?.image ?? null,
      pricingSkus: null,
      pricingNote:
        model.id === AUTO_MODELS_ROUTER_ID
          ? "Routing-dependent pricing"
          : undefined
    }));

    if (type === "text" && !models.some((model) => model.id === FREE_MODELS_ROUTER.id)) {
      models.unshift(FREE_MODELS_ROUTER);
    }

    return NextResponse.json({
      data: sortRouterModelsFirst(models)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load models."
      },
      { status: 502 }
    );
  }
}
