import {
  failStaleSubmittingVideoRenders,
  getRenderById,
  getPollableVideoRenders,
  syncOpenRouterModelCapabilities,
  syncVideoRenderFromProvider
} from "@openvideoui/database";
import { createOpenRouterClient } from "@openvideoui/openrouter";
import { createRenderQueueClient } from "@openvideoui/queue";
import { storeAsset } from "@openvideoui/storage";
import {
  readRuntimeEnv,
  renderStatuses,
  studioInfrastructure
} from "@openvideoui/shared";

const env = readRuntimeEnv();
const workerService = studioInfrastructure.find((service) => service.name === "Worker");
const POLL_INTERVAL_MS = 15_000;
const RETRY_DELAY_MS = 30_000;
const MAX_CLAIMS_PER_CYCLE = 8;
const MAX_RENDER_POLL_CONCURRENCY = 4;
const SUBMISSION_STALE_AFTER_MS = 10 * 60 * 1000;
let queue = createRenderQueueClient();

function logStartup() {
  console.log(`[worker] ${env.appName}`);
  console.log(`[worker] node env: ${env.nodeEnv}`);
  console.log(`[worker] redis: ${env.redisUrl || "missing"}`);
  console.log(`[worker] database: ${env.databaseUrl || "missing"}`);
  console.log(`[worker] openrouter key present: ${Boolean(env.openRouterApiKey)}`);
  console.log(`[worker] role: ${workerService?.note ?? "polling bootstrap"}`);
}

async function syncModelCapabilities() {
  if (!env.openRouterApiKey) {
    console.log("[worker] skipping OpenRouter sync because OPENROUTER_API_KEY is missing");
    return;
  }

  const result = await syncOpenRouterModelCapabilities();

  console.log(
    `[worker] synced ${result.imageModelsSynced} image models and ${result.videoModelsSynced} video models`
  );
}

function heartbeat() {
  const timestamp = new Date().toISOString();
  console.log(
    `[worker] ${timestamp} heartbeat - known render states: ${renderStatuses.join(", ")}`
  );
}

async function processRender(render: Awaited<ReturnType<typeof getRenderById>>) {
  if (!render?.providerJobId) {
    return "terminal" as const;
  }

  const providerJobId = render.providerJobId;
  const client = createOpenRouterClient();
  const status = await client.getVideoGeneration(providerJobId);

  if (status.status === "completed" && (status.unsigned_urls?.length ?? 0) > 0) {
    try {
      const storedOutputs = await Promise.all(
        (status.unsigned_urls ?? []).map((_source, index) =>
          storeAsset({
            renderId: render.id,
            mediaType: "video",
            source: client.getVideoContentUrl(providerJobId, index),
            sourceKind: "generated",
            fileNameHint: `video-${index + 1}.mp4`,
            headers: {
              Authorization: `Bearer ${env.openRouterApiKey}`
            }
          })
        )
      );

      await syncVideoRenderFromProvider(render.id, status, storedOutputs);
      return "terminal" as const;
    } catch (storageError) {
      console.warn(
        `[worker] local video asset storage failed for ${render.id}; falling back to provider URLs`,
        storageError instanceof Error ? storageError.message : storageError
      );
      await syncVideoRenderFromProvider(render.id, status);
      return "terminal" as const;
    }
  }

  if (status.status === "failed") {
    await syncVideoRenderFromProvider(render.id, status);
    return "terminal" as const;
  }

  if (status.status === "completed") {
    await syncVideoRenderFromProvider(render.id, status);
    return "terminal" as const;
  }

  await syncVideoRenderFromProvider(render.id, status);
  return "active" as const;
}

async function bootstrapQueueFromDatabase() {
  if (!queue) {
    return;
  }

  const activeRenders = await getPollableVideoRenders(50);

  if (activeRenders.length === 0) {
    return;
  }

  await queue.enqueueRenderPolls(
    activeRenders
      .filter((render) => Boolean(render.providerJobId))
      .map((render) => render.id),
    0
  );
}

async function pollInFlightVideoRendersFallback() {
  const activeRenders = await getPollableVideoRenders();

  if (activeRenders.length === 0) {
    console.log("[worker] fallback poll cycle complete - no in-flight video renders");
    return;
  }

  console.log(`[worker] fallback poll cycle - checking ${activeRenders.length} video render(s)`);

  for (const render of activeRenders) {
    try {
      await processRender(render);
      console.log(`[worker] render ${render.id} provider polled via fallback`);
    } catch (error) {
      console.error(
        `[worker] render ${render.id} fallback polling failed`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

async function pollInFlightVideoRenders() {
  if (!env.openRouterApiKey) {
    console.log("[worker] skipping video polling because OPENROUTER_API_KEY is missing");
    return;
  }

  await failStaleSubmittingRenders();

  if (!queue) {
    await pollInFlightVideoRendersFallback();
    return;
  }

  const claimedIds = await queue.claimDueRenderIds(MAX_CLAIMS_PER_CYCLE);

  if (claimedIds.length === 0) {
    await bootstrapQueueFromDatabase();
    console.log("[worker] queue poll cycle complete - no due renders");
    return;
  }

  console.log(`[worker] queue poll cycle - claimed ${claimedIds.length} render(s)`);

  await runWithConcurrency(claimedIds, MAX_RENDER_POLL_CONCURRENCY, processClaimedRender);
}

async function failStaleSubmittingRenders() {
  const olderThan = new Date(Date.now() - SUBMISSION_STALE_AFTER_MS);

  try {
    const failed = await failStaleSubmittingVideoRenders(olderThan, 25);

    if (failed.length > 0) {
      console.warn(`[worker] marked ${failed.length} stale video submission(s) as failed`);
    }
  } catch (error) {
    console.error(
      "[worker] stale submission recovery failed",
      error instanceof Error ? error.message : error
    );
  }
}

async function processClaimedRender(renderId: string) {
  if (!queue) {
    return;
  }

  try {
    const render = await getRenderById(renderId);

    if (!render || !render.providerJobId || render.mediaType !== "video") {
      await queue.completeRender(renderId);
      return;
    }

    if (render.status === "completed" || render.status === "failed" || render.status === "canceled") {
      await queue.completeRender(renderId);
      return;
    }

    const result = await processRender(render);

    if (result === "terminal") {
      await queue.completeRender(render.id);
    } else {
      await queue.releaseRenderClaim(render.id, POLL_INTERVAL_MS);
    }

    console.log(`[worker] render ${render.id} processed from queue`);
  } catch (error) {
    console.error(
      `[worker] render ${renderId} polling failed`,
      error instanceof Error ? error.message : error
    );
    await queue.releaseRenderClaim(renderId, RETRY_DELAY_MS);
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>
) {
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const promise = task(item).finally(() => {
      executing.delete(promise);
    });
    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

async function main() {
  logStartup();

  if (queue) {
    try {
      await queue.connect();
      await queue.markHeartbeat();
      await bootstrapQueueFromDatabase();
    } catch (queueError) {
      console.error(
        "[worker] redis queue unavailable, falling back to direct polling",
        queueError instanceof Error ? queueError.message : queueError
      );
      queue = null;
    }
  }

  try {
    await syncModelCapabilities();
  } catch (error) {
    console.error("[worker] OpenRouter sync failed", error);
  }

  heartbeat();
  await pollInFlightVideoRenders();

  if (process.argv.includes("--exit")) {
    if (queue) {
      await queue.disconnect();
    }
    return;
  }

  setInterval(() => {
    heartbeat();
    if (queue) {
      void queue.markHeartbeat();
    }
  }, 30_000);
  setInterval(() => {
    void pollInFlightVideoRenders();
  }, POLL_INTERVAL_MS);
}

void main();
