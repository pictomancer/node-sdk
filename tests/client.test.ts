import { describe, expect, it } from "vitest";

import { Client, Delivery, PictomancerError, type PipelineOperation } from "../src/index.js";

const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const SOURCE = "https://example.com/image.jpg";

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

interface FakeResponse {
  status?: number;
  contentType?: string;
  body?: Uint8Array | Record<string, unknown>;
}

interface TestFixture {
  client: Client;
  requests: RecordedRequest[];
}

function newTestClient(
  response: FakeResponse = {},
  clientOptions: { apiKey?: string; agentWallet?: string; baseUrl?: string } = {},
): TestFixture {
  const requests: RecordedRequest[] = [];
  const status = response.status ?? 200;
  const contentType =
    response.contentType ?? (response.body instanceof Uint8Array ? "image/jpeg" : "application/json");
  const payload =
    response.body instanceof Uint8Array
      ? response.body
      : JSON.stringify(response.body ?? {});

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      ),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    });
    return new Response(payload as BodyInit, { status, headers: { "content-type": contentType } });
  };

  const client = new Client({ ...clientOptions, fetch: fakeFetch as typeof fetch });
  return { client, requests };
}

describe("client headers", () => {
  it("sends bearer auth when apiKey is set", async () => {
    const { client, requests } = newTestClient({ body: { formats: [] } }, { apiKey: "sk-123" });

    await client.info();

    expect(requests[0].headers["authorization"]).toBe("Bearer sk-123");
  });

  it("omits auth header without apiKey", async () => {
    const { client, requests } = newTestClient({ body: { formats: [] } });

    await client.info();

    expect(requests[0].headers["authorization"]).toBeUndefined();
  });

  it("sends user-agent telemetry", async () => {
    const { client, requests } = newTestClient({ body: { formats: [] } });

    await client.info();

    expect(requests[0].headers["user-agent"]).toMatch(/^pictomancer-node\/\d+\.\d+\.\d+ node\//);
  });

  it("sends x-agent-wallet when configured", async () => {
    const wallet = "0x" + "ab".repeat(20);
    const { client, requests } = newTestClient({ body: { formats: [] } }, { agentWallet: wallet });

    await client.info();

    expect(requests[0].headers["x-agent-wallet"]).toBe(wallet);
  });
});

describe("json endpoints", () => {
  it("info gets /v1/info", async () => {
    const { client, requests } = newTestClient({ body: { formats: [{ id: "jpeg" }] } });

    const info = await client.info();

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/info");
    expect(requests[0].method).toBe("GET");
    expect(info.formats[0].id).toBe("jpeg");
  });

  it("usage gets /v1/usage", async () => {
    const { client, requests } = newTestClient({ body: { requests_used: 3 } });

    const usage = await client.usage();

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/usage");
    expect(usage.requests_used).toBe(3);
  });

  it("analyze posts source and returns metadata", async () => {
    const { client, requests } = newTestClient({ body: { size_bytes: 1024 } });

    const meta = await client.analyze(SOURCE);

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/analyze");
    expect(requests[0].body).toEqual({ source: SOURCE });
    expect(meta.size_bytes).toBe(1024);
  });
});

describe("operation request bodies", () => {
  it("resize sends scale params", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.resize(SOURCE, { scale: 0.5, format: "webp" });

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/resize");
    expect(requests[0].body).toEqual({ source: SOURCE, scale: 0.5, format: "webp" });
  });

  it("resize sends independent axes", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.resize(SOURCE, { scale_x: 0.5, scale_y: 2.0 });

    expect(requests[0].body).toEqual({ source: SOURCE, scale_x: 0.5, scale_y: 2.0 });
  });

  it("compress sends quality params", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.compress(SOURCE, { format: "jpeg", q: 60, strip: true });

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/compress");
    expect(requests[0].body).toEqual({ source: SOURCE, format: "jpeg", q: 60, strip: true });
  });

  it("compress sends quality_target", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.compress(SOURCE, { format: "webp", quality_target: 0.95 });

    expect(requests[0].body).toEqual({ source: SOURCE, format: "webp", quality_target: 0.95 });
  });

  it("convert sends format and encoder knobs", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.convert(SOURCE, "avif", { q: 50, effort: 2, lossless: false });

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/convert");
    expect(requests[0].body).toEqual({
      source: SOURCE,
      format: "avif",
      q: 50,
      effort: 2,
      lossless: false,
    });
  });

  it("convert sends quality_target", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.convert(SOURCE, "avif", { quality_target: 0.9 });

    expect(requests[0].body).toEqual({ source: SOURCE, format: "avif", quality_target: 0.9 });
  });

  it("crop sends region coordinates", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.crop(SOURCE, 10, 20, 300, 400, { format: "png" });

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/crop");
    expect(requests[0].body).toEqual({
      source: SOURCE,
      x: 10,
      y: 20,
      width: 300,
      height: 400,
      format: "png",
    });
  });

  it("pipeline sends the operation chain", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });
    const operations: PipelineOperation[] = [
      { type: "resize", params: { scale: "0.5" } },
      { type: "convert", params: { format: "webp" } },
    ];

    await client.pipeline(SOURCE, operations);

    expect(requests[0].url).toBe("https://api.pictomancer.ai/v1/pipeline");
    expect(requests[0].body).toEqual({ source: SOURCE, operations });
  });

  it("extra params pass through to the body", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.compress(SOURCE, { format: "png", palette: true });

    expect(requests[0].body).toEqual({ source: SOURCE, format: "png", palette: true });
  });

  it("undefined options are omitted from the body", async () => {
    const { client, requests } = newTestClient({ body: IMAGE_BYTES });

    await client.resize(SOURCE, { scale: 0.5, format: undefined });

    expect(requests[0].body).toEqual({ source: SOURCE, scale: 0.5 });
  });
});

describe("delivery", () => {
  it("attaches put_url target to the body", async () => {
    const { client, requests } = newTestClient({ body: { sha256: "abc" } });

    await client.resize(SOURCE, {
      scale: 0.5,
      delivery: Delivery.putUrl("https://bucket.example.com/key?sig=1", {
        headers: { "x-amz-acl": "private" },
      }),
    });

    expect(requests[0].body?.delivery).toEqual({
      mode: "put_url",
      put_url: "https://bucket.example.com/key?sig=1",
      headers: { "x-amz-acl": "private" },
    });
  });

  it("attaches callback target with secret", async () => {
    const { client, requests } = newTestClient({ body: { status: 200 } });

    await client.compress(SOURCE, {
      delivery: Delivery.callback("https://hooks.example.com/pig?token=t", { secret: "hmac-me" }),
    });

    expect(requests[0].body?.delivery).toEqual({
      mode: "callback_url",
      callback_url: "https://hooks.example.com/pig?token=t",
      secret: "hmac-me",
    });
  });

  it("inline delivery returns image bytes", async () => {
    const { client } = newTestClient({ body: IMAGE_BYTES });

    const result = await client.resize(SOURCE, { scale: 0.5 });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result as Uint8Array)).toEqual(Array.from(IMAGE_BYTES));
  });

  it("json response returns a delivery receipt", async () => {
    const { client } = newTestClient({ body: { sha256: "abc", bytes_written: 42 } });

    const result = await client.resize(SOURCE, {
      scale: 0.5,
      delivery: Delivery.putUrl("https://bucket.example.com/key"),
    });

    expect(result).toEqual({ sha256: "abc", bytes_written: 42 });
  });
});

describe("errors", () => {
  it("non-2xx raises PictomancerError with status and detail", async () => {
    const { client } = newTestClient({ status: 402, body: { detail: "payment required" } });

    const error = await client.resize(SOURCE, { scale: 0.5 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PictomancerError);
    expect((error as PictomancerError).status).toBe(402);
    expect((error as PictomancerError).detail).toBe("payment required");
  });

  it("non-json error body falls back to status text", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("boom", { status: 502, statusText: "Bad Gateway" });
    const client = new Client({ fetch: fakeFetch as typeof fetch });

    const error = await client.info().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PictomancerError);
    expect((error as PictomancerError).detail).toBe("Bad Gateway");
  });
});
