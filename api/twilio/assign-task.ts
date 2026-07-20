import type { IncomingHttpHeaders } from "node:http";
import {
  createWebhookSupabaseClient,
  loadWhatsAppServerConfig,
} from "../_lib/supabase-webhook-store.js";
import {
  SupabaseTaskAssignmentStore,
  TwilioTaskAssignmentSender,
} from "../_lib/supabase-task-assignment-store.js";
import {
  handleTaskAssignment,
  type SafeAssignmentLog,
} from "../_lib/task-assignment.js";

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

function writeSafeLog(entry: SafeAssignmentLog): void {
  console.info("twilio_whatsapp_assignment", entry);
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
      .send(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  if (!request.headers.authorization) {
    writeSafeLog({ status: "rejected", errorCode: "unauthenticated" });
    response
      .status(401)
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .send(JSON.stringify({ error: "Authentication required." }));
    return;
  }

  try {
    const config = loadWhatsAppServerConfig();
    const store = new SupabaseTaskAssignmentStore(createWebhookSupabaseClient(config));
    const result = await handleTaskAssignment(
      {
        method: request.method,
        headers: request.headers,
        body: request.body,
      },
      {
        store,
        sender: new TwilioTaskAssignmentSender(config),
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
      .setHeader("Content-Type", "application/json; charset=utf-8")
      .send(JSON.stringify({ error: "The WhatsApp assignment service is unavailable." }));
  }
}
