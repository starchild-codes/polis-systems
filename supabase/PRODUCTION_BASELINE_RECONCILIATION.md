# Production schema baseline reconciliation

Reviewed on 2026-07-20 against Supabase project
`uykylkdnzeyfmiefxcfk`. Production was queried read-only and was not modified.

## Baseline contents

`migrations/20260720110000_production_schema_baseline.sql` is the schema-only
snapshot of the current production `public` schema. It assumes a normal
Supabase database where the built-in roles and `auth` schema already exist.

It includes:

- 8 enums: `actor_type`, `collector_status`, `organization_role`,
  `review_status`, `task_priority`, `task_status`, `user_role`, and
  `whatsapp_conversation_state`;
- 9 RLS-enabled tables: `profiles`, `organizations`,
  `organization_members`, `zones`, `collectors`, `tasks`, `submissions`,
  `task_events`, and `whatsapp_sessions`;
- all 101 columns, defaults, 38 constraints (including composite foreign
  keys), and 37 indexes currently present in production;
- 15 functions, including organization authorization helpers, signup profile
  creation, membership management, safe task/collector deletion, safe review,
  tenant/actor trigger helpers, standard-zone creation, and `set_updated_at`;
- 12 application triggers, including `auth.users.on_auth_user_created` and the
  organization standard-zone trigger;
- all 28 current organization-scoped RLS policies;
- the current table, column, and function grants/revocations for `anon`,
  `authenticated`, and `service_role`.

The baseline is followed chronologically by
`migrations/20260720120000_add_whatsapp_webhook_events.sql`; that migration has
not been applied to production.

## Data handling

The baseline intentionally creates no rows. It excludes production Auth users,
profiles, organizations, memberships, zones, collectors, tasks, submissions,
task events, WhatsApp sessions, tokens, passwords, and secrets. It also excludes
the historical test operator, organization-specific backfills, Bengaluru pilot
descriptions, and all operational seed data.

The only required bootstrap behavior is schema-level:

- an inserted Auth user receives a `pending` profile through
  `on_auth_user_created`;
- a newly inserted organization receives North, South, East, West, and Central
  zones through `on_organization_created_seed_zones`.

No separate seed file is required.

## Disposable validation

The baseline and WhatsApp migration were applied, in order, to a fresh
PostgreSQL 17-compatible PGlite database scaffolded with Supabase's `auth`
schema and `anon`, `authenticated`, and `service_role` roles. The validation
confirmed:

- both migrations execute from an empty application schema;
- the baseline creates 9 tables, 8 enums, 15 functions, 38 constraints,
  37 indexes, 28 policies, and 12 triggers;
- all baseline tables have RLS enabled and none has forced RLS;
- all foreign keys and functions compile;
- the baseline creates zero rows;
- the signup trigger creates a pending profile;
- each new organization receives exactly five standard zones;
- `profiles.active_organization_id` rejects a value without a matching
  `(organization_id, user_id)` membership;
- a collector phone can be reused across organizations but not duplicated
  within one organization;
- after the WhatsApp migration there are 10 public tables;
- `whatsapp_webhook_events` has RLS enabled, neither client role has access,
  and `service_role` has SELECT/INSERT/UPDATE but not DELETE;
- the WhatsApp SID unique constraint, collector/organization composite foreign
  key, and collector-scope check are present;
- all validation rows were rolled back, leaving zero rows.

The official `supabase db dump` and `supabase db reset` commands require Docker.
Docker is not installed in the validation environment, so those two CLI-backed
checks could not run. The in-memory database starts empty on every validation
run, providing the migration-reset behavior without touching production.

## Baseline-versus-production comparison

Catalog inventories were generated independently from production and from the
disposable database immediately after the baseline. Object counts and canonical
JSON fingerprints match in every reviewed category:

| Category | Count | Fingerprint |
| --- | ---: | --- |
| columns | 101 | `e0ce85ffc092c77b9daba31fcc9f4300` |
| constraints | 38 | `5f3019891622653bce4bbe567eca1ee1` |
| enums | 8 | `360a50934fe4788bdb006f84fd3ab797` |
| functions | 15 | `5613d2922b10367dfa44431c2a4ffb34` |
| indexes | 37 | `dd130eb403117eb4136d3ca850f77ad5` |
| policies | 28 | `477a3ca81ae041e8d7de893e34c01c53` |
| tables/RLS state | 9 | `d7f48d28b29ae5f0879baa05ee5b8403` |
| triggers | 12 | `5a79ab89a90b0e94f42b14f98231e592` |
| table privileges | 89 | `cdcfa1a631657305c163c8ad173882c4` |
| column privileges | 667 | `6b07030ce2825f12c910f36577de1df6` |
| function privileges | 28 | `eaec8822bec722b9b4cb70be6d868e62` |

Remaining baseline-versus-production schema differences: **none in the
reviewed public-schema catalog**. Production data and Supabase-managed internal
schemas were deliberately outside the comparison scope. The WhatsApp table is
an intentional post-baseline addition and is not part of the production match.

## Known security drift

The baseline represents production exactly. Corrections must be separate so a
baseline-history repair cannot silently change production.

| Item | Baseline treatment | Recommendation |
| --- | --- | --- |
| `prevent_role_self_escalation()` absent | A: remain absent | B: add later as defense in depth after review. Current column-level UPDATE grant already prevents authenticated users from updating `role`. |
| `profiles_block_role_escalation` absent | A: remain absent | B: add with the function in the same later security migration. |
| `profiles_set_updated_at` absent | A: remain absent | C: non-material because `trg_profiles_updated_at` provides the equivalent behavior. |
| `set_updated_at()` has no pinned `search_path` | A: reproduce exactly | B: pin `search_path` in a later corrective migration. |
| `set_updated_at()` executable by PUBLIC, `anon`, and `authenticated` | A: reproduce exactly | B: revoke unnecessary direct execution in that same corrective migration. |

## Proposed production reconciliation (do not run without approval)

From this repository and only after reviewing the branch:

```powershell
npx supabase link --project-ref uykylkdnzeyfmiefxcfk
Get-Content -LiteralPath supabase/.temp/project-ref
npx supabase migration repair 20260720110000 --status applied --linked
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

The dry run must show only
`20260720120000_add_whatsapp_webhook_events.sql`. Only then, under a separate
approved production-change task:

```powershell
npx supabase db push --linked
```

Afterward, query `pg_class`, `pg_constraint`, `pg_indexes`, and table privileges
to verify the WhatsApp table, RLS, constraints, index, and service-role-only
access.

## `config.toml`

`supabase/config.toml` still contains the stale ref `elogmjdxfqrwrclocknj`, while
the CLI link in `supabase/.temp/project-ref` is the confirmed production ref
`uykylkdnzeyfmiefxcfk`. If this tracked config is intended to represent
production, update `project_id` to the confirmed ref in a separately approved
change. It is intentionally unchanged in this baseline branch until that intent
is confirmed.
