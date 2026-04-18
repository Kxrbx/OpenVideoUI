import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { readRuntimeEnv } from "@openvideoui/shared";
import * as schema from "./schema";

type DatabaseClient = ReturnType<typeof createDatabaseClient>;

declare global {
  // eslint-disable-next-line no-var
  var __creativeStudioPool: Pool | undefined;
}

export function createDatabaseClient(connectionString = readRuntimeEnv().databaseUrl) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the database client.");
  }

  const pool = new Pool({
    connectionString
  });

  return drizzle(pool, { schema });
}

export function getDatabaseClient(connectionString = readRuntimeEnv().databaseUrl): DatabaseClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the database client.");
  }

  if (!globalThis.__creativeStudioPool) {
    globalThis.__creativeStudioPool = new Pool({
      connectionString
    });
  }

  return drizzle(globalThis.__creativeStudioPool, { schema });
}
