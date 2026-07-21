import assert from "node:assert/strict";
import { describe, it } from "node:test";
import decisionHandler from "./decision.js";
import retryHandler from "./retry-whatsapp-notification.js";

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

describe("Vercel review notification function adapters", () => {
  it("packages the review decision as a POST-only function", async () => {
    const response = responseCapture();
    await decisionHandler({ method: "GET", headers: {} }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
  });

  it("rejects an unauthenticated decision before loading server configuration", async () => {
    const response = responseCapture();
    await decisionHandler({ method: "POST", headers: {}, body: {} }, response);
    assert.equal(response.statusCode, 401);
    assert.doesNotMatch(response.body, /SUPABASE_SERVICE_ROLE_KEY|TWILIO_AUTH_TOKEN/u);
  });

  it("packages retry as a POST-only authenticated function", async () => {
    const getResponse = responseCapture();
    await retryHandler({ method: "GET", headers: {} }, getResponse);
    assert.equal(getResponse.statusCode, 405);
    assert.equal(getResponse.headers.allow, "POST");

    const postResponse = responseCapture();
    await retryHandler({ method: "POST", headers: {}, body: {} }, postResponse);
    assert.equal(postResponse.statusCode, 401);
    assert.doesNotMatch(postResponse.body, /SUPABASE_SERVICE_ROLE_KEY|TWILIO_AUTH_TOKEN/u);
  });
});
