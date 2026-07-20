import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260720150000_add_whatsapp_assignment_workflow.sql",
  import.meta.url,
);
const baselineUrl = new URL(
  "../../supabase/migrations/20260720110000_production_schema_baseline.sql",
  import.meta.url,
);

async function loadSql() {
  const [migration, baseline] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(baselineUrl, "utf8"),
  ]);
  return { migration, baseline };
}

describe("WhatsApp assignment migration contract", () => {
  it("preserves organization consistency and one session per collector", async () => {
    const { migration, baseline } = await loadSql();
    assert.match(baseline, /UNIQUE \(collector_id\)/);
    assert.match(
      baseline,
      /FOREIGN KEY \(collector_id, organization_id\)[\s\S]*REFERENCES public\.collectors\(id, organization_id\)/,
    );
    assert.match(
      baseline,
      /FOREIGN KEY \(task_id, organization_id\)[\s\S]*REFERENCES public\.tasks\(id, organization_id\)/,
    );
    assert.doesNotMatch(migration, /DROP CONSTRAINT whatsapp_sessions_collector_id_unique/i);
  });

  it("keeps ACCEPT and DECLINE in one transactional database function", async () => {
    const { migration } = await loadSql();
    const functionSql = migration.match(
      /CREATE OR REPLACE FUNCTION public\.process_whatsapp_task_response[\s\S]*?\$\$;/,
    )?.[0] || "";
    assert.match(functionSql, /FOR UPDATE/);
    assert.match(functionSql, /UPDATE public\.tasks/);
    assert.match(functionSql, /UPDATE public\.whatsapp_sessions/);
    assert.match(functionSql, /INSERT INTO public\.task_events/);
    assert.match(functionSql, /UPDATE public\.whatsapp_webhook_events/);
    assert.match(functionSql, /'accepted'::public\.task_status/);
    assert.match(functionSql, /'declined'::public\.task_status/);
  });

  it("cancels a pending session when a task is reassigned or leaves assigned status", async () => {
    const { migration } = await loadSql();
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.cancel_stale_whatsapp_assignment_session/);
    assert.match(migration, /OLD\.collector_id IS DISTINCT FROM NEW\.collector_id/);
    assert.match(migration, /NEW\.status <> 'assigned'::public\.task_status/);
    assert.match(migration, /CREATE TRIGGER cancel_stale_whatsapp_assignment_session/);
  });

  it("restricts every new RPC to service_role", async () => {
    const { migration } = await loadSql();
    const functions = [
      "prepare_whatsapp_task_assignment",
      "complete_whatsapp_task_assignment",
      "fail_whatsapp_task_assignment",
      "process_whatsapp_task_response",
    ];
    for (const functionName of functions) {
      assert.match(
        migration,
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}[\\s\\S]*?FROM PUBLIC, anon, authenticated;`),
      );
      assert.match(
        migration,
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]*?TO service_role;`),
      );
    }
  });

  it("does not disable RLS or store message bodies and media URLs", async () => {
    const { migration, baseline } = await loadSql();
    assert.match(baseline, /ALTER TABLE public\.whatsapp_sessions ENABLE ROW LEVEL SECURITY/);
    assert.match(baseline, /ALTER TABLE public\.tasks ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(migration, /DISABLE ROW LEVEL SECURITY/i);
    assert.doesNotMatch(migration, /message_body|media_url/i);
    assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]*TO authenticated/i);
  });
});
