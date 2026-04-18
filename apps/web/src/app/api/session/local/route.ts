import { NextRequest, NextResponse } from "next/server";
import { ensureStarterWorkspace } from "@openvideoui/database";
import { writeSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Partial<{
    name: string;
    email: string;
  }>;

  const name = body.name?.trim() || "Local Creator";
  const email = body.email?.trim().toLowerCase() || "local@openvideoui.local";

  const user = await writeSession({ name, email });
  await ensureStarterWorkspace(user.id);

  return NextResponse.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
}

