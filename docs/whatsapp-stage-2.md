# WhatsApp integration: Stage 2 task acceptance

Stage 2 adds an explicit outbound task-assignment action and handles collector
`ACCEPT` / `DECLINE` replies. It does not download media, create submissions,
or implement proof-of-work and Review decisions.

## Routes and security

- `POST /api/twilio/assign-task` is an authenticated Vercel function. The
  browser sends only the current Supabase bearer token and a task ID.
- The function resolves the user, active profile organization, membership,
  task, collector, and collector phone server-side. Browser-supplied
  organization and collector IDs are never accepted.
- `POST /api/twilio/whatsapp` retains Twilio signature validation and inbound
  MessageSid idempotency.
- Server-only Supabase and Twilio credentials remain outside the Vite bundle.

Organization admins and operators with an active membership may send a task
that is currently `assigned`. The task's collector must belong to the same
organization and have a canonical E.164 phone number.

## Outbound delivery

The Tasks drawer exposes **Send WhatsApp Assignment** only for assigned tasks.
It is disabled when the assigned collector cannot be resolved with a valid
phone. Sending is explicit; task creation, editing, assignment, and
reassignment do not automatically contact Twilio.

The free-form message includes only populated task labels and never includes an
internal UUID. If `TWILIO_TASK_ASSIGNMENT_CONTENT_SID` is configured, the
server uses that approved Twilio Content Template and supplies these variables:

1. task title
2. zone
3. location
4. due date/time
5. priority

Do not prefix this optional variable with `VITE_`.

The transactional preparation function maintains one session per collector,
reuses that row safely, and refuses to send a second message for the same
active assignment. A prepared session expires after 48 hours. A Twilio send
failure cancels a session that has not received an outbound MessageSid.

## Inbound commands

Commands are trimmed and compared case-insensitively:

- `ACCEPT` atomically changes the task from `assigned` to `accepted`, records
  the session decision and inbound MessageSid, updates the webhook ledger, and
  inserts a collector task event.
- `DECLINE` performs the same transaction with task status `declined`.

The confirmation is returned only after the transaction succeeds. Expired,
cancelled, completed, missing, cross-organization, or otherwise unavailable
sessions cannot change a task. The function fails closed if database state is
ambiguous. Duplicate Twilio deliveries return the previously recorded response
without applying the task transition again.

## Required migration

Apply only after a linked dry run confirms it is the sole pending migration:

`20260720150000_add_whatsapp_assignment_workflow.sql`

The migration adds assignment status/expiry/MessageSid fields to the existing
session table, adds a short response code to the existing webhook ledger, and
creates service-role-only transactional RPCs. It does not add message-body or
media-URL storage, disable RLS, or grant RPC execution to browser roles.

## Twilio Sandbox limitations

- A tester must first join the Twilio WhatsApp Sandbox from the same number
  stored on the collector.
- Free-form outbound messages normally require an open 24-hour user-initiated
  conversation window.
- Business-initiated delivery may require a Sandbox-supported or approved
  Content Template. Configure its SID through
  `TWILIO_TASK_ASSIGNMENT_CONTENT_SID`; never hard-code it.
- Sandbox success does not by itself prove production sender registration or
  production template approval.

## Manual test plan

1. Create a task or assign an existing draft to a joined Sandbox collector.
2. Open the task and select **Send WhatsApp Assignment**.
3. Verify exactly one assignment message arrives with the populated task data.
4. Reply `ACCEPT` and verify the confirmation, task status `accepted`, session
   status `accepted`, and one matching collector `task_events` row.
5. Create and send another assigned test task.
6. Reply `DECLINE` and verify the task/session/event state is `declined`.
7. Send a non-command while an assignment is awaiting response and verify the
   ACCEPT/DECLINE prompt.
8. Replay the same inbound MessageSid in a controlled endpoint test and verify
   no second transition or task event is created.
9. Let or set a session to expire and verify it cannot update the task.
10. With a user from another organization, verify the task is not visible and
    direct assignment endpoint access returns a safe authorization error.

## Stage 3

Stage 3 can add before/after photo collection, media retrieval and storage,
submission creation, quantity/waste details, and Review workflow integration.
Those concerns are intentionally absent from Stage 2.
