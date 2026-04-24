import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkAssetStorageAccess, getStoredAssetMetadata, storeAssetBuffer } from "./index";

let storageRoot = "";

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "openvideoui-storage-"));
  process.env.ASSET_STORAGE_DIR = storageRoot;
});

afterEach(async () => {
  await rm(storageRoot, { recursive: true, force: true });
  delete process.env.ASSET_STORAGE_DIR;
});

describe("asset storage", () => {
  it("writes local buffers and reads metadata", async () => {
    await expect(checkAssetStorageAccess()).resolves.toMatchObject({ writable: true });

    const stored = await storeAssetBuffer({
      renderId: "00000000-0000-0000-0000-000000000001",
      mediaType: "image",
      sourceKind: "generated",
      buffer: Buffer.from("image"),
      mimeType: "image/png",
      fileNameHint: "result.png"
    });

    await expect(getStoredAssetMetadata(stored.storageKey)).resolves.toMatchObject({
      mimeType: "image/png",
      size: 5
    });
  });

  it("rejects invalid storage keys", async () => {
    await expect(getStoredAssetMetadata("../secret.png")).rejects.toThrow("Invalid storage key");
  });
});
