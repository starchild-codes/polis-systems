import assert from "node:assert/strict";
import { describe, it } from "node:test";
import handler from "./whatsapp.js";

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
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function createRequest(method: string) {
  return {
    method,
    url: "/api/twilio/whatsapp",
    headers: {
      host: "polis-systems.vercel.app",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "MessageSid=SMadaptertest&From=whatsapp%3A%2B919000000001&NumMedia=0",
  };
}

describe("Vercel WhatsApp function adapter", () => {
  it("allows POST to reach the secure webhook handler", async () => {
    const response = createResponse();

    await handler(createRequest("POST"), response);

    assert.equal(response.statusCode, 403);
    assert.equal(response.body, "Forbidden");
    assert.equal(response.headers.allow, undefined);
  });

  it("returns 405 with Allow: POST for GET", async () => {
    const response = createResponse();

    await handler(createRequest("GET"), response);

    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
    assert.equal(response.body, "Method Not Allowed");
  });

  it("returns 405 with Allow: POST for unsupported methods", async () => {
    const response = createResponse();

    await handler(createRequest("PUT"), response);

    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.allow, "POST");
    assert.equal(response.body, "Method Not Allowed");
  });
});
