import { NextRequest, NextResponse } from "next/server";
import {
  createPromptPresetForUser,
  getPromptPresetsForUser,
  type PromptPresetInput
} from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

const VALID_MODES = new Set(["image", "video", "text"]);

type PromptPresetRequest = Partial<PromptPresetInput>;

function parsePresetBody(body: PromptPresetRequest) {
  const title = body.title?.trim();
  const prompt = body.prompt?.trim();
  const modelId = body.modelId?.trim();
  const workflowType = body.workflowType?.trim();

  if (!title || !prompt || !modelId || !workflowType || !body.mode || !VALID_MODES.has(body.mode)) {
    return null;
  }

  return {
    title,
    mode: body.mode,
    workflowType,
    prompt,
    modelId,
    settings: body.settings ?? {},
    tags: body.tags?.filter((tag) => tag.trim().length > 0).map((tag) => tag.trim()) ?? []
  } satisfies PromptPresetInput;
}

export async function GET(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const mode = request.nextUrl.searchParams.get("mode");

  if (mode && !VALID_MODES.has(mode)) {
    return NextResponse.json({ error: "Invalid preset mode." }, { status: 400 });
  }

  const presets = await getPromptPresetsForUser({
    ownerId: session.id,
    mode: mode ? (mode as "image" | "video" | "text") : undefined
  });

  return NextResponse.json({ data: presets });
}

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json().catch(() => ({}))) as PromptPresetRequest;
  const presetInput = parsePresetBody(body);

  if (!presetInput) {
    return NextResponse.json(
      { error: "title, mode, workflowType, prompt, and modelId are required." },
      { status: 400 }
    );
  }

  const preset = await createPromptPresetForUser(session.id, presetInput);

  return NextResponse.json({ data: preset }, { status: 201 });
}
