import { existsSync } from "node:fs";
import type { Config } from "drizzle-kit";

function resolveDatabaseUrl() {
  const fallbackUrl = "postgresql://studio:studio@localhost:5432/studio";
  const rawUrl = process.env.DATABASE_URL || fallbackUrl;

  if (existsSync("/.dockerenv")) {
    return rawUrl;
  }

  try {
    const parsedUrl = new URL(rawUrl);

    if (parsedUrl.hostname === "postgres") {
      parsedUrl.hostname = "127.0.0.1";
      return parsedUrl.toString();
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}

const config: Config = {
  out: "./drizzle",
  schema: "./packages/database/src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDatabaseUrl()
  }
};

export default config;
