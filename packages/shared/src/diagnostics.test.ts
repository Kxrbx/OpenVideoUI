import { describe, expect, it } from "vitest";
import { getOverallHealthStatus, getTimestampAgeSeconds, isStaleTimestamp } from "./diagnostics";

describe("diagnostics helpers", () => {
  it("returns the highest severity health status", () => {
    expect(
      getOverallHealthStatus({
        database: { status: "ok", label: "Database", message: "ok" },
        redis: { status: "degraded", label: "Redis", message: "missing worker" }
      })
    ).toBe("degraded");

    expect(
      getOverallHealthStatus({
        database: { status: "ok", label: "Database", message: "ok" },
        redis: { status: "error", label: "Redis", message: "down" },
        storage: { status: "degraded", label: "Storage", message: "slow" }
      })
    ).toBe("error");
  });

  it("detects stale timestamps and reports age", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    const recent = "2026-04-23T11:59:30.000Z";
    const stale = "2026-04-23T11:57:00.000Z";

    expect(isStaleTimestamp(recent, 90_000, now)).toBe(false);
    expect(isStaleTimestamp(stale, 90_000, now)).toBe(true);
    expect(getTimestampAgeSeconds(recent, now)).toBe(30);
  });
});
