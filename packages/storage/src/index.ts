import { lookup } from "node:dns/promises";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readRuntimeEnv } from "@openvideoui/shared";

export type StoredAsset = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  publicUrl: string;
};

type StoreAssetInput = {
  renderId: string;
  mediaType: "image" | "video";
  source: string;
  sourceKind: "reference" | "generated";
  fileNameHint?: string | null;
  headers?: Record<string, string>;
};

type StoreAssetBufferInput = {
  renderId: string;
  mediaType: "image" | "video";
  sourceKind: "reference" | "generated";
  buffer: Buffer;
  mimeType: string;
  fileNameHint?: string | null;
  extensionHint?: string | null;
};

type StoredAssetPath = {
  root: string;
  filePath: string;
  storageKey: string;
};

type StoredAssetWriteTarget = StoredAssetPath & {
  tempPath: string;
  fileName: string;
  mimeType: string;
};

type StoredAssetReadRange = {
  start: number;
  end: number;
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov"
};
const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const ASSET_FETCH_TIMEOUT_MS = 30_000;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_ASSET_REDIRECTS = 5;
const STORAGE_KEY_PATTERN = /^(image|video)-(reference|generated)-[A-Za-z0-9._-]+-[0-9a-f-]{36}\.[A-Za-z0-9]+$/;

function getStorageRoot() {
  const env = readRuntimeEnv();
  const configured = env.assetStorageDir || ".data/assets";
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function buildPublicUrl(storageKey: string) {
  return `/api/assets/${encodeURIComponent(storageKey)}`;
}

function extensionFromMimeType(mimeType: string, fallback: string) {
  return MIME_EXTENSION_MAP[mimeType] || fallback;
}

function sanitizeExtension(extension: string, fallback: string) {
  return extension.replace(/[^A-Za-z0-9]/g, "") || fallback;
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function assertAllowedMimeType(mimeType: string) {
  const normalized = normalizeMimeType(mimeType);

  if (!ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    throw new Error("Unsupported asset content type.");
  }

  return normalized;
}

function assertAllowedSize(size: number) {
  if (size > MAX_ASSET_BYTES) {
    throw new Error("Asset exceeds the maximum allowed size.");
  }
}

function mimeTypeFromExtension(extension: string, fallback: string) {
  const normalized = extension.replace(/^\./, "").toLowerCase();
  const directMatch = Object.entries(MIME_EXTENSION_MAP).find(([, value]) => value === normalized);
  return directMatch?.[0] || fallback;
}

function parseDataUrl(source: string) {
  const match = source.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new Error("Unsupported data URL format.");
  }

  const mimeType = assertAllowedMimeType(match[1]);
  const estimatedBytes = Math.floor((match[2].length * 3) / 4);
  assertAllowedSize(estimatedBytes);
  const buffer = Buffer.from(match[2], "base64");
  assertAllowedSize(buffer.byteLength);

  return {
    mimeType,
    buffer
  };
}

function isPrivateAddress(address: string) {
  if (address === "127.0.0.1" || address === "::1" || address === "0.0.0.0" || address === "::") {
    return true;
  }

  const family = isIP(address);

  if (family === 4) {
    const [first = 0, second = 0] = address.split(".").map(Number);

    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }

  if (family === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return true;
}

async function assertRemoteAssetUrlAllowed(source: string) {
  let url: URL;

  try {
    url = new URL(source);
  } catch {
    throw new Error("Asset URL is invalid.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Asset URL must use http or https.");
  }

  const addresses = await lookup(url.hostname, { all: true });

  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error("Asset URL host is not allowed.");
  }
}

async function fetchRemoteAsset(source: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASSET_FETCH_TIMEOUT_MS);
  let response: Response;
  let currentSource = source;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_ASSET_REDIRECTS; redirectCount += 1) {
      await assertRemoteAssetUrlAllowed(currentSource);
      response = await fetch(currentSource, {
        headers,
        redirect: "manual",
        signal: controller.signal
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        break;
      }

      const location = response.headers.get("location");

      if (!location) {
        throw new Error("Asset redirect is missing a location.");
      }

      currentSource = new URL(location, currentSource).toString();
    }

    if (!response!) {
      throw new Error("Asset download failed.");
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      throw new Error("Asset redirected too many times.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Asset download timed out.");
    }

    throw error;
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    throw new Error(`Asset download failed (${response.status} ${response.statusText}).`);
  }

  let mimeType: string;

  try {
    mimeType = assertAllowedMimeType(
      response.headers.get("content-type") || "application/octet-stream"
    );
    const contentLength = Number(response.headers.get("content-length") || "0");

    if (contentLength) {
      assertAllowedSize(contentLength);
    }

    if (!response.body) {
      throw new Error("Asset response body is missing.");
    }
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }

  return {
    mimeType,
    body: response.body,
    source: currentSource,
    cleanup: () => clearTimeout(timeoutId)
  };
}

async function streamRemoteAssetToFile(
  responseBody: ReadableStream<Uint8Array>,
  filePath: string
) {
  let totalBytes = 0;
  const reader = responseBody.getReader();
  const writer = createWriteStream(filePath, { flags: "wx" });

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      assertAllowedSize(totalBytes);

      if (!writer.write(Buffer.from(value))) {
        await once(writer, "drain");
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Asset download timed out.");
    }

    throw error;
  } finally {
    writer.end();
  }

  await once(writer, "finish");
  return totalBytes;
}

function inferExtensionFromSource(source: string, fallback: string) {
  try {
    const url = new URL(source);
    const extension = path.extname(url.pathname);
    return extension ? extension.replace(/^\./, "") : fallback;
  } catch {
    return fallback;
  }
}

function inferExtensionFromFileName(fileName: string | null | undefined) {
  if (!fileName) {
    return null;
  }

  const extension = path.extname(fileName);
  return extension ? extension.replace(/^\./, "") : null;
}

async function writeStoredAsset(input: StoreAssetBufferInput): Promise<StoredAsset> {
  const target = await buildStoredAssetWriteTarget({
    mediaType: input.mediaType,
    sourceKind: input.sourceKind,
    renderId: input.renderId,
    mimeType: input.mimeType,
    fileNameHint: input.fileNameHint,
    extensionHint: input.extensionHint
  });
  assertAllowedSize(input.buffer.byteLength);

  try {
    await writeFile(target.tempPath, input.buffer, { flag: "wx" });
    await rename(target.tempPath, target.filePath);
  } catch (error) {
    await unlink(target.tempPath).catch(() => undefined);
    throw error;
  }

  return {
    storageKey: target.storageKey,
    fileName: target.fileName,
    mimeType: target.mimeType,
    fileSize: input.buffer.byteLength,
    publicUrl: buildPublicUrl(target.storageKey)
  };
}

async function buildStoredAssetWriteTarget(input: {
  mediaType: "image" | "video";
  sourceKind: "reference" | "generated";
  renderId: string;
  mimeType: string;
  fileNameHint?: string | null;
  extensionHint?: string | null;
}): Promise<StoredAssetWriteTarget> {
  const root = getStorageRoot();
  await mkdir(root, { recursive: true });
  const mimeType = assertAllowedMimeType(input.mimeType);
  const defaultExtension = input.mediaType === "video" ? "mp4" : "png";
  const extension = sanitizeExtension(
    inferExtensionFromFileName(input.fileNameHint) ||
      input.extensionHint ||
      extensionFromMimeType(mimeType, defaultExtension),
    defaultExtension
  );
  const storageKey = `${input.mediaType}-${input.sourceKind}-${input.renderId}-${randomUUID()}.${extension}`;
  const filePath = path.join(root, storageKey);
  const tempPath = path.join(root, `${storageKey}.${randomUUID()}.tmp`);

  return {
    root,
    filePath,
    tempPath,
    storageKey,
    fileName: input.fileNameHint || storageKey,
    mimeType: mimeTypeFromExtension(extension, mimeType)
  };
}

export async function storeAsset(input: StoreAssetInput): Promise<StoredAsset> {
  if (!input.source.startsWith("data:")) {
    const remoteAsset = await fetchRemoteAsset(input.source, input.headers);
    const defaultExtension = input.mediaType === "video" ? "mp4" : "png";
    const sourceExtension = inferExtensionFromSource(
      remoteAsset.source,
      extensionFromMimeType(remoteAsset.mimeType, defaultExtension)
    );
    const target = await buildStoredAssetWriteTarget({
      renderId: input.renderId,
      mediaType: input.mediaType,
      sourceKind: input.sourceKind,
      mimeType: remoteAsset.mimeType,
      fileNameHint: input.fileNameHint,
      extensionHint: sourceExtension
    });

    try {
      const fileSize = await streamRemoteAssetToFile(remoteAsset.body, target.tempPath);
      await rename(target.tempPath, target.filePath);

      return {
        storageKey: target.storageKey,
        fileName: target.fileName,
        mimeType: target.mimeType,
        fileSize,
        publicUrl: buildPublicUrl(target.storageKey)
      };
    } catch (error) {
      await unlink(target.tempPath).catch(() => undefined);
      throw error;
    } finally {
      remoteAsset.cleanup();
    }
  }

  const assetData = parseDataUrl(input.source);
  const defaultExtension = input.mediaType === "video" ? "mp4" : "png";
  const sourceExtension = extensionFromMimeType(assetData.mimeType, defaultExtension);

  return writeStoredAsset({
    renderId: input.renderId,
    mediaType: input.mediaType,
    sourceKind: input.sourceKind,
    buffer: assetData.buffer,
    mimeType: assetData.mimeType,
    fileNameHint: input.fileNameHint,
    extensionHint: sourceExtension
  });
}

export async function storeAssetBuffer(input: StoreAssetBufferInput): Promise<StoredAsset> {
  return writeStoredAsset(input);
}

export async function checkAssetStorageAccess() {
  const root = getStorageRoot();
  await mkdir(root, { recursive: true });
  const tempPath = path.join(root, `.health-${randomUUID()}.tmp`);

  try {
    await writeFile(tempPath, "ok", { flag: "wx" });
    const fileStats = await stat(tempPath);

    return {
      writable: true,
      bytesWritten: fileStats.size
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}

function resolveStoredAssetPath(storageKey: string): StoredAssetPath {
  if (!STORAGE_KEY_PATTERN.test(storageKey) || path.basename(storageKey) !== storageKey) {
    throw new Error("Invalid storage key.");
  }

  const root = path.resolve(getStorageRoot());
  const filePath = path.resolve(root, storageKey);

  if (!filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid storage key.");
  }

  return {
    root,
    filePath,
    storageKey
  };
}

export async function getStoredAssetMetadata(storageKey: string) {
  const { filePath } = resolveStoredAssetPath(storageKey);
  const fileStats = await stat(filePath);
  const extension = path.extname(storageKey);
  const mimeType = mimeTypeFromExtension(extension, "application/octet-stream");

  return {
    mimeType,
    size: fileStats.size,
    fileName: path.basename(filePath)
  };
}

export async function readStoredAsset(storageKey: string, range?: StoredAssetReadRange) {
  const { filePath } = resolveStoredAssetPath(storageKey);
  const metadata = await getStoredAssetMetadata(storageKey);
  const fileStream = createReadStream(filePath, range);

  return {
    ...metadata,
    fileStream,
    contentLength: range ? range.end - range.start + 1 : metadata.size
  };
}
