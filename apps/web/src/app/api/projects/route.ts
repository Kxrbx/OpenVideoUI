import { NextRequest, NextResponse } from "next/server";
import { createProjectForUser } from "@openvideoui/database";
import { requireSession } from "@/lib/api-auth";

type CreateProjectRequest = {
  title?: string;
  description?: string;
};

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json()) as CreateProjectRequest;
  const title = body.title?.trim();

  if (!title) {
    return NextResponse.json({ error: "Project title is required." }, { status: 400 });
  }

  const project = await createProjectForUser({
    ownerId: session.id,
    title,
    description: body.description?.trim() || null
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
