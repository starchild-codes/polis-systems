import type { IncomingHttpHeaders } from "node:http";
import {
  createWebhookSupabaseClient,
  loadWhatsAppServerConfig,
} from "../_lib/supabase-webhook-store.js";
import { SupabaseSubmissionMediaStore } from "../_lib/supabase-submission-media-store.js";
import { handleSubmissionMediaRequest } from "../_lib/submission-media.js";

interface VercelRequestLike {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
}

interface VercelResponseLike {
  status(code: number): this;
  setHeader(name: string, value: string): this;
  send(body: string): this;
}

export default async function handler(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  if ((request.method || "").toUpperCase() !== "GET") {
    response
      .status(405)
      .setHeader("Allow", "GET")
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "private, no-store, max-age=0")
      .send(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  if (!request.headers.authorization) {
    response
      .status(401)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "private, no-store, max-age=0")
      .send(JSON.stringify({ error: "Authentication required." }));
    return;
  }

  try {
    const config = loadWhatsAppServerConfig();
    const result = await handleSubmissionMediaRequest(
      { method: request.method, url: request.url, headers: request.headers },
      new SupabaseSubmissionMediaStore(createWebhookSupabaseClient(config)),
    );
    for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
    response.status(result.status).send(result.body);
  } catch {
    response
      .status(500)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "private, no-store, max-age=0")
      .send(JSON.stringify({ error: "Proof images are temporarily unavailable." }));
  }
}
