import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { storeAsset } from "@openvideoui/storage";
import { requireSession } from "@/lib/api-auth";

type CreateBackgroundRequest = {
  fileName?: string;
  source?: string;
};

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const body = (await request.json().catch(() => ({}))) as CreateBackgroundRequest;

  if (!body.source || !body.fileName) {
    return NextResponse.json(
      { error: "fileName and source are required." },
      { status: 400 }
    );
  }

  try {
    const asset = await storeAsset({
      renderId: `background-${session.id}-${randomUUID()}`,
      mediaType: "video",
      sourceKind: "reference",
      source: body.source,
      fileNameHint: body.fileName
    });

    return NextResponse.json({
      data: {
        publicUrl: asset.publicUrl,
        fileName: asset.fileName,
        mimeType: asset.mimeType
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to store the background video."
      },
      { status: 500 }
    );
  }
}
