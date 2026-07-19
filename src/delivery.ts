export interface InlineDelivery {
  mode: "inline";
}

export interface PutUrlDelivery {
  mode: "put_url";
  put_url: string;
  headers?: Record<string, string>;
}

export interface CallbackDelivery {
  mode: "callback_url";
  callback_url: string;
  headers?: Record<string, string>;
  secret?: string;
}

export type DeliveryTarget = InlineDelivery | PutUrlDelivery | CallbackDelivery;

export interface PutUrlOptions {
  headers?: Record<string, string>;
}

export interface CallbackOptions {
  headers?: Record<string, string>;
  secret?: string;
}

export const Delivery = {
  /** Default delivery: the optimized bytes are returned in the response. */
  inline(): InlineDelivery {
    return { mode: "inline" };
  },

  /**
   * Delivery to a customer-signed presigned PUT URL (S3/R2/GCS/Azure).
   *
   * The bytes are uploaded there and the op returns a JSON receipt (etag,
   * sha256, bytes_written, ...) instead of raw bytes. No cloud credentials
   * reach Pictomancer.
   */
  putUrl(url: string, options: PutUrlOptions = {}): PutUrlDelivery {
    const target: PutUrlDelivery = { mode: "put_url", put_url: url };
    if (options.headers) target.headers = options.headers;
    return target;
  },

  /**
   * Delivery via POST to a customer callback endpoint (async/large jobs).
   *
   * The bytes are POSTed to `url` with an X-Pig-Sha256 integrity header; the
   * op returns a JSON receipt (status, sha256, bytes_sent, ...). Secure the
   * endpoint with a token in the URL - no credentials are stored server-side.
   *
   * Pass `secret` to have the body signed with HMAC-SHA256: the request
   * carries `X-Pig-Signature: sha256=<hex>`, which you recompute on your
   * endpoint with the same secret (constant-time compare) to authenticate
   * the callback. The secret is used per request and never stored.
   */
  callback(url: string, options: CallbackOptions = {}): CallbackDelivery {
    const target: CallbackDelivery = { mode: "callback_url", callback_url: url };
    if (options.headers) target.headers = options.headers;
    if (options.secret) target.secret = options.secret;
    return target;
  },
};
