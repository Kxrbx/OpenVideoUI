import { existsSync } from "node:fs";

export type RuntimeEnv = {
  appName: string;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  assetStorageDir: string;
  openRouterApiKey: string;
  openRouterBaseUrl: string;
  openRouterHttpReferer: string;
  openRouterTitle: string;
};

function isRunningInDocker() {
  return existsSync("/.dockerenv");
}

function normalizeContainerServiceUrl(
  rawUrl: string,
  serviceHostnames: string[],
  targetHostname = "127.0.0.1"
) {
  if (!rawUrl || isRunningInDocker()) {
    return rawUrl;
  }

  try {
    const parsedUrl = new URL(rawUrl);

    if (!serviceHostnames.includes(parsedUrl.hostname)) {
      return rawUrl;
    }

    parsedUrl.hostname = targetHostname;
    return parsedUrl.toString();
  } catch {
    return rawUrl;
  }
}

export function readRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const nodeEnv = source.NODE_ENV || "development";
  const isDevelopment = nodeEnv === "development";
  const databaseUrl = normalizeContainerServiceUrl(
    source.DATABASE_URL || (isDevelopment ? "postgresql://studio:studio@localhost:5432/studio" : ""),
    ["postgres"]
  );
  const redisUrl = normalizeContainerServiceUrl(
    source.REDIS_URL || (isDevelopment ? "redis://localhost:6379" : ""),
    ["redis"]
  );

  return {
    appName: source.APP_NAME || "OpenVideoUI",
    nodeEnv,
    databaseUrl,
    redisUrl,
    assetStorageDir: source.ASSET_STORAGE_DIR || ".data/assets",
    openRouterApiKey: source.OPENROUTER_API_KEY || "",
    openRouterBaseUrl: source.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    openRouterHttpReferer:
      source.OPENROUTER_HTTP_REFERER || "https://github.com/Kxrbx/OpenVideoUI",
    openRouterTitle: source.OPENROUTER_TITLE || "OpenVideoUI"
  };
}
