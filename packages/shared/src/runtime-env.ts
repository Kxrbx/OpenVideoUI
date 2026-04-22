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

export function readRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const nodeEnv = source.NODE_ENV || "development";
  const isDevelopment = nodeEnv === "development";

  return {
    appName: source.APP_NAME || "OpenVideoUI",
    nodeEnv,
    databaseUrl:
      source.DATABASE_URL ||
      (isDevelopment ? "postgresql://studio:studio@localhost:5432/studio" : ""),
    redisUrl: source.REDIS_URL || (isDevelopment ? "redis://localhost:6379" : ""),
    assetStorageDir: source.ASSET_STORAGE_DIR || ".data/assets",
    openRouterApiKey: source.OPENROUTER_API_KEY || "",
    openRouterBaseUrl: source.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    openRouterHttpReferer:
      source.OPENROUTER_HTTP_REFERER || "https://github.com/Kxrbx/OpenVideoUI",
    openRouterTitle: source.OPENROUTER_TITLE || "OpenVideoUI"
  };
}
