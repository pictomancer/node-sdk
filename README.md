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

Sources can be an image URL, a base64 string, or a `data:` URI. For local files or in-memory bytes:

```ts
import { Source } from "@pictomancer/node";

const out = await client.compress(await Source.fromFile("photo.jpg"), { q: 80 });
const out2 = await client.compress(Source.fromBytes(bytes), { q: 80 });
```

## Geometry ops: smart crop, trim, fill, autorot

`crop` has three mutually exclusive modes. Pass `null` for the positional
`x`/`y`/`width`/`height` args not used by a given mode.

```ts
// Manual: exact rectangle.
let out = await client.crop("https://example.com/image.jpg", 0, 0, 100, 100);

// Smart: gravity picks the window. One of "attention" | "entropy" | "centre".
out = await client.crop("https://example.com/image.jpg", null, null, 200, 200, {
  gravity: "attention",
});

// Trim: removes a uniform background border. threshold defaults to 10.0 server-side.
out = await client.crop("https://example.com/image.jpg", null, null, null, null, {
  trim: true,
  threshold: 5,
});
```

`resize` gains a fill mode: pass `width` + `height` (instead of
`scale`/`scale_x`/`scale_y`) to resize and smart-crop to exact dimensions in
one call; `gravity` defaults to `"attention"`.

```ts
const out = await client.resize("https://example.com/image.jpg", {
  width: 200,
  height: 150,
  gravity: "entropy",
});
```

All four ops (`resize`, `compress`, `convert`, `crop`) accept `autorot: true`
to apply EXIF orientation before processing.

When a crop actually trims, the response carries
`X-Pictomancer-Trim-Left/-Top/-Width/-Height` headers.

## Enhance: denoise, auto-contrast, sharpen

All four ops (`resize`, `compress`, `convert`, `crop`) accept three opt-in
modifiers, applied in order `autorot -> denoise -> equalize -> op -> sharpen`.
Base price, no surcharge.

```ts
const out = await client.compress("https://example.com/image.jpg", {
  format: "webp",
  denoise: 2,
  equalize: true,
  sharpen: true,
});
```

- **`denoise`** - median denoise radius 1-3 (window 3x3 to 7x7) before the operation.
- **`equalize`** - auto-contrast: histogram equalisation of the value channel, hue and saturation preserved.
- **`sharpen`** - unsharp-mask sharpen after the operation (libvips defaults).

A `compress` with any of the three that ends up larger than the input IS
billed (`X-Pig-Billed: 1`), unlike a plain compress with no gain.

## Perceptual quality target

Instead of guessing a `q` value, ask for the smallest file that keeps SSIM at or above a target. Supported on `compress` and `convert` for `jpeg`, `webp` and `avif`. Mutually exclusive with `q` (and with `lossless` on convert); `compress` requires an explicit `format`. Not available inside pipelines. The server rejects invalid combinations with a 422.

```ts
const out = await client.compress("https://example.com/image.jpg", {
  format: "webp",
  quality_target: 0.95,
});

const avif = await client.convert("https://example.com/image.jpg", "avif", {
  quality_target: 0.9,
});
```

The API reports the search outcome in response headers: `X-Pictomancer-Quality-Target`, `X-Pictomancer-Quality-Achieved`, `X-Pictomancer-Quality-Q-Final` and `X-Pictomancer-Quality-Encodes` (absent when no search ran). `X-Pig-Billed` is `0` when the input already met the target and came back untouched. The SDK returns the body only (bytes or receipt) and does not surface response headers.

## AI-generated images: one call to web-ready

Image generators (gpt-image, DALL-E, Flux, Midjourney, Stable Diffusion) return 2-8 MB PNGs. optimize_generated returns the same picture as web-ready webp (default), avif, jpeg or png: metadata stripped, transparency kept, optional max_dimension cap (never upscales), optional q or quality_target. Same price as convert; a result that is not smaller is returned free.

```ts
const out = await client.optimizeGenerated("https://example.com/gen.png", { format: "avif", max_dimension: 1600 });
```

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
