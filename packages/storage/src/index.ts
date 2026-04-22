import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

async function fetchRemoteAsset(source: string, headers?: Record<string, string>) {
  const response = await fetch(source, {
    headers
  });

  if (!response.ok) {
    throw new Error(`Asset download failed (${response.status} ${response.statusText}).`);
  }

  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();

  return {
    mimeType,
    buffer: Buffer.from(arrayBuffer)
  };
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
  const root = getStorageRoot();
  await mkdir(root, { recursive: true });

  const defaultExtension = input.mediaType === "video" ? "mp4" : "png";
  const extension =
    inferExtensionFromFileName(input.fileNameHint) ||
    input.extensionHint ||
    extensionFromMimeType(input.mimeType, defaultExtension);
  const storageKey = `${input.mediaType}-${input.sourceKind}-${input.renderId}-${randomUUID()}.${extension}`;
  const filePath = path.join(root, storageKey);

  await writeFile(filePath, input.buffer);

  return {
    storageKey,
    fileName: input.fileNameHint || storageKey,
    mimeType: mimeTypeFromExtension(extension, input.mimeType),
    fileSize: input.buffer.byteLength,
    publicUrl: buildPublicUrl(storageKey)
  };
}

export async function storeAsset(input: StoreAssetInput): Promise<StoredAsset> {
  const assetData = input.source.startsWith("data:")
    ? parseDataUrl(input.source)
    : await fetchRemoteAsset(input.source, input.headers);
  const defaultExtension = input.mediaType === "video" ? "mp4" : "png";
  const sourceExtension = input.source.startsWith("data:")
    ? extensionFromMimeType(assetData.mimeType, defaultExtension)
    : inferExtensionFromSource(input.source, extensionFromMimeType(assetData.mimeType, defaultExtension));

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

export async function readStoredAsset(storageKey: string) {
  const filePath = path.join(getStorageRoot(), storageKey);
  const fileBuffer = await readFile(filePath);
  const fileStats = await stat(filePath);
  const extension = path.extname(storageKey);
  const mimeType = mimeTypeFromExtension(extension, "application/octet-stream");

  return {
    fileBuffer,
    mimeType,
    size: fileStats.size,
    fileName: path.basename(filePath)
  };
}
