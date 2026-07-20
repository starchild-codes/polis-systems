import assert from "node:assert/strict";
import { describe, it } from "node:test";
import handler from "./submission-media.js";

function responseCapture() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    status(code: number) { this.statusCode = code; return this; },
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; return this; },
    send(body: string) { this.body = body; return this; },
  };
}

describe("Vercel Review media function adapter", () => {
  it("is packaged as a GET function and rejects POST", async () => {
    const response = responseCapture();
    await handler({ method: "POST", url: "/api/review/submission-media", headers: {} }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "GET");
  });

  it("rejects an unauthenticated GET before loading server configuration", async () => {
    const response = responseCapture();
    await handler({ method: "GET", url: "/api/review/submission-media", headers: {} }, response);
    assert.equal(response.statusCode, 401);
    assert.doesNotMatch(response.body, /SUPABASE_SERVICE_ROLE_KEY|TWILIO_AUTH_TOKEN/u);
  });
});
