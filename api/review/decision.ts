import type { IncomingHttpHeaders } from "node:http";
import {
  handleReviewDecision,
  type SafeReviewNotificationLog,
} from "../_lib/review-notification.js";
import {
  SupabaseReviewNotificationStore,
  TwilioReviewNotificationSender,
} from "../_lib/supabase-review-notification-store.js";
import {
  createWebhookSupabaseClient,
  loadWhatsAppServerConfig,
} from "../_lib/supabase-webhook-store.js";

interface VercelRequestLike {
  method?: string;
  headers: IncomingHttpHeaders;
  body?: unknown;
}

interface VercelResponseLike {
  status(code: number): this;
  setHeader(name: string, value: string): this;
  send(body: string): this;
}

function writeSafeLog(entry: SafeReviewNotificationLog): void {
  console.info("twilio_review_notification", entry);
}

export default async function handler(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  if ((request.method || "").toUpperCase() !== "POST") {
    response
      .status(405)
      .setHeader("Allow", "POST")
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "private, no-store, max-age=0")
      .send(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  if (!request.headers.authorization) {
    writeSafeLog({ status: "rejected", errorCode: "unauthenticated" });
    response
      .status(401)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "private, no-store, max-age=0")
      .send(JSON.stringify({ code: "unauthenticated", error: "Authentication required." }));
    return;
  }

  try {
    const config = loadWhatsAppServerConfig();
    // Confine the caller token to identity verification. The privileged RPC
    // client never receives a browser Authorization header.
    const identityClient = createWebhookSupabaseClient(config);
    const serviceClient = createWebhookSupabaseClient(config);
    const result = await handleReviewDecision(
      { method: request.method, headers: request.headers, body: request.body },
      {
        store: new SupabaseReviewNotificationStore(serviceClient, identityClient),
        sender: new TwilioReviewNotificationSender(config),
        approvedContentSid: config.twilioReviewApprovedContentSid,
        rejectedContentSid: config.twilioReviewRejectedContentSid,
        log: writeSafeLog,
      },
    );
    for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
    response.status(result.status).send(result.body);
  } catch {
    writeSafeLog({ status: "error", errorCode: "server_configuration_error" });
    response
      .status(500)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .setHeader("Cache-Control", "private, no-store, max-age=0")
      .send(JSON.stringify({ error: "The review notification service is unavailable." }));
  }
}
