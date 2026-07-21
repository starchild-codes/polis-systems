import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260720160000_add_whatsapp_proof_submission_workflow.sql",
  import.meta.url,
);
const baselineUrl = new URL(
  "../../supabase/migrations/20260720110000_production_schema_baseline.sql",
  import.meta.url,
);
const hardeningUrl = new URL(
  "../../supabase/migrations/20260720170000_harden_whatsapp_proof_trigger_privileges.sql",
  import.meta.url,
);
const activeSessionProtectionUrl = new URL(
  "../../supabase/migrations/20260720180000_protect_active_whatsapp_proof_session.sql",
  import.meta.url,
);
const proofPhotoTransitionFixUrl = new URL(
  "../../supabase/migrations/20260721100000_fix_whatsapp_proof_photo_transition.sql",
  import.meta.url,
);

async function sql() {
  const [migration, baseline, hardening, activeSessionProtection, proofPhotoTransitionFix] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(baselineUrl, "utf8"),
    readFile(hardeningUrl, "utf8"),
    readFile(activeSessionProtectionUrl, "utf8"),
    readFile(proofPhotoTransitionFixUrl, "utf8"),
  ]);
  return { migration, baseline, hardening, activeSessionProtection, proofPhotoTransitionFix };
}

describe("WhatsApp proof migration contract", () => {
  it("uses the existing submission table and organization-aware foreign keys", async () => {
    const { migration, baseline } = await sql();
    assert.match(baseline, /CREATE TABLE public\.submissions/iu);
    assert.match(baseline, /task_id uuid NOT NULL UNIQUE/iu);
    assert.match(baseline, /FOREIGN KEY \(task_id, organization_id\)[\s\S]*REFERENCES public\.tasks\(id, organization_id\)/iu);
    assert.match(baseline, /FOREIGN KEY \(collector_id, organization_id\)[\s\S]*REFERENCES public\.collectors\(id, organization_id\)/iu);
    assert.doesNotMatch(migration, /CREATE TABLE public\.(proof|whatsapp_submissions)/iu);
  });

  it("creates a private MIME- and size-constrained proof bucket without public policies", async () => {
    const { migration } = await sql();
    assert.match(migration, /INSERT INTO storage\.buckets/iu);
    assert.match(migration, /'task-proof'[\s\S]*false[\s\S]*10485760/iu);
    assert.match(migration, /image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/iu);
    assert.doesNotMatch(migration, /CREATE POLICY[\s\S]*storage\.objects/iu);
    assert.doesNotMatch(migration, /public\s*=\s*true/iu);
  });

  it("keeps all workflow transitions and final submission creation transactional", async () => {
    const { migration } = await sql();
    for (const functionName of [
      "record_whatsapp_proof_prompt",
      "store_whatsapp_proof_photo",
      "store_whatsapp_proof_text",
      "submit_whatsapp_proof",
      "cancel_whatsapp_proof_workflow",
    ]) {
      assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}`, "u"));
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}[\\s\\S]*?FROM PUBLIC, anon, authenticated;`, "u"),
      );
      assert.match(
        migration,
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]*?TO service_role;`, "u"),
      );
    }
    const finalizer = migration.match(
      /CREATE OR REPLACE FUNCTION public\.submit_whatsapp_proof[\s\S]*?\$\$;/u,
    )?.[0] || "";
    assert.match(finalizer, /FOR UPDATE/iu);
    assert.match(finalizer, /INSERT INTO public\.submissions/iu);
    assert.match(finalizer, /UPDATE public\.tasks/iu);
    assert.match(finalizer, /UPDATE public\.whatsapp_sessions/iu);
    assert.match(finalizer, /INSERT INTO public\.task_events/iu);
    assert.match(finalizer, /UPDATE public\.whatsapp_webhook_events/iu);
  });

  it("stores only object paths and never stores provider media URLs or message bodies", async () => {
    const { migration } = await sql();
    assert.match(migration, /before_photo_path/iu);
    assert.match(migration, /after_photo_path/iu);
    assert.doesNotMatch(migration, /ADD COLUMN[^;]*(media_url|message_body)/iu);
    assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/iu);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO (anon|authenticated)/iu);
  });

  it("removes callable service-role access from the internal acceptance trigger", async () => {
    const { hardening } = await sql();
    assert.match(
      hardening,
      /REVOKE EXECUTE ON FUNCTION public\.start_whatsapp_proof_after_acceptance\(\)[\s\S]*FROM service_role;/iu,
    );
    assert.doesNotMatch(hardening, /GRANT|INSERT|UPDATE|DELETE|TRUNCATE/iu);
  });

  it("does not let a new assignment overwrite an active proof session", async () => {
    const { activeSessionProtection } = await sql();
    assert.match(activeSessionProtection, /assignment_status = 'accepted'/iu);
    assert.match(activeSessionProtection, /conversation_state IN[\s\S]*awaiting_before_photo[\s\S]*awaiting_after_photo[\s\S]*awaiting_details/iu);
    assert.match(activeSessionProtection, /RETURN QUERY SELECT 'collector_busy'/iu);
    assert.match(activeSessionProtection, /proof_step = NULL/iu);
  });

  it("accepts the authoritative photo conversation states without requiring proof_step", async () => {
    const { proofPhotoTransitionFix } = await sql();
    assert.match(
      proofPhotoTransitionFix,
      /p_photo_kind = 'before'[\s\S]*conversation_state <> 'awaiting_before_photo'[^;]*[\s\S]*before_photo_path IS NOT NULL/iu,
    );
    assert.match(
      proofPhotoTransitionFix,
      /SET before_photo_path = p_object_path,[\s\S]*conversation_state = next_state,[\s\S]*proof_step = NULL/iu,
    );
    assert.match(
      proofPhotoTransitionFix,
      /ELSE\s+IF target_session\.conversation_state <> 'awaiting_after_photo'[^;]*[\s\S]*before_photo_path IS NULL[\s\S]*after_photo_path IS NOT NULL/iu,
    );
    assert.match(
      proofPhotoTransitionFix,
      /next_state := 'awaiting_details'[^;]*;[\s\S]*SET after_photo_path = p_object_path,[\s\S]*proof_step = 'waste_type'/iu,
    );
    assert.doesNotMatch(
      proofPhotoTransitionFix,
      /target_session\.proof_step\s*(?:<>|=|IS)/iu,
    );
  });

  it("preserves photo transition guards, locking, idempotency, and tenant consistency", async () => {
    const { proofPhotoTransitionFix } = await sql();
    assert.match(proofPhotoTransitionFix, /processing_status = 'received'[\s\S]*FOR UPDATE/iu);
    assert.match(proofPhotoTransitionFix, /RAISE EXCEPTION 'webhook_event_not_claimed'/iu);
    assert.match(proofPhotoTransitionFix, /assignment_status <> 'accepted'/iu);
    assert.match(proofPhotoTransitionFix, /expires_at IS NULL[\s\S]*expires_at <= now\(\)/iu);
    assert.match(proofPhotoTransitionFix, /task\.organization_id = p_organization_id/iu);
    assert.match(proofPhotoTransitionFix, /task\.collector_id = p_collector_id/iu);
    assert.match(proofPhotoTransitionFix, /target_task\.status NOT IN[\s\S]*accepted[\s\S]*in_progress/iu);
    assert.match(proofPhotoTransitionFix, /before_photo_path IS NOT NULL/iu);
    assert.match(proofPhotoTransitionFix, /after_photo_path IS NOT NULL/iu);
    assert.match(proofPhotoTransitionFix, /invalid_proof_object_path/iu);
    assert.match(proofPhotoTransitionFix, /last_inbound_message_sid = p_inbound_message_sid/iu);
    assert.match(proofPhotoTransitionFix, /INSERT INTO public\.task_events/iu);
  });

  it("finalizes the webhook ledger with an unambiguous response and keeps execution service-role-only", async () => {
    const { proofPhotoTransitionFix } = await sql();
    assert.match(proofPhotoTransitionFix, /final_response_code text;/iu);
    assert.match(
      proofPhotoTransitionFix,
      /UPDATE public\.whatsapp_webhook_events[\s\S]*processing_status = 'recognized'[\s\S]*response_code = final_response_code/iu,
    );
    assert.doesNotMatch(proofPhotoTransitionFix, /response_code\s*=\s*response_code/iu);
    assert.match(proofPhotoTransitionFix, /RETURN QUERY SELECT final_response_code/iu);
    assert.match(proofPhotoTransitionFix, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/iu);
    assert.match(
      proofPhotoTransitionFix,
      /REVOKE ALL ON FUNCTION public\.store_whatsapp_proof_photo\(uuid, uuid, text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated;/iu,
    );
    assert.match(
      proofPhotoTransitionFix,
      /GRANT EXECUTE ON FUNCTION public\.store_whatsapp_proof_photo\(uuid, uuid, text, text, text\)[\s\S]*TO service_role;/iu,
    );
    assert.doesNotMatch(proofPhotoTransitionFix, /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+)?public\.(?:tasks|whatsapp_sessions|task_events|whatsapp_webhook_events)[\s\S]*VALUES\s*\([^)]*test/iu);
  });
});
