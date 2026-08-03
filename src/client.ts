import { DeliveryTarget } from "./delivery.js";
import { PictomancerError } from "./errors.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.pictomancer.ai";

export interface ClientOptions {
  /** Optional Bearer token (`Authorization: Bearer ...`). */
  apiKey?: string;
  /** Defaults to `https://api.pictomancer.ai`. */
  baseUrl?: string;
  /** Request timeout in milliseconds (default 30000). */
  timeoutMs?: number;
  /** Optional wallet identity sent as `X-Agent-Wallet` for x402 tracking. */
  agentWallet?: string;
  /** Injectable fetch implementation (tests). Defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface FormatOption {
  name: string;
  kind: string;
  default_str: string;
  description: string;
  min?: number;
  max?: number;
}

export interface FormatSpec {
  id: string;
  suffix: string;
  options: FormatOption[];
}

export interface InfoResponse {
  formats: FormatSpec[];
}

export interface UsageResponse {
  identity: string;
  requests_used: number;
  free_tier_limit: number;
  free_remaining: number;
  is_free: boolean;
}

export interface AnalyzeResponse {
  size_bytes: number;
}

/** Fill-mode and smart-crop strategy. British spelling per libvips: 'centre', not 'center'. */
export type Gravity = "attention" | "entropy" | "centre";

export interface ResizeOptions {
  scale?: number;
  scale_x?: number;
  scale_y?: number;
  format?: string;
  /** Fill mode: target width in pixels. Requires height; excludes scale/scale_x/scale_y. */
  width?: number;
  /** Fill mode: target height in pixels. Requires width. */
  height?: number;
  /** Fill-mode smart-crop strategy. Only valid with width+height; defaults to 'attention'. */
  gravity?: Gravity;
  autorot?: boolean;
  delivery?: DeliveryTarget;
  [extra: string]: unknown;
}

export interface CompressOptions {
  format?: string;
  q?: number;
  /** Smallest file with SSIM >= target (0 < v <= 1). Excludes q; needs explicit jpeg/webp/avif format. */
  quality_target?: number;
  strip?: boolean;
  autorot?: boolean;
  delivery?: DeliveryTarget;
  [extra: string]: unknown;
}

export interface ConvertOptions {
  q?: number;
  /** Smallest file with SSIM >= target (0 < v <= 1). Excludes q and lossless; jpeg/webp/avif only. */
  quality_target?: number;
  strip?: boolean;
  lossless?: boolean;
  effort?: number;
  autorot?: boolean;
  delivery?: DeliveryTarget;
  [extra: string]: unknown;
}

export interface CropOptions {
  format?: string;
  /** Smart-crop mode: picks the window automatically. Requires width/height; excludes x/y and trim. */
  gravity?: Gravity;
  /** Trim mode: removes a uniform background border. Excludes x/y/width/height/gravity. */
  trim?: boolean;
  /** Trim sensitivity (must be positive; default 10.0 server-side). Only valid with trim: true. */
  threshold?: number;
  autorot?: boolean;
  delivery?: DeliveryTarget;
  [extra: string]: unknown;
}

export interface PipelineOptions {
  delivery?: DeliveryTarget;
  [extra: string]: unknown;
}

export interface PipelineOperation {
  type: "resize" | "compress" | "convert" | "crop";
  params: Record<string, string>;
}

/** JSON receipt returned for put_url/callback deliveries. */
export type DeliveryReceipt = Record<string, unknown>;

/** Image bytes for inline delivery, parsed JSON receipt otherwise. */
export type OpResult = Uint8Array | DeliveryReceipt;

export class Client {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetch ?? fetch;
    this.headers = { "user-agent": userAgent() };
    if (options.apiKey) this.headers["authorization"] = `Bearer ${options.apiKey}`;
    if (options.agentWallet) this.headers["x-agent-wallet"] = options.agentWallet;
  }

  async info(): Promise<InfoResponse> {
    return (await this.json("GET", "/v1/info")) as unknown as InfoResponse;
  }

  async usage(): Promise<UsageResponse> {
    return (await this.json("GET", "/v1/usage")) as unknown as UsageResponse;
  }

  async analyze(source: string): Promise<AnalyzeResponse> {
    return (await this.json("POST", "/v1/analyze", { source })) as unknown as AnalyzeResponse;
  }

  async resize(source: string, options: ResizeOptions = {}): Promise<OpResult> {
    return this.op("/v1/resize", { source }, options);
  }

  async compress(source: string, options: CompressOptions = {}): Promise<OpResult> {
    return this.op("/v1/compress", { source }, options);
  }

  async convert(source: string, format: string, options: ConvertOptions = {}): Promise<OpResult> {
    return this.op("/v1/convert", { source, format }, options);
  }

  /**
   * Three mutually exclusive modes: manual (x+y+width+height), smart
   * (`gravity` in options + width+height, x/y null), trim (`trim: true` in
   * options, x/y/width/height null). `autorot` is valid in all three.
   */
  async crop(
    source: string,
    x: number | null,
    y: number | null,
    width: number | null,
    height: number | null,
    options: CropOptions = {},
  ): Promise<OpResult> {
    const body: Record<string, unknown> = { source };
    if (x !== null) body.x = x;
    if (y !== null) body.y = y;
    if (width !== null) body.width = width;
    if (height !== null) body.height = height;
    return this.op("/v1/crop", body, options);
  }

  async pipeline(
    source: string,
    operations: PipelineOperation[],
    options: PipelineOptions = {},
  ): Promise<OpResult> {
    return this.op("/v1/pipeline", { source, operations }, options);
  }

  private async op(
    path: string,
    body: Record<string, unknown>,
    options: { delivery?: DeliveryTarget; [extra: string]: unknown },
  ): Promise<OpResult> {
    const { delivery, ...params } = options;
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body[key] = value;
    }
    if (delivery !== undefined) body["delivery"] = delivery;

    const resp = await this.request("POST", path, body);
    if ((resp.headers.get("content-type") ?? "").startsWith("application/json")) {
      return (await resp.json()) as DeliveryReceipt;
    }
    return new Uint8Array(await resp.arrayBuffer());
  }

  private async json(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const resp = await this.request(method, path, body);
    return (await resp.json()) as Record<string, unknown>;
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Response> {
    const headers: Record<string, string> = { ...this.headers };
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const resp = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    if (!resp.ok) {
      throw new PictomancerError(resp.status, await errorDetail(resp));
    }
    return resp;
  }
}

function userAgent(): string {
  const runtime =
    typeof process !== "undefined" && process.versions?.node
      ? ` node/${process.versions.node}`
      : "";
  return `pictomancer-node/${VERSION}${runtime}`;
}

async function errorDetail(resp: Response): Promise<string> {
  try {
    const parsed = (await resp.json()) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    return JSON.stringify(parsed);
  } catch {
    return resp.statusText || "request failed";
  }
}
