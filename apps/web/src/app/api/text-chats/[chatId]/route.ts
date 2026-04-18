import { NextRequest, NextResponse } from "next/server";
import { updateTextChatForUser } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{
    chatId: string;
  }>;
};

type UpdateTextChatRequest = {
  modelId?: string;
  title?: string;
  messages?: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const { chatId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as UpdateTextChatRequest;

  if (!body.modelId || !body.title || !body.messages) {
    return NextResponse.json(
      { error: "modelId, title, and messages are required." },
      { status: 400 }
    );
  }

  const chat = await updateTextChatForUser({
    ownerId: session.id,
    chatId,
    modelId: body.modelId,
    title: body.title.trim(),
    messages: body.messages
  });

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  return NextResponse.json({ data: chat });
}
