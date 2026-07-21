import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260721120000_add_whatsapp_review_notifications.sql",
  import.meta.url,
);

async function migration() {
  return readFile(migrationUrl, "utf8");
}

describe("WhatsApp review notification migration", () => {
  it("creates a minimal organization-scoped outbox without message or phone storage", async () => {
    const sql = await migration();
    const table = sql.match(
      /CREATE TABLE public\.whatsapp_review_notifications[\s\S]*?\n\);/u,
    )?.[0] || "";
    assert.match(table, /CREATE TABLE public\.whatsapp_review_notifications/iu);
    for (const column of [
      "organization_id", "collector_id", "task_id", "submission_id",
      "notification_type", "status", "twilio_message_sid", "attempt_count",
      "last_error_code", "claimed_at", "sent_at",
    ]) assert.match(table, new RegExp(`\\b${column}\\b`, "iu"));
    assert.doesNotMatch(table, /message_body|phone_e164\s+text|media_url/iu);
    assert.match(table, /UNIQUE \(submission_id, notification_type\)/iu);
    assert.match(table, /UNIQUE \(id, organization_id\)/iu);
  });

  it("enforces organization consistency for submission, task, and collector", async () => {
    const sql = await migration();
    assert.match(sql, /FOREIGN KEY \(submission_id, organization_id\)[\s\S]*REFERENCES public\.submissions\(id, organization_id\)/iu);
    assert.match(sql, /FOREIGN KEY \(task_id, organization_id\)[\s\S]*REFERENCES public\.tasks\(id, organization_id\)/iu);
    assert.match(sql, /FOREIGN KEY \(collector_id, organization_id\)[\s\S]*REFERENCES public\.collectors\(id, organization_id\)/iu);
  });

  it("applies the review, task event, and outbox row in one locked function", async () => {
    const sql = await migration();
    const review = sql.match(
      /CREATE OR REPLACE FUNCTION public\.review_submission_with_whatsapp_outbox[\s\S]*?\n\$\$;/u,
    )?.[0] || "";
    assert.match(review, /FOR UPDATE/iu);
    assert.match(review, /review_status <> 'pending'/iu);
    assert.match(review, /review_decision_already_finalized/iu);
    assert.match(review, /UPDATE public\.submissions/iu);
    assert.match(review, /reviewed_by = p_reviewer_id/iu);
    assert.match(review, /reviewed_at = now\(\)/iu);
    assert.match(review, /UPDATE public\.tasks/iu);
    assert.match(review, /INSERT INTO public\.task_events/iu);
    assert.match(review, /INSERT INTO public\.whatsapp_review_notifications/iu);
    assert.match(review, /RETURN QUERY SELECT 'already_reviewed'/iu);
    assert.doesNotMatch(review, /EXCEPTION\s+WHEN/iu);
  });

  it("requires valid rejection reasons and preserves existing statuses", async () => {
    const sql = await migration();
    assert.match(sql, /rejection_reason_required/iu);
    assert.match(sql, /rejection_reason_too_long/iu);
    assert.match(sql, /char_length\(normalized_reason\) > 500/iu);
    assert.match(sql, /'approved'::public\.review_status/iu);
    assert.match(sql, /'rejected'::public\.review_status/iu);
    assert.match(sql, /'approved'::public\.task_status/iu);
    assert.match(sql, /'rejected'::public\.task_status/iu);
    assert.doesNotMatch(sql, /ADD VALUE|needs_resubmission|reopened/iu);
  });

  it("claims pending or failed work with row locking and a maximum-attempt policy", async () => {
    const sql = await migration();
    const claim = sql.match(
      /CREATE OR REPLACE FUNCTION public\.claim_whatsapp_review_notification[\s\S]*?\n\$\$;/u,
    )?.[0] || "";
    assert.match(claim, /FOR UPDATE/iu);
    assert.match(claim, /status NOT IN \('pending', 'failed'\)/iu);
    assert.match(claim, /attempt_count >= 5/iu);
    assert.match(claim, /status = 'sending'/iu);
    assert.match(claim, /attempt_count = notification\.attempt_count \+ 1/iu);
    assert.match(claim, /notification_not_claimable/iu);
    assert.match(claim, /notification_attempt_limit/iu);
    assert.match(claim, /membership\.organization_id = p_organization_id/iu);
  });

  it("makes sent rows terminal and records only safe delivery errors", async () => {
    const sql = await migration();
    assert.match(sql, /target_notification\.status = 'sent'[\s\S]*RETURN target_notification\.twilio_message_sid = normalized_sid/iu);
    assert.match(sql, /target_notification\.status <> 'sending'/iu);
    assert.match(sql, /SET status = 'sent'[\s\S]*twilio_message_sid = normalized_sid/iu);
    assert.match(sql, /SET status = 'failed'[\s\S]*last_error_code = normalized_error/iu);
    assert.match(sql, /normalized_error !~ '\^\[a-z0-9_\]\{1,64\}\$'/iu);
  });

  it("enables RLS and exposes no outbox table access", async () => {
    const sql = await migration();
    assert.match(sql, /ALTER TABLE public\.whatsapp_review_notifications ENABLE ROW LEVEL SECURITY/iu);
    assert.match(sql, /REVOKE ALL ON TABLE public\.whatsapp_review_notifications[\s\S]*FROM PUBLIC, anon, authenticated, service_role/iu);
    assert.doesNotMatch(sql, /CREATE POLICY[\s\S]*whatsapp_review_notifications/iu);
    assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON TABLE public\.whatsapp_review_notifications/iu);
  });

  it("keeps all Stage 4 RPCs fixed-search-path and service-role-only", async () => {
    const sql = await migration();
    for (const [name, signature] of [
      ["review_submission_with_whatsapp_outbox", "review_submission_with_whatsapp_outbox\\(uuid, uuid, uuid, public.review_status, text\\)"],
      ["claim_whatsapp_review_notification", "claim_whatsapp_review_notification\\(uuid, uuid, uuid\\)"],
      ["complete_whatsapp_review_notification", "complete_whatsapp_review_notification\\(uuid, text\\)"],
      ["fail_whatsapp_review_notification", "fail_whatsapp_review_notification\\(uuid, text\\)"],
    ]) {
      assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = pg_catalog, public`, "iu"));
      assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature}[\\s\\S]*?FROM PUBLIC, anon, authenticated`, "iu"));
      assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature}[\\s\\S]*?TO service_role`, "iu"));
    }
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.review_submission_safely[\s\S]*FROM authenticated/iu);
    assert.doesNotMatch(sql, /GRANT EXECUTE[\s\S]*TO (?:anon|authenticated)/iu);
  });

  it("does not reopen or mutate submitted WhatsApp proof sessions", async () => {
    const sql = await migration();
    assert.doesNotMatch(sql, /UPDATE public\.whatsapp_sessions/iu);
    assert.doesNotMatch(sql, /awaiting_before_photo|awaiting_after_photo|needs_resubmission/iu);
  });
});
