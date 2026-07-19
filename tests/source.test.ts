import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Source } from "../src/index.js";

const IMAGE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IMAGE_BASE64 = Buffer.from(IMAGE_BYTES).toString("base64");

describe("Source helpers", () => {
  it("fromBytes returns base64", () => {
    expect(Source.fromBytes(IMAGE_BYTES)).toBe(IMAGE_BASE64);
  });

  it("fromFile reads and encodes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pictomancer-"));
    const path = join(dir, "image.png");
    await writeFile(path, IMAGE_BYTES);

    await expect(Source.fromFile(path)).resolves.toBe(IMAGE_BASE64);
  });

  it("fromFile propagates missing file errors", async () => {
    await expect(Source.fromFile("/nonexistent/image.png")).rejects.toThrow();
  });
});
