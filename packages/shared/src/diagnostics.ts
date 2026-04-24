export type HealthStatus = "ok" | "degraded" | "error";

export type HealthCheck = {
  status: HealthStatus;
  label: string;
  message: string;
  action?: string;
  checkedAt?: string;
  ageSeconds?: number | null;
};

export type HealthChecks = Record<string, HealthCheck>;

const HEALTH_STATUS_RANK: Record<HealthStatus, number> = {
  ok: 0,
  degraded: 1,
  error: 2
};

export function getOverallHealthStatus(checks: HealthChecks): HealthStatus {
  return Object.values(checks).reduce<HealthStatus>(
    (currentStatus, check) =>
      HEALTH_STATUS_RANK[check.status] > HEALTH_STATUS_RANK[currentStatus]
        ? check.status
        : currentStatus,
    "ok"
  );
}

export function isStaleTimestamp(
  value: Date | string | null | undefined,
  staleAfterMs: number,
  now = new Date()
) {
  if (!value) {
    return true;
  }

  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return true;
  }

  return now.getTime() - timestamp.getTime() > staleAfterMs;
}

export function getTimestampAgeSeconds(value: Date | string | null | undefined, now = new Date()) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return Math.max(0, Math.round((now.getTime() - timestamp.getTime()) / 1000));
}
