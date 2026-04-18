import { NextRequest, NextResponse } from "next/server";
import { getRenderForUser } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{
    renderId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const { renderId } = await context.params;
  const render = await getRenderForUser(renderId, session.id);

  if (!render) {
    return NextResponse.json({ error: "Render not found." }, { status: 404 });
  }

  return NextResponse.json({ data: render });
}

