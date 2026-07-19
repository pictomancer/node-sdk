import { readFile } from "node:fs/promises";

export const Source = {
  /** Base64 source for in-memory image bytes (the API accepts raw base64). */
  fromBytes(data: Uint8Array): string {
    return Buffer.from(data).toString("base64");
  },

  /** Base64 source for a local image file. */
  async fromFile(path: string): Promise<string> {
    return Source.fromBytes(await readFile(path));
  },
};
