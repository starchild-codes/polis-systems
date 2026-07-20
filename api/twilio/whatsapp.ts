import type { IncomingHttpHeaders } from "node:http";
import twilio from "twilio";
import {
  createWebhookSupabaseClient,
  loadWhatsAppServerConfig,
  SupabaseWhatsAppWebhookStore,
} from "../_lib/supabase-webhook-store.js";
import {
  handleWhatsAppWebhook,
  type SafeWebhookLog,
} from "../_lib/whatsapp-webhook.js";
import { createMessagingTwiml, GENERIC_ERROR_MESSAGE } from "../_lib/twiml.js";

interface VercelRequestLike {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

interface VercelResponseLike {
  status(code: number): this;
  setHeader(name: string, value: string): this;
  send(body: string): this;
}

function writeSafeLog(entry: SafeWebhookLog): void {
  console.info("twilio_whatsapp_webhook", entry);
}

export default async function handler(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  if ((request.method || "").toUpperCase() !== "POST") {
    response
      .status(405)
      .setHeader("Allow", "POST")
      .setHeader("Content-Type", "text/plain; charset=utf-8")
      .send("Method Not Allowed");
    return;
  }

  if (!request.headers["x-twilio-signature"]) {
    writeSafeLog({ status: "rejected", errorCode: "missing_signature" });
    response.status(403).setHeader("Content-Type", "text/plain; charset=utf-8").send("Forbidden");
    return;
  }

  try {
    const config = loadWhatsAppServerConfig();
    const store = new SupabaseWhatsAppWebhookStore(createWebhookSupabaseClient(config));
    const result = await handleWhatsAppWebhook(
      {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
      },
      {
        authToken: config.twilioAuthToken,
        store,
        validateSignature: twilio.validateRequest,
        log: writeSafeLog,
      },
    );

    for (const [name, value] of Object.entries(result.headers)) {
      response.setHeader(name, value);
    }
    response.status(result.status).send(result.body);
  } catch {
    writeSafeLog({ status: "error", errorCode: "server_configuration_error" });
    response
      .status(500)
      .setHeader("Content-Type", "application/xml; charset=utf-8")
      .send(createMessagingTwiml(GENERIC_ERROR_MESSAGE));
  }
}
