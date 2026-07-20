# WhatsApp integration: Stage 1 inbound webhook

Stage 1 adds a secure Twilio WhatsApp Sandbox webhook that identifies whether
an inbound sender is a registered Polis collector. It does not assign tasks,
interpret commands, download media, create submissions, or change task status.

## Architecture and route

The existing application is a Vite/React single-page application hosted on
Vercel. The webhook is an isolated Vercel Node.js function:

- Route: `POST /api/twilio/whatsapp`
- Production URL format: `https://<your-production-domain>/api/twilio/whatsapp`
- Current Vercel-domain format: `https://polis-systems.vercel.app/api/twilio/whatsapp`
- Request content type: `application/x-www-form-urlencoded`
- Response content type: `application/xml; charset=utf-8` (TwiML)

The route is not live until this branch is deployed and its migration and
server-only environment variables are configured.

## Required server-only environment variables

Configure these in Vercel Project Settings → Environment Variables. Select the
intended Preview/Production environments and redeploy that environment after
adding them. Never expose or paste their values into frontend code.

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (for the Sandbox, use the sender shown by Twilio)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

None of these variables may be prefixed with `VITE_`. Values in `.env.example`
are placeholders only.

## Database migration and idempotency

Apply `20260720120000_add_whatsapp_webhook_events.sql` through the normal,
reviewed Supabase migration workflow before enabling the webhook. Do not reset
or seed the database. The table stores only:

- the unique Twilio `MessageSid` idempotency key;
- processing state and a short safe error code;
- whether media metadata was present;
- the matched collector and organization, when unambiguous.

It does not store message bodies or media URLs. RLS remains enabled, and `anon`
and `authenticated` receive no table privileges. The server-side service role
has only the SELECT, INSERT, and UPDATE privileges needed by this endpoint.

`public.whatsapp_sessions.last_message_sid` was not reused: that table owns
conversation state and has one row per collector, so it cannot safely record
unregistered messages or every independent Twilio delivery.

## Collector phone matching and tenant safety

`From` is normalized by removing `whatsapp:`, removing allowed display
formatting, and returning a plus-prefixed international value. A country code
is never inferred or prepended. For example, `919000000001` becomes
`+919000000001`; a local number must not be supplied without its country code.

The repository schema enforces collector phones with
`^\+[1-9][0-9]{7,14}$`, so migration-compliant rows are already canonical.
Before enabling the webhook against a database whose migration history is
uncertain, an administrator can audit without returning phone values:

```sql
SELECT count(*) AS invalid_collector_phone_count
FROM public.collectors
WHERE phone_e164 !~ '^\+[1-9][0-9]{7,14}$';
```

The organization ID is accepted only from the matched collector row. Body,
query, and header values cannot choose an organization. Because collector phone
uniqueness is scoped per organization, a number duplicated across two
organizations is deliberately treated as an internal ambiguity and no tenant
is selected.

## Twilio Sandbox setup

1. In Twilio Console, open Messaging → Try it out → Send a WhatsApp message.
2. Follow the displayed Sandbox instructions. From the tester's WhatsApp
   account, send the displayed `join <sandbox-code>` message to the Sandbox
   sender. Do not hard-code the tester number in Polis.
3. Open Sandbox settings.
4. Set **When a message comes in** to the deployed HTTPS webhook URL above.
5. Set the request method to **POST** and save.
6. Ensure a collector row uses the tester's canonical international number if
   testing the registered path.
7. Send a normal WhatsApp message to the Sandbox sender.

A uniquely registered collector receives:

> Welcome to Polis Systems. WhatsApp setup is working.

An unregistered sender receives:

> This number is not registered with Polis Systems. Please contact your organization administrator.

## Signature validation

Every request is checked with the official Twilio SDK and
`X-Twilio-Signature`. Missing or invalid signatures receive HTTP 403. The
validator reconstructs the exact public URL from Vercel's forwarded protocol
and host plus the request path and query string. This supports `vercel.app` and
custom domains without a hard-coded production host.

If the Twilio Console URL and the public URL seen through a proxy differ in
scheme, host, path, or query string, validation will correctly fail. Do not
disable signature validation to work around proxy configuration.

## Local testing

Use `vercel dev`, not only `vite`, so the `/api` function is available. Put
development secrets in an ignored local environment file or the Vercel CLI
environment; never commit them. Expose the local function through a trusted
HTTPS tunnel and configure Twilio with the tunnel's exact URL. Forwarded host
and protocol headers must describe that public tunnel URL. Signature validation
remains enabled locally.

Run automated checks with:

```sh
npm run typecheck
npm test
npm run build
```

## Stage 1 limitations

- No outbound task assignment or production WhatsApp sender registration.
- No ACCEPT/DECLINE commands or task status changes.
- Media presence is detected, but files are not downloaded or stored.
- No proof submission or Review workflow changes.
- No message bodies or media URLs are retained.
- A sender number present in multiple organizations fails closed until the data
  is disambiguated by an approved future design.
