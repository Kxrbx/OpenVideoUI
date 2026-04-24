import { describe, expect, it } from "vitest";
import { getLatestWorkerHeartbeat } from "./index";

describe("queue helpers", () => {
  it("selects the newest worker heartbeat", () => {
    expect(
      getLatestWorkerHeartbeat([
        { workerId: "older", updatedAt: "2026-04-23T10:00:00.000Z" },
        { workerId: "newer", updatedAt: "2026-04-23T10:00:02.000Z" }
      ])
    ).toEqual({ workerId: "newer", updatedAt: "2026-04-23T10:00:02.000Z" });
  });
});
