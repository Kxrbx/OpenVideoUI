import { NextResponse } from "next/server";
import { readRuntimeEnv } from "@openvideoui/shared";

export async function GET() {
  const env = readRuntimeEnv();

  return NextResponse.json({
    app: env.appName,
    nodeEnv: env.nodeEnv,
    databaseConfigured: Boolean(env.databaseUrl),
    redisConfigured: Boolean(env.redisUrl),
    openRouterConfigured: Boolean(env.openRouterApiKey)
  });
}

