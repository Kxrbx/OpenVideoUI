import { NextRequest, NextResponse } from "next/server";
import { deletePromptPresetForUser, updatePromptPresetForUser } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

const VALID_MODES = new Set(["image", "video", "text"]);

type RouteContext = {
  params: Promise<{
    presetId: string;
  }>;
};

type UpdatePromptPresetRequest = {
  title?: string;
  mode?: "image" | "video" | "text";
  workflowType?: string;
  prompt?: string;
  modelId?: string;
  settings?: Record<string, unknown>;
  tags?: string[];
};

function parseUpdateBody(body: UpdatePromptPresetRequest) {
  const values: UpdatePromptPresetRequest = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();

    if (!title) {
      return null;
    }

    values.title = title;
  }

  if (body.mode) {
    if (!VALID_MODES.has(body.mode)) {
      return null;
    }

    values.mode = body.mode;
  }

  if (typeof body.workflowType === "string") {
    const workflowType = body.workflowType.trim();

    if (!workflowType) {
      return null;
    }

    values.workflowType = workflowType;
  }

  if (typeof body.prompt === "string") {
    const prompt = body.prompt.trim();

    if (!prompt) {
      return null;
    }

    values.prompt = prompt;
  }

  if (typeof body.modelId === "string") {
    const modelId = body.modelId.trim();

    if (!modelId) {
      return null;
    }

    values.modelId = modelId;
  }

  if (body.settings) {
    values.settings = body.settings;
  }

  if (body.tags) {
    values.tags = body.tags.filter((tag) => tag.trim().length > 0).map((tag) => tag.trim());
  }

  return Object.keys(values).length > 0 ? values : null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const { presetId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdatePromptPresetRequest;
  const values = parseUpdateBody(body);

  if (!values) {
    return NextResponse.json({ error: "No valid preset updates provided." }, { status: 400 });
  }

  const preset = await updatePromptPresetForUser({
    ownerId: session.id,
    presetId,
    values
  });

  if (!preset) {
    return NextResponse.json({ error: "Preset not found." }, { status: 404 });
  }

  return NextResponse.json({ data: preset });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const { presetId } = await context.params;
  const deleted = await deletePromptPresetForUser({
    ownerId: session.id,
    presetId
  });

  if (!deleted) {
    return NextResponse.json({ error: "Preset not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
