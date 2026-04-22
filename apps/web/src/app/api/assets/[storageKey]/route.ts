import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { getStoredAssetMetadata, readStoredAsset } from "@openvideoui/storage";
import { requireSession } from "@/lib/api-auth";

type RouteContext = {
  params: Promise<{
    storageKey: string;
  }>;
};

function parseRangeHeader(rangeHeader: string, size: number) {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return null;
  }

  const [, startValue, endValue] = match;

  if (!startValue && !endValue) {
    return null;
  }

  if (!startValue) {
    const suffixLength = Number(endValue);

    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1
    };
  }

  const start = Number(startValue);
  const end = endValue ? Number(endValue) : size - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(end, size - 1)
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { session, unauthorized } = await requireSession();

  if (!session) {
    return unauthorized;
  }

  const { storageKey } = await context.params;

  try {
    const assetMetadata = await getStoredAssetMetadata(storageKey);
    const rangeHeader = request.headers.get("range");
    const baseHeaders = {
      "Content-Type": assetMetadata.mimeType,
      "Content-Disposition": `inline; filename="${assetMetadata.fileName}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Accept-Ranges": "bytes"
    };

    if (rangeHeader) {
      const range = parseRangeHeader(rangeHeader, assetMetadata.size);

      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes */${assetMetadata.size}`
          }
        });
      }

      const asset = await readStoredAsset(storageKey, range);

      return new NextResponse(Readable.toWeb(asset.fileStream) as BodyInit, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(asset.contentLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${asset.size}`
        }
      });
    }

    const asset = await readStoredAsset(storageKey);

    return new NextResponse(Readable.toWeb(asset.fileStream) as BodyInit, {
      headers: {
        ...baseHeaders,
        "Content-Length": String(asset.size)
      }
    });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
