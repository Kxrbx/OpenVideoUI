import { NextRequest, NextResponse } from "next/server";
import { readStoredAsset } from "@openvideoui/storage";
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
    const asset = await readStoredAsset(storageKey);
    const rangeHeader = request.headers.get("range");
    const baseHeaders = {
      "Content-Type": asset.mimeType,
      "Content-Disposition": `inline; filename="${asset.fileName}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
      "Accept-Ranges": "bytes"
    };

    if (rangeHeader) {
      const range = parseRangeHeader(rangeHeader, asset.size);

      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes */${asset.size}`
          }
        });
      }

      const chunk = asset.fileBuffer.subarray(range.start, range.end + 1);

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Length": String(chunk.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${asset.size}`
        }
      });
    }

    return new NextResponse(asset.fileBuffer, {
      headers: {
        ...baseHeaders,
        "Content-Length": String(asset.size)
      }
    });
  } catch {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }
}
