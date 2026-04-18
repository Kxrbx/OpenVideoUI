import { NextRequest, NextResponse } from "next/server";
import { readStoredAsset } from "@openvideoui/storage";
import { requireSession } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{
    storageKey: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const { storageKey } = await context.params;

  try {
    const asset = await readStoredAsset(storageKey);

    return new NextResponse(asset.fileBuffer, {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.size),
        "Content-Disposition": `inline; filename="${asset.fileName}"`,
        "Cache-Control": "private, max-age=31536000, immutable"
      }
    });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
