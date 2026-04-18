import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import { readRuntimeEnv } from "@openvideoui/shared";

const POLL_QUEUE_KEY = "openvideoui:video-poll-queue";
const LOCK_PREFIX = "openvideoui:render-lock:";
const HEARTBEAT_PREFIX = "openvideoui:worker-heartbeat:";

export type RenderQueueClient = {
  workerId: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  markHeartbeat: () => Promise<void>;
  enqueueRenderPoll: (renderId: string, delayMs?: number) => Promise<void>;
  enqueueRenderPolls: (renderIds: string[], delayMs?: number) => Promise<void>;
  claimDueRenderIds: (limit?: number, lockSeconds?: number) => Promise<string[]>;
  releaseRenderClaim: (renderId: string, nextDelayMs?: number) => Promise<void>;
  completeRender: (renderId: string) => Promise<void>;
};

function getClient(url?: string): RedisClientType | null {
  const env = readRuntimeEnv();
  const redisUrl = url || env.redisUrl;

  if (!redisUrl) {
    return null;
  }

  return createClient({
    url: redisUrl
  });
}

export function createRenderQueueClient(redisUrl?: string): RenderQueueClient | null {
  const client = getClient(redisUrl);

  if (!client) {
    return null;
  }

  const workerId = randomUUID();

  return {
    workerId,
    async connect() {
      if (!client.isOpen) {
        await client.connect();
      }
    },
    async disconnect() {
      if (client.isOpen) {
        await client.quit();
      }
    },
    async markHeartbeat() {
      await client.set(`${HEARTBEAT_PREFIX}${workerId}`, new Date().toISOString(), {
        expiration: {
          type: "EX",
          value: 90
        }
      });
    },
    async enqueueRenderPoll(renderId: string, delayMs = 0) {
      await client.zAdd(POLL_QUEUE_KEY, [
        {
          score: Date.now() + delayMs,
          value: renderId
        }
      ]);
    },
    async enqueueRenderPolls(renderIds: string[], delayMs = 0) {
      if (renderIds.length === 0) {
        return;
      }

      await client.zAdd(
        POLL_QUEUE_KEY,
        renderIds.map((renderId) => ({
          score: Date.now() + delayMs,
          value: renderId
        }))
      );
    },
    async claimDueRenderIds(limit = 10, lockSeconds = 45) {
      const dueIds = await client.zRangeByScore(POLL_QUEUE_KEY, 0, Date.now(), {
        LIMIT: {
          offset: 0,
          count: limit
        }
      });
      const claimed: string[] = [];

      for (const renderId of dueIds) {
        const didAcquire = await client.set(`${LOCK_PREFIX}${renderId}`, workerId, {
          NX: true,
          expiration: {
            type: "EX",
            value: lockSeconds
          }
        });

        if (didAcquire !== "OK") {
          continue;
        }

        await client.zRem(POLL_QUEUE_KEY, renderId);
        claimed.push(renderId);
      }

      return claimed;
    },
    async releaseRenderClaim(renderId: string, nextDelayMs = 15_000) {
      await client.del(`${LOCK_PREFIX}${renderId}`);
      await client.zAdd(POLL_QUEUE_KEY, [
        {
          score: Date.now() + nextDelayMs,
          value: renderId
        }
      ]);
    },
    async completeRender(renderId: string) {
      await client.del(`${LOCK_PREFIX}${renderId}`);
      await client.zRem(POLL_QUEUE_KEY, renderId);
    }
  };
}
