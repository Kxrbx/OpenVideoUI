import { NextRequest, NextResponse } from "next/server";
import { updateUserName } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

export async function PATCH(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json().catch(() => ({}))) as Partial<{
    name: string;
  }>;
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const user = await updateUserName(session.id, name);

  if (!user) {
    return NextResponse.json({ error: "Unable to update the user name." }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
}
