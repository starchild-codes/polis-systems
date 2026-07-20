import assert from "node:assert/strict";
import { describe, it } from "node:test";
import handler from "./assign-task.js";

interface CapturedResponse {
  statusCode: number | null;
  headers: Record<string, string>;
  body: string | null;
  status(code: number): CapturedResponse;
  setHeader(name: string, value: string): CapturedResponse;
  send(body: string): CapturedResponse;
}

function createResponse(): CapturedResponse {
  return {
    statusCode: null,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    send(body) { this.body = body; return this; },
  };
}

describe("Vercel WhatsApp assignment function adapter", () => {
  it("returns 405 with Allow: POST for GET", async () => {
    const response = createResponse();
    await handler({ method: "GET", headers: {} }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
  });

  it("rejects an unauthenticated POST before loading server configuration", async () => {
    const response = createResponse();
    await handler({ method: "POST", headers: {}, body: {} }, response);
    assert.equal(response.statusCode, 401);
    assert.match(response.body || "", /Authentication required/);
  });
});
