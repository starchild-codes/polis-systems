# WhatsApp integration: Stage 3 proof submission

Stage 3 extends the signed Twilio webhook after a collector accepts an assigned
task. It collects two private proof images and concise waste details, then
creates the existing organization-scoped `submissions` row used by Review.
Stage 4 (admin approval/rejection messages back to WhatsApp) is intentionally
out of scope.

## Workflow and persistence

1. `ACCEPT` changes the task to `accepted` and the session to
   `awaiting_before_photo`.
2. One valid BEFORE image is downloaded from Twilio and stored privately. The
   task changes to `in_progress`; the session advances to
   `awaiting_after_photo`.
3. One valid AFTER image is stored at a separate path. The existing
   `awaiting_details` conversation state is used with `proof_step` values
   `waste_type`, `waste_quantity`, and `notes`.
4. Notes accept free text or `SKIP` (stored as null).
5. `submit_whatsapp_proof` locks the webhook event, session, and task; verifies
   organization/collector/task consistency and both proof paths; inserts one
   pending submission; changes the task to `submitted`; changes the session to
   `submitted`; writes a `proof_submitted` task event; and finalizes the webhook
   ledger in one database transaction.

The existing unique constraint on `submissions.task_id` prevents a second
submission for the same task. Twilio `MessageSid` remains the inbound
idempotency key. Neither message bodies nor Twilio media URLs are stored.

## Media security

- Media is fetched only by the Vercel function using server-only
  `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` Basic authentication.
- Only HTTPS `api.twilio.com`, regional Twilio API hosts, and Twilio's media CDN
  are accepted. At most two redirects are followed, and every destination is
  checked against the same allowlist.
- Fetches time out after eight seconds. Both the declared Twilio MIME and the
  response `Content-Type` must agree and be JPEG, PNG, WebP, HEIC, or HEIF.
- Bodies are streamed under a 10 MiB maximum (or the lower server-only
  `WHATSAPP_MEDIA_MAX_BYTES` setting). HTML, executable, empty, mismatched, and
  oversized responses are rejected.
- Generated paths contain only organization, task, session, proof kind, and a
  random identifier:

  `organizations/{organization_id}/tasks/{task_id}/submissions/{session_id}/before-{random}.{ext}`

  `organizations/{organization_id}/tasks/{task_id}/submissions/{session_id}/after-{random}.{ext}`

- The `task-proof` bucket is private. No public object policy or public URL is
  created. A failed database transition removes the just-uploaded object where
  practical; CANCEL requests best-effort cleanup of any stored proof paths.

## Review access

`GET /api/review/submission-media?submissionId={uuid}` requires the signed-in
user's Supabase access token. The server resolves the user's active
organization and active admin/operator membership, looks up the submission
server-side, rejects cross-organization access, validates both object paths,
and returns five-minute signed URLs with `Cache-Control: no-store`.

The Review page still loads submissions through existing RLS and retains its
approve/reject behavior. It requests signed URLs only while a proof-bearing
submission drawer is open, shows loading/error states, and never displays a
permanent or public media URL. Legacy/manual submissions with absent or
unscoped paths remain reviewable and show a safe unavailable-proof state.

## Commands while proof is active

- `HELP` repeats only the current expected step.
- `CANCEL` closes the active proof workflow and records an audit event.
- `ACCEPT` and `DECLINE` do not restart or change an active proof workflow.
- Text during a photo step and media during a text step receive the current
  concise recovery prompt.

## Environment

Existing server-only variables are reused:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional: `WHATSAPP_MEDIA_MAX_BYTES=10485760`. It must never use a `VITE_`
prefix.

## Manual end-to-end test plan

1. Create and assign a disposable test task to a registered Sandbox collector.
2. Send **WhatsApp Assignment** from the task drawer.
3. Reply `ACCEPT`.
4. Confirm the BEFORE-photo prompt is received.
5. Send one BEFORE image.
6. Verify one object exists privately in `task-proof` at the expected
   organization/task/session path and the task is `in_progress`.
7. Send one AFTER image.
8. Reply with a waste type such as `mixed plastic and paper`.
9. Reply with a quantity such as `12 kg` or `3 bags`.
10. Send final notes or `SKIP`.
11. Verify exactly one `public.submissions` row exists with both private paths,
    waste details, `review_status = pending`, and the correct organization,
    task, and collector.
12. Verify the related task is `submitted` and the session is `submitted`.
13. Open Review and confirm the submission appears without changing its data.
14. Open the drawer and confirm both images load through short-lived signed
    URLs.
15. Sign in as a user from another organization and confirm both the submission
    and direct signed-URL request are unavailable.
16. Replay a captured inbound `MessageSid` in a controlled test and confirm no
    second object, submission, state transition, or task event is created.
17. Verify `task_events` contains the proof audit trail and every successful
    inbound step has one finalized `whatsapp_webhook_events` row.

Delete the disposable test task/submission and its proof objects only through
the organization's normal authorized cleanup process after verification.
