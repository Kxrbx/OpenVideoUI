import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { storeAsset, storeAssetBuffer } from "@openvideoui/storage";
import { requireSession } from "@/lib/api-auth";

type CreateBackgroundRequest = {
  fileName?: string;
  mediaType?: "image" | "video";
  source?: string;
};

function normalizeMediaType(value: unknown) {
  return value === "image" ? "image" : "video";
}

export async function POST(request: NextRequest) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required." }, { status: 400 });
    }

    const mediaType = normalizeMediaType(formData.get("mediaType"));
    const mimeType = file.type || (mediaType === "image" ? "image/png" : "video/mp4");

    try {
      const asset = await storeAssetBuffer({
        renderId: `background-${session.id}-${randomUUID()}`,
        mediaType,
        sourceKind: "reference",
        buffer: Buffer.from(await file.arrayBuffer()),
        mimeType,
        fileNameHint: file.name
      });

      return NextResponse.json({
        data: {
          publicUrl: asset.publicUrl,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          mediaType
        }
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Unable to store the background file."
        },
        { status: 500 }
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as CreateBackgroundRequest;

  if (!body.source || !body.fileName) {
    return NextResponse.json(
      { error: "fileName and source are required." },
      { status: 400 }
    );
  }

  const mediaType = normalizeMediaType(body.mediaType);

  try {
    const asset = await storeAsset({
      renderId: `background-${session.id}-${randomUUID()}`,
      mediaType,
      sourceKind: "reference",
      source: body.source,
      fileNameHint: body.fileName
    });

    return NextResponse.json({
      data: {
        publicUrl: asset.publicUrl,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        mediaType
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to store the background file."
      },
      { status: 500 }
    );
  }
}
