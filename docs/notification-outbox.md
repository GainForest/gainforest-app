# Notification outbox operations

GainForest sends signup, organization-membership, invitation, and BioBlitz winner emails through one private durable outbox. Application routes commit notification intent before attempting delivery. A failed immediate attempt remains recoverable by the scheduled drain.

## Safety defaults

All delivery is off unless explicitly enabled:

```dotenv
EMAIL_DELIVERY_MODE=disabled
EMAIL_SIGNUP_ENABLED=false
EMAIL_MEMBERSHIP_JOINED_ENABLED=false
EMAIL_INVITATION_ENABLED=false
EMAIL_BIOBLITZ_WINNER_ENABLED=false
```

`disabled` does not enqueue welcome or BioBlitz notifications and does not claim existing rows. Invitations still commit while their producer is off, but the UI tells the moderator to share the invitation link directly.

`capture` uses process-local memory. It never contacts Resend, but it is not durable across process restarts and must not be treated as a delivery environment.

`resend` requires `RESEND_API_KEY`. `EMAIL_FROM` must be a verified single-line sender. Every provider request uses the outbox row UUID as its idempotency key. Resend idempotency is conservatively treated as 23 hours 55 minutes within its documented 24-hour window; ambiguous sends stop after the stored deadline rather than risk a duplicate. An explicit HTTP 408 response is retryable, while a transport timeout with no authoritative response remains ambiguous.

## Database prerequisites and migration order

The outbox migration requires these existing private tables in the same Supabase project and fails immediately with an actionable prerequisite error when either table or a required column is absent:

- `public.cgs_group_invitations` from `docs/cgs-group-invitations.sql`;
- `public.user_emails` from `docs/user-emails.sql`.

For a new environment:

1. Apply the invitation and user-email prerequisites.
2. Apply `supabase/migrations/20260805235500_notification_outbox.sql`.
3. Verify browser roles cannot select the table or execute its RPCs.
4. Deploy application code with delivery mode and every producer disabled.
5. Configure and verify the authenticated recovery call.
6. Enable one producer in `capture`, compare its frozen request with the existing production template, then disable it again.
7. Set `resend` and enable one producer at a time only after review.

Do not apply this migration to a remote environment without an approved deployment window and rollback plan.

## Local validation

The fast database contract uses a disposable local PostgreSQL container and refuses remote Docker endpoints or image pulls:

```bash
pnpm test:db
pnpm test:unit
pnpm build
```

The database suite covers token ownership, concurrent claims, immutable frozen requests, provider ambiguity, invitation atomicity, cancellation/acceptance suppression, BioBlitz manual handling, retention, and aggregate health.

For a full local application smoke test, run:

```bash
pnpm test:notifications:local
```

This command requires Docker, `psql`, `curl`, and `flock`. It uses the tracked Supabase CLI version and the reserved `bumicerts-notification-smoke` project ID. It refuses remote Docker, serializes runs across terminals and worktrees, starts a minimal local Supabase/PostgREST stack, applies the invitation and private-email prerequisites before the outbox migration, runs Next.js on loopback port `3055` in `capture` mode, and verifies:

- browser table/RPC denial and the intended service-role privilege matrix;
- signed signup and organization-membership webhooks;
- complete frozen requests and exact-event deduplication;
- transactional invitation creation and authenticated drain recovery;
- BioBlitz private-email resolution and captured winner delivery; and
- missing-email waiting followed by moderator manual suppression.

The first run may download the pinned local Supabase Docker images. Supabase CLI 2.111 publishes its local API and database ports on all host interfaces; run this disposable stack only on a trusted network or a host firewall that blocks inbound access to ports `54321` and `54322`. Next.js itself binds only to `127.0.0.1`. The command stops Next.js and deletes only its reserved Supabase volumes on completion, and reports a failure if cleanup does not finish. Set `KEEP_NOTIFICATION_LOCAL_STACK=1` to retain the local database for inspection, or `NOTIFICATION_LOCAL_APP_PORT=<port>` if `3055` is occupied. The Next.js process still stops when retaining the database; use `pnpm exec supabase status -o env` to retrieve the local connection details.

The full smoke test does not call Resend, production Supabase, the production indexer, or production auth/CGS services. Invitation and BioBlitz fixtures enter through local PostgREST RPCs because their public product routes require real authenticated CGS/moderator state. The production worker and renderer paths, invitation source check, BioBlitz recipient resolution, and authenticated drain are exercised unchanged; authoritative BioBlitz award lookup is intentionally bypassed.

No test should use a production Supabase URL, production service-role key, Resend key, or real recipient.

## cron-job.org recovery

Create a random server-only secret of at least 16 characters:

```dotenv
NOTIFICATION_CRON_SECRET=replace-with-a-long-random-value
```

Configure cron-job.org to call every five minutes:

```text
GET https://<app-host>/api/internal/notifications/drain
Authorization: Bearer <NOTIFICATION_CRON_SECRET>
```

The route:

- rejects a missing server secret before constructing the runtime;
- uses a constant-time bearer comparison;
- starts no new recent-award reconciliation work after its ten-second budget and handles at most twenty candidates; an enqueue already started is allowed to finish before queue draining begins;
- reconciles recent canonical BioBlitz awards without recalculating winners;
- cleans retention-expired rows;
- processes at most 20 rows with concurrency at most four;
- stops before the invocation deadline;
- returns aggregate counts only.

No cron job was configured as part of implementation. Creating it is an external production action and requires explicit approval.

## Monitoring

A successful drain response contains:

```json
{
  "kind": "completed",
  "claimed": 4,
  "outcomes": { "sent": 3, "requeued": 1 },
  "cleanup": { "activeExpired": 0, "redacted": 2, "deleted": 0 },
  "reconciliation": { "candidates": 1, "completed": true },
  "health": {
    "waitingRecipient": 0,
    "queued": 1,
    "processing": 0,
    "dead": 0,
    "oldestDueAgeSeconds": 18
  }
}
```

Alert on:

- any non-2xx recovery response;
- `reconciliation.completed=false` in consecutive runs;
- increasing `dead` count;
- `oldestDueAgeSeconds` above two cron intervals;
- queued/waiting counts that increase across several runs;
- repeated `released_insufficient_time` or `unexpectedFailure` outcomes.

Responses and structured logs never include recipient email, payload, frozen content, provider bodies, secrets, or signatures.

## Rollback

Application rollback is configuration-first:

1. Set all producer flags to `false`.
2. Set `EMAIL_DELIVERY_MODE=disabled` to stop claims and provider calls.
3. Keep the recovery route secret configured but pause cron-job.org only with explicit approval.
4. Investigate queued rows using aggregate health and private service-role tooling.
5. Do not drop the table or reverse the migration while active or retained rows exist.

Rows persist their original `capture` or `resend` mode. Changing the global mode never converts an existing row into a different delivery mode.

## Invitation and BioBlitz operator behavior

Invitation creation and notification enqueue share one transaction. Email failure never removes the invitation. Owners and eligible admins can expedite a safe queued/rejected email; the database enforces a one-minute cooldown and rejects sent, processing, ambiguous, or immutable-invalid work. Acceptance, cancellation, and expiry suppress unsent delivery. An invitation created while delivery is disabled is never retroactively emailed by submitting the same invitation again after enablement; remove it and create a new invitation if an email should be sent.

Both BioBlitz prize badges are attempted before any notification lookup or provider work begins. Notification preparation commits deterministic outbox work, and provider processing runs through Next.js `after()` with cron as recovery. Missing private email or setup failure is shown to the moderator immediately. **Mark handled manually** records the first moderator and leaves a suppression tombstone so reconciliation cannot send later. It refuses a provider call already in flight.

## Release notes

- Signup and organization-membership welcome emails now recover durably after temporary delivery failures.
- Organization invitations remain valid when email delivery is delayed, show a safe retry or copy-link action, and never change recipient or content across retries.
- BioBlitz winner badges no longer wait on email delivery; moderators are warned when an address is missing or notification setup fails.
- Delivery remains disabled until the migration, recovery call, sender, provider credentials, and individual producer flags are deliberately enabled.

## Retention

- active rows stop after seven days;
- sent content is redacted seven days after completion;
- dead content is redacted fourteen days after completion;
- retained identities are deleted ninety days after creation;
- `user_emails` is separate private account data and is not changed by outbox cleanup.
