# WhatsApp Stage 4: review outcome notifications

Stage 4 sends the result of an existing Review decision to the submission's
collector without coupling the database decision to Twilio availability.

## Architecture

- `POST /api/review/decision` authenticates the reviewer, resolves the active
  organization, validates an active admin/operator membership, and invokes the
  service-role-only transactional review RPC.
- The RPC locks the pending submission and task, saves the decision, updates the
  task, records the existing task event, and creates one private outbox row in
  the same transaction.
- Twilio delivery is attempted only after that transaction commits. A delivery
  error marks the outbox row failed but never reverses the review.
- `POST /api/review/retry-whatsapp-notification` safely claims a failed or
  pending organization-scoped outbox row. Sent or concurrently claimed rows
  cannot be sent again, and each row is capped at five attempts.

The outbox stores no message body and no collector phone number. The sender
resolves both delivery context and the canonical phone server-side when the row
is claimed.

## Server configuration

The existing server-only variables remain required:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional approved Twilio Content Templates:

- `TWILIO_REVIEW_APPROVED_CONTENT_SID`
  - variable `1`: task title
- `TWILIO_REVIEW_REJECTED_CONTENT_SID`
  - variable `1`: task title
  - variable `2`: rejection reason

The approved rejected-outcome template must render both variables in a visible
message body. Its body contract is:

```text
Polis Systems Update

Your proof for “{{1}}” was not approved.

Reason: {{2}}

Please contact your organization administrator for next steps.
```

Before a rejected template is sent, the server fetches its Content resource and
verifies that visible body text contains both `{{1}}` and `{{2}}`. If variable
`2` is missing, the review remains saved, the outbox becomes retryable with the
safe `rejection_template_missing_reason_variable` code, and no reasonless
message is sent. Correct the approved template or configure a replacement SID,
then use the existing deliberate Retry action. The SID itself is never logged.

Do not hard-code Content SIDs. Without the appropriate ContentSid, free-form
delivery is attempted only when the collector's latest WhatsApp interaction is
within the 24-hour customer-service window. Outside that window the review is
saved and the outbox row is marked failed with the safe `template_required`
code until configuration is corrected and an operator deliberately retries.

## Workflow behavior

- Approval sends the task title and a concise completion acknowledgement.
- Rejection requires a trimmed reason of at most 500 characters. The reason is
  stored on the submission and included in the rejected template/free-form
  message.
- Rejection does not reopen proof collection. The submitted WhatsApp session is
  left closed because the current product has no transactional resubmission
  workflow.
- The UI reports review persistence separately from WhatsApp delivery and shows
  Retry only for retryable failures.

## Manual end-to-end verification

Approval:

1. Complete a collector proof submission and open it in Review.
2. Approve the pending submission.
3. Verify `submissions.review_status = approved`, reviewer/timestamp fields,
   the related task status, and one `submission_approved` task event.
4. Verify exactly one `submission_approved` outbox row exists and becomes sent.
5. Confirm the collector receives one WhatsApp approval message.
6. Refresh and confirm the finalized review cannot send a duplicate.

Rejection:

1. Complete a second proof submission.
2. Reject it with a real reason of 500 characters or fewer.
3. Verify the rejected submission/task, stored reason, reviewer/timestamp, and
   one `submission_rejected` task event.
4. Verify exactly one rejected outbox row and one received WhatsApp message with
   the correct reason.
5. To test Retry, deliberately use a non-deliverable sandbox recipient or omit
   the required template outside the 24-hour window, correct the condition, and
   retry once from Review.

Multi-tenant:

1. Sign in as an admin/operator from another organization.
2. Confirm the foreign submission cannot be reviewed.
3. Confirm its notification cannot be claimed or retried and no rejection or
   delivery metadata is returned.

## Twilio Sandbox limitations

Sandbox recipients must join the sandbox before they can receive messages.
Free-form messages outside the customer-service window are rejected by Twilio;
production business-initiated outcomes require approved Content Templates.
Template wording and variables must match the SIDs configured in the deployment.

## Review troubleshooting

An already-open browser tab from before Stage 4 may still contain the retired
client-side `review_submission_safely` call. That RPC is intentionally no
longer executable by `authenticated`, so the stale tab can show a raw
permission-denied error. Reload the page to obtain the current bundle, which
uses `POST /api/review/decision`; do not restore client RPC privileges.

Submission quantity is authoritative in `submissions.quantity_estimate` and is
free text so units such as `kg`, `bags`, or `litres` are preserved. Review shows
that value in both the queue and detail drawer and uses `Quantity not provided`
for blank historical rows.
