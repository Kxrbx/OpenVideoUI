import { randomUUID } from "node:crypto";
import { createClient, type RedisClientType } from "redis";
import { readRuntimeEnv } from "@openvideoui/shared";

const POLL_QUEUE_KEY = "openvideoui:video-poll-queue";
const LOCK_PREFIX = "openvideoui:render-lock:";
const HEARTBEAT_PREFIX = "openvideoui:worker-heartbeat:";
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

export type RenderQueueClient = {
  workerId: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  markHeartbeat: () => Promise<void>;
  getWorkerHeartbeats: () => Promise<WorkerHeartbeat[]>;
  enqueueRenderPoll: (renderId: string, delayMs?: number) => Promise<void>;
  enqueueRenderPolls: (renderIds: string[], delayMs?: number) => Promise<void>;
  claimDueRenderIds: (limit?: number, lockSeconds?: number) => Promise<string[]>;
  releaseRenderClaim: (renderId: string, nextDelayMs?: number) => Promise<void>;
  completeRender: (renderId: string) => Promise<void>;
};

export type WorkerHeartbeat = {
  workerId: string;
  updatedAt: string;
};

export function getLatestWorkerHeartbeat(heartbeats: WorkerHeartbeat[]) {
  return [...heartbeats].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

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

  const redisClient = client;
  const workerId = randomUUID();

  async function releaseOwnedLock(renderId: string) {
    await redisClient.eval(RELEASE_LOCK_SCRIPT, {
      keys: [`${LOCK_PREFIX}${renderId}`],
      arguments: [workerId]
    });
  }

  return {
    workerId,
    async connect() {
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
    },
    async disconnect() {
      if (redisClient.isOpen) {
        await redisClient.quit();
      }
    },
    async markHeartbeat() {
      await redisClient.set(`${HEARTBEAT_PREFIX}${workerId}`, new Date().toISOString(), {
        expiration: {
          type: "EX",
          value: 90
        }
      });
    },
    async getWorkerHeartbeats() {
      const keys = await redisClient.keys(`${HEARTBEAT_PREFIX}*`);

      if (keys.length === 0) {
        return [];
      }

      const values = await redisClient.mGet(keys);

      return keys
        .map((key, index) => ({
          workerId: key.slice(HEARTBEAT_PREFIX.length),
          updatedAt: values[index] ?? ""
        }))
        .filter((heartbeat) => heartbeat.workerId && heartbeat.updatedAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    async enqueueRenderPoll(renderId: string, delayMs = 0) {
      await redisClient.zAdd(POLL_QUEUE_KEY, [
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

      await redisClient.zAdd(
        POLL_QUEUE_KEY,
        renderIds.map((renderId) => ({
          score: Date.now() + delayMs,
          value: renderId
        }))
      );
    },
    async claimDueRenderIds(limit = 10, lockSeconds = 45) {
      const dueIds = await redisClient.zRangeByScore(POLL_QUEUE_KEY, 0, Date.now(), {
        LIMIT: {
          offset: 0,
          count: limit
        }
      });
      const claimed: string[] = [];

      for (const renderId of dueIds) {
        const didAcquire = await redisClient.set(`${LOCK_PREFIX}${renderId}`, workerId, {
          NX: true,
          expiration: {
            type: "EX",
            value: lockSeconds
          }
        });

        if (didAcquire !== "OK") {
          continue;
        }

        await redisClient.zRem(POLL_QUEUE_KEY, renderId);
        claimed.push(renderId);
      }

      return claimed;
    },
    async releaseRenderClaim(renderId: string, nextDelayMs = 15_000) {
      await releaseOwnedLock(renderId);
      await redisClient.zAdd(POLL_QUEUE_KEY, [
        {
          score: Date.now() + nextDelayMs,
          value: renderId
        }
      ]);
    },
    async completeRender(renderId: string) {
      await releaseOwnedLock(renderId);
      await redisClient.zRem(POLL_QUEUE_KEY, renderId);
    }
  };
}
