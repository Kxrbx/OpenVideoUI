import { NextRequest, NextResponse } from "next/server";
import { createTextChatForUser } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

type CreateTextChatRequest = {
  projectId?: string;
  modelId?: string;
  title?: string;
  messages?: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
  }>;
};

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json().catch(() => ({}))) as CreateTextChatRequest;

  if (!body.projectId || !body.modelId) {
    return NextResponse.json(
      { error: "projectId and modelId are required." },
      { status: 400 }
    );
  }

  const chat = await createTextChatForUser({
    ownerId: session.id,
    projectId: body.projectId,
    modelId: body.modelId,
    title: body.title?.trim() || undefined,
    messages: body.messages
  });

  if (!chat) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  return NextResponse.json({ data: chat }, { status: 201 });
}
