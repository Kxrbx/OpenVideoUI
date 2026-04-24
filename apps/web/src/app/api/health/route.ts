import { NextResponse } from "next/server";
import { getModelCapabilityStats } from "@openvideoui/database";
import { createRenderQueueClient, getLatestWorkerHeartbeat } from "@openvideoui/queue";
import { checkAssetStorageAccess } from "@openvideoui/storage";
import {
  getOverallHealthStatus,
  getTimestampAgeSeconds,
  isStaleTimestamp,
  readRuntimeEnv,
  type HealthCheck
} from "@openvideoui/shared";

const MODEL_SYNC_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const WORKER_HEARTBEAT_STALE_AFTER_MS = 90 * 1000;

export async function GET() {
  const env = readRuntimeEnv();
  const checkedAt = new Date().toISOString();
  const checks: Record<string, HealthCheck> = {
    database: {
      status: "error",
      label: "Database",
      message: "Database check did not run.",
      checkedAt
    },
    redis: {
      status: env.redisUrl ? "degraded" : "degraded",
      label: "Redis",
      message: env.redisUrl ? "Redis check did not run." : "REDIS_URL is not configured.",
      action: env.redisUrl ? undefined : "Configure REDIS_URL or start Redis.",
      checkedAt
    },
    worker: {
      status: "degraded",
      label: "Worker",
      message: "No worker heartbeat has been observed yet.",
      action: "Start the worker with npm run dev:worker or docker compose up worker.",
      checkedAt
    },
    storage: {
      status: "error",
      label: "Asset storage",
      message: "Asset storage check did not run.",
      checkedAt
    },
    openRouter: {
      status: env.openRouterApiKey ? "ok" : "degraded",
      label: "OpenRouter",
      message: env.openRouterApiKey
        ? "OPENROUTER_API_KEY is configured for server-side calls."
        : "No server-side OpenRouter key is configured.",
      action: env.openRouterApiKey
        ? undefined
        : "Add OPENROUTER_API_KEY or save a local browser key in setup/settings.",
      checkedAt
    },
    models: {
      status: "degraded",
      label: "Model sync",
      message: "No model capability snapshot has been checked yet.",
      action: "Run npm run sync:models or sync models from setup/settings.",
      checkedAt
    }
  };

  let modelStats: Awaited<ReturnType<typeof getModelCapabilityStats>> | null = null;

  try {
    modelStats = await getModelCapabilityStats();
    checks.database = {
      status: "ok",
      label: "Database",
      message: "Postgres is reachable.",
      checkedAt
    };
  } catch {
    checks.database = {
      status: "error",
      label: "Database",
      message: "Postgres is not reachable or migrations are not applied.",
      action: "Start Postgres and run npm run db:migrate.",
      checkedAt
    };
  }

  if (modelStats) {
    if (modelStats.modelCount === 0) {
      checks.models = {
        status: "degraded",
        label: "Model sync",
        message: "No model capabilities are stored yet.",
        action: "Run npm run sync:models or sync models from setup/settings.",
        checkedAt
      };
    } else if (isStaleTimestamp(modelStats.latestSyncedAt, MODEL_SYNC_STALE_AFTER_MS)) {
      checks.models = {
        status: "degraded",
        label: "Model sync",
        message: `${modelStats.modelCount} models are available, but the snapshot is older than 24 hours.`,
        action: "Sync models again to refresh OpenRouter capabilities.",
        checkedAt,
        ageSeconds: getTimestampAgeSeconds(modelStats.latestSyncedAt)
      };
    } else {
      checks.models = {
        status: "ok",
        label: "Model sync",
        message: `${modelStats.modelCount} model capabilities are available.`,
        checkedAt,
        ageSeconds: getTimestampAgeSeconds(modelStats.latestSyncedAt)
      };
    }
  }

  try {
    await checkAssetStorageAccess();
    checks.storage = {
      status: "ok",
      label: "Asset storage",
      message: "Local asset storage is writable.",
      checkedAt
    };
  } catch {
    checks.storage = {
      status: "error",
      label: "Asset storage",
      message: "Local asset storage is not writable.",
      action: "Check ASSET_STORAGE_DIR permissions and available disk space.",
      checkedAt
    };
  }

  const queue = createRenderQueueClient();

  if (!queue) {
    checks.redis = {
      status: "degraded",
      label: "Redis",
      message: "REDIS_URL is not configured.",
      action: "Configure REDIS_URL or start Redis.",
      checkedAt
    };
  } else {
    try {
      await queue.connect();
      const heartbeats = await queue.getWorkerHeartbeats();
      const latestHeartbeat = getLatestWorkerHeartbeat(heartbeats);

      checks.redis = {
        status: "ok",
        label: "Redis",
        message: "Redis is reachable.",
        checkedAt
      };

      if (!latestHeartbeat) {
        checks.worker = {
          status: "degraded",
          label: "Worker",
          message: "Redis is reachable, but no worker heartbeat is active.",
          action: "Start the worker with npm run dev:worker or docker compose up worker.",
          checkedAt
        };
      } else if (isStaleTimestamp(latestHeartbeat.updatedAt, WORKER_HEARTBEAT_STALE_AFTER_MS)) {
        checks.worker = {
          status: "degraded",
          label: "Worker",
          message: "The latest worker heartbeat is stale.",
          action: "Restart the worker and check worker logs.",
          checkedAt,
          ageSeconds: getTimestampAgeSeconds(latestHeartbeat.updatedAt)
        };
      } else {
        checks.worker = {
          status: "ok",
          label: "Worker",
          message: "A worker heartbeat is active.",
          checkedAt,
          ageSeconds: getTimestampAgeSeconds(latestHeartbeat.updatedAt)
        };
      }
    } catch {
      checks.redis = {
        status: "error",
        label: "Redis",
        message: "Redis is not reachable.",
        action: "Start Redis and verify REDIS_URL.",
        checkedAt
      };
      checks.worker = {
        status: "degraded",
        label: "Worker",
        message: "Worker heartbeat cannot be checked until Redis is reachable.",
        action: "Start Redis, then start the worker.",
        checkedAt
      };
    } finally {
      await queue.disconnect().catch(() => undefined);
    }
  }

  return NextResponse.json({
    app: env.appName,
    nodeEnv: env.nodeEnv,
    status: getOverallHealthStatus(checks),
    checkedAt,
    checks
  });
}
