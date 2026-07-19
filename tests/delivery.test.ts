import { describe, expect, it } from "vitest";

import { Delivery } from "../src/index.js";

describe("Delivery helpers", () => {
  it("inline builds the default target", () => {
    expect(Delivery.inline()).toEqual({ mode: "inline" });
  });

  it("putUrl builds a put_url target", () => {
    const target = Delivery.putUrl("https://bucket.example.com/key?sig=1");

    expect(target).toEqual({ mode: "put_url", put_url: "https://bucket.example.com/key?sig=1" });
  });

  it("putUrl includes signed headers when given", () => {
    const target = Delivery.putUrl("https://bucket.example.com/key", {
      headers: { "x-amz-acl": "private" },
    });

    expect(target.headers).toEqual({ "x-amz-acl": "private" });
  });

  it("callback builds a callback_url target", () => {
    const target = Delivery.callback("https://hooks.example.com/pig?token=t");

    expect(target).toEqual({
      mode: "callback_url",
      callback_url: "https://hooks.example.com/pig?token=t",
    });
  });

  it("callback includes hmac secret when given", () => {
    const target = Delivery.callback("https://hooks.example.com/pig", { secret: "hmac-me" });

    expect(target.secret).toBe("hmac-me");
  });
});
