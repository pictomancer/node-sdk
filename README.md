# @pictomancer/node

Node.js SDK for [Pictomancer.ai](https://pictomancer.ai) - a thin, zero-dependency client for the REST API at `https://api.pictomancer.ai`. Uses native `fetch` (Node >= 18).

## Install

```bash
npm install @pictomancer/node
```

## Configuration

- **`apiKey`** - optional Bearer token (`Authorization: Bearer ...`).
- **`baseUrl`** - defaults to `https://api.pictomancer.ai`.
- **`timeoutMs`** - request timeout in milliseconds (default `30000`).
- **`agentWallet`** - optional wallet identity sent as `X-Agent-Wallet` (x402 tracking).

JSON helpers return typed objects; image operations return `Uint8Array` (inline delivery) or a JSON receipt (`put_url`/`callback` delivery).

## Usage

```ts
import { Client } from "@pictomancer/node";

const client = new Client({ apiKey: "your-api-key" });

const info = await client.info();
const usage = await client.usage();

const meta = await client.analyze("https://example.com/image.jpg");

let out = await client.resize("https://example.com/image.jpg", { scale: 0.5, format: "webp" });
out = await client.compress("https://example.com/image.jpg", { q: 85, format: "jpeg" });
out = await client.convert("https://example.com/image.jpg", "avif", { q: 50, effort: 2 });
out = await client.crop("https://example.com/image.jpg", 0, 0, 100, 100, { format: "webp" });
out = await client.pipeline("https://example.com/image.jpg", [
  { type: "resize", params: { scale: "0.5" } },
  { type: "convert", params: { format: "webp" } },
]);

import { writeFile } from "node:fs/promises";
await writeFile("out.webp", out as Uint8Array);
```

Sources can be an image URL, a base64 string, or a `data:` URI.

## Delivery targets

By default the optimized bytes come back inline. For large or async jobs, deliver straight to your storage or endpoint instead - the op then returns a JSON receipt:

```ts
import { Client, Delivery } from "@pictomancer/node";

const client = new Client({ apiKey: "your-api-key" });

// Presigned PUT (S3/R2/GCS/Azure). No cloud credentials reach Pictomancer.
const receipt = await client.compress("https://example.com/big.png", {
  format: "webp",
  delivery: Delivery.putUrl(presignedUrl),
});

// POST to your endpoint, HMAC-signed (X-Pig-Signature: sha256=<hex>).
await client.convert("https://example.com/big.png", "avif", {
  delivery: Delivery.callback("https://hooks.example.com/pig?token=...", {
    secret: process.env.PIG_WEBHOOK_SECRET,
  }),
});
```

## Errors

Non-2xx responses throw `PictomancerError` with `status` and `detail`:

```ts
import { PictomancerError } from "@pictomancer/node";

try {
  await client.resize("https://example.com/image.jpg", { scale: 0.5 });
} catch (e) {
  if (e instanceof PictomancerError && e.status === 402) {
    // free tier exhausted: pay per request (x402) or use an API key
  }
}
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

## License

MIT
