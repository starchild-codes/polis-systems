import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const detailFixUrl = new URL(
  "../../supabase/migrations/20260721110000_fix_whatsapp_proof_detail_transition.sql",
  import.meta.url,
);
const stageThreeUrl = new URL(
  "../../supabase/migrations/20260720160000_add_whatsapp_proof_submission_workflow.sql",
  import.meta.url,
);
const baselineUrl = new URL(
  "../../supabase/migrations/20260720110000_production_schema_baseline.sql",
  import.meta.url,
);

async function sql() {
  const [detailFix, stageThree, baseline] = await Promise.all([
    readFile(detailFixUrl, "utf8"),
    readFile(stageThreeUrl, "utf8"),
    readFile(baselineUrl, "utf8"),
  ]);
  const submitProof = stageThree.match(
    /CREATE OR REPLACE FUNCTION public\.submit_whatsapp_proof[\s\S]*?\n\$\$;/u,
  )?.[0] ?? "";
  return { detailFix, submitProof, baseline };
}

describe("WhatsApp proof detail corrective migration", () => {
  it("stores waste type and advances to waste quantity", async () => {
    const { detailFix } = await sql();
    assert.match(detailFix, /p_field = 'waste_type'/u);
    assert.match(detailFix, /temporary_waste_type = normalized_value/iu);
    assert.match(detailFix, /proof_step = 'waste_quantity'/iu);
    assert.match(detailFix, /final_response_code := 'waste_type_received'/iu);
  });

  it("stores quantity and advances to notes", async () => {
    const { detailFix } = await sql();
    assert.match(detailFix, /temporary_quantity = normalized_value/iu);
    assert.match(detailFix, /proof_step = 'notes'/iu);
    assert.match(detailFix, /final_response_code := 'quantity_received'/iu);
  });

  it("removes the ambiguous response-code assignment and qualifies ledger columns", async () => {
    const { detailFix } = await sql();
    assert.match(detailFix, /final_response_code text;/iu);
    assert.match(detailFix, /response_code = final_response_code/iu);
    assert.match(detailFix, /webhook_event\.processing_status = 'received'/iu);
    assert.match(detailFix, /webhook_event\.twilio_message_sid = p_inbound_message_sid/iu);
    assert.doesNotMatch(detailFix, /response_code\s*=\s*response_code/iu);
    for (const name of [
      "processing_status",
      "error_code",
      "proof_step",
      "conversation_state",
      "task_id",
      "submission_id",
      "organization_id",
      "last_inbound_message_sid",
      "last_message_sid",
    ]) {
      assert.doesNotMatch(detailFix, new RegExp(`\\b${name}\\s*=\\s*${name}\\b`, "iu"));
    }
  });

  it("rejects duplicate messages, incorrect steps, expired or cancelled sessions, and missing proof", async () => {
    const { detailFix } = await sql();
    assert.match(detailFix, /processing_status = 'received'[\s\S]*FOR UPDATE/iu);
    assert.match(detailFix, /RAISE EXCEPTION 'webhook_event_not_claimed'/iu);
    assert.match(detailFix, /assignment_status <> 'accepted'/iu);
    assert.match(detailFix, /conversation_state <> 'awaiting_details'/iu);
    assert.match(detailFix, /proof_step <> p_field/iu);
    assert.match(detailFix, /before_photo_path IS NULL/iu);
    assert.match(detailFix, /after_photo_path IS NULL/iu);
    assert.match(detailFix, /expires_at IS NULL[\s\S]*expires_at <= now\(\)/iu);
    assert.match(detailFix, /RAISE EXCEPTION 'proof_state_mismatch'/iu);
  });

  it("locks and scopes the session and task to the collector organization", async () => {
    const { detailFix } = await sql();
    assert.match(detailFix, /session\.collector_id = p_collector_id/iu);
    assert.match(detailFix, /session\.organization_id = p_organization_id[\s\S]*FOR UPDATE/iu);
    assert.match(detailFix, /task\.id = target_session\.task_id/iu);
    assert.match(detailFix, /task\.organization_id = p_organization_id/iu);
    assert.match(detailFix, /task\.collector_id = p_collector_id/iu);
    assert.match(detailFix, /task\.status IN[\s\S]*accepted[\s\S]*in_progress[\s\S]*FOR UPDATE/iu);
  });

  it("finalizes each claimed detail webhook exactly once", async () => {
    const { detailFix } = await sql();
    assert.match(
      detailFix,
      /UPDATE public\.whatsapp_webhook_events AS webhook_event[\s\S]*processing_status = 'recognized'[\s\S]*response_code = final_response_code[\s\S]*error_code = NULL/iu,
    );
    assert.match(detailFix, /RETURN final_response_code;/iu);
  });

  it("submits notes or SKIP atomically and cannot create a second submission", async () => {
    const { submitProof, baseline } = await sql();
    assert.match(submitProof, /normalized_notes text := nullif\(btrim\(coalesce\(p_notes, ''\)\), ''\)/iu);
    assert.match(submitProof, /conversation_state = 'submitted'[\s\S]*target_submission/iu);
    assert.match(submitProof, /proof_step <> 'notes'/iu);
    assert.match(submitProof, /before_photo_path IS NULL/iu);
    assert.match(submitProof, /after_photo_path IS NULL/iu);
    assert.match(submitProof, /INSERT INTO public\.submissions/iu);
    assert.match(submitProof, /collector_notes[\s\S]*normalized_notes/iu);
    assert.match(submitProof, /UPDATE public\.tasks[\s\S]*status = 'submitted'/iu);
    assert.match(submitProof, /UPDATE public\.whatsapp_sessions[\s\S]*conversation_state = 'submitted'/iu);
    assert.match(submitProof, /INSERT INTO public\.task_events[\s\S]*'proof_submitted'/iu);
    assert.match(submitProof, /UPDATE public\.whatsapp_webhook_events[\s\S]*response_code = 'proof_submitted'/iu);
    assert.match(baseline, /task_id uuid NOT NULL UNIQUE/iu);
    assert.doesNotMatch(submitProof, /EXCEPTION\s+WHEN/iu);
  });

  it("preserves fixed search_path and service-role-only execution without widening privileges", async () => {
    const { detailFix } = await sql();
    assert.match(detailFix, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/iu);
    assert.match(
      detailFix,
      /REVOKE ALL ON FUNCTION public\.store_whatsapp_proof_text\(uuid, uuid, text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated;/iu,
    );
    assert.match(
      detailFix,
      /GRANT EXECUTE ON FUNCTION public\.store_whatsapp_proof_text\(uuid, uuid, text, text, text\)[\s\S]*TO service_role;/iu,
    );
    assert.doesNotMatch(detailFix, /GRANT EXECUTE[\s\S]*TO (?:PUBLIC|anon|authenticated)/iu);
    assert.doesNotMatch(detailFix, /ALTER TABLE|DISABLE ROW LEVEL SECURITY|INSERT INTO|DELETE FROM|TRUNCATE/iu);
  });
});
