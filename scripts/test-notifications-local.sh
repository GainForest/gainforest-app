#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

[[ $# == 0 ]] || { echo "usage: pnpm test:notifications:local" >&2; exit 2; }
command -v docker >/dev/null || { echo "test:notifications:local requires Docker" >&2; exit 2; }
command -v psql >/dev/null || { echo "test:notifications:local requires psql" >&2; exit 2; }
command -v curl >/dev/null || { echo "test:notifications:local requires curl" >&2; exit 2; }
command -v flock >/dev/null || { echo "test:notifications:local requires flock" >&2; exit 2; }

if [[ -n "${DOCKER_HOST:-}" ]]; then
  DOCKER_ENDPOINT=$DOCKER_HOST
else
  DOCKER_CONTEXT_NAME=${DOCKER_CONTEXT:-}
  if [[ -z "$DOCKER_CONTEXT_NAME" ]]; then
    DOCKER_CONTEXT_NAME=$(docker context show 2>/dev/null) || DOCKER_CONTEXT_NAME=""
  fi
  [[ -n "$DOCKER_CONTEXT_NAME" ]] || { echo "test:notifications:local could not resolve the Docker context" >&2; exit 2; }
  DOCKER_ENDPOINT=$(docker context inspect "$DOCKER_CONTEXT_NAME" --format '{{ (index .Endpoints "docker").Host }}' 2>/dev/null) || {
    echo "test:notifications:local could not inspect Docker context '$DOCKER_CONTEXT_NAME'" >&2
    exit 2
  }
fi
case "$DOCKER_ENDPOINT" in
  unix:///*) ;;
  *)
    echo "test:notifications:local refuses non-local Docker endpoint '$DOCKER_ENDPOINT'" >&2
    exit 2
    ;;
esac

docker info >/dev/null 2>&1 || { echo "test:notifications:local requires a running local Docker daemon" >&2; exit 2; }
pnpm exec supabase --version >/dev/null 2>&1 || {
  echo "test:notifications:local requires the project-local Supabase CLI dependency" >&2
  exit 2
}
[[ -f supabase/config.toml ]] || {
  echo "test:notifications:local requires supabase/config.toml; initialize the tracked local stack first" >&2
  exit 2
}

for section in realtime studio local_smtp storage edge_runtime analytics; do
  awk -v section="$section" '
    $0 == "[" section "]" { found=1; next }
    /^\[/ && found { exit }
    found && $0 == "enabled = false" { disabled=1 }
    END { exit !(found && disabled) }
  ' supabase/config.toml || {
    echo "test:notifications:local requires [$section] enabled = false to keep the stack minimal" >&2
    exit 2
  }
done

awk '
  $0 == "[db.migrations]" { found=1; next }
  /^\[/ && found { exit }
  found && $0 == "enabled = false" { disabled=1 }
  END { exit !(found && disabled) }
' supabase/config.toml || {
  echo "test:notifications:local requires [db.migrations] enabled = false so prerequisites are applied first" >&2
  exit 2
}

PROJECT_ID=$(awk -F ' = ' '$1 == "project_id" { gsub(/"/, "", $2); print $2; exit }' supabase/config.toml)
[[ -n "$PROJECT_ID" ]] || { echo "test:notifications:local could not read project_id from supabase/config.toml" >&2; exit 2; }
[[ "$PROJECT_ID" == "bumicerts-notification-smoke" ]] || {
  echo "test:notifications:local requires the reserved disposable project_id bumicerts-notification-smoke" >&2
  exit 2
}

LOCK_FILE="${XDG_RUNTIME_DIR:-/tmp}/bumicerts-notification-smoke.${UID}.lock"
exec 9>"$LOCK_FILE"
flock -n 9 || {
  echo "test:notifications:local is already running for $PROJECT_ID; wait for the other run to finish" >&2
  exit 2
}

TMP=$(mktemp -d)
STACK_TOUCHED=false
APP_PID=""
RESEND_PID=""
cleanup() {
  local original_status=$?
  local cleanup_failed=false
  trap - EXIT
  set +e

  if [[ -n "$APP_PID" ]] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID" >/dev/null 2>&1
    for _ in $(seq 1 50); do
      kill -0 "$APP_PID" >/dev/null 2>&1 || break
      sleep 0.1
    done
    if kill -0 "$APP_PID" >/dev/null 2>&1; then
      kill -KILL "$APP_PID" >/dev/null 2>&1
      echo "test:notifications:local had to force-stop Next.js process $APP_PID" >&2
      cleanup_failed=true
    fi
    wait "$APP_PID" >/dev/null 2>&1
  fi
  if [[ -n "$RESEND_PID" ]] && kill -0 "$RESEND_PID" >/dev/null 2>&1; then
    kill "$RESEND_PID" >/dev/null 2>&1
    wait "$RESEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ "$STACK_TOUCHED" == true && "${KEEP_NOTIFICATION_LOCAL_STACK:-0}" != 1 ]]; then
    if ! pnpm exec supabase stop --project-id "$PROJECT_ID" --no-backup >/dev/null 2>&1; then
      echo "test:notifications:local could not remove the disposable Supabase stack; run: pnpm exec supabase stop --project-id $PROJECT_ID --no-backup" >&2
      cleanup_failed=true
    fi
  fi
  if ! rm -rf "$TMP"; then
    echo "test:notifications:local could not remove temporary files at $TMP" >&2
    cleanup_failed=true
  fi

  if [[ "$original_status" == 0 && "$cleanup_failed" == true ]]; then original_status=1; fi
  exit "$original_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# This project ID is reserved for disposable smoke data. Remove only this
# stack's stale volumes so every run starts from the committed schemas.
STACK_TOUCHED=true
if ! pnpm exec supabase stop --project-id "$PROJECT_ID" --no-backup >/dev/null 2>&1; then
  echo "test:notifications:local could not reset the reserved disposable Supabase stack" >&2
  exit 1
fi
if ! pnpm exec supabase start --yes >"$TMP/supabase-start.log" 2>&1; then
  cat "$TMP/supabase-start.log" >&2
  exit 1
fi
pnpm exec supabase status -o env >"$TMP/supabase.env"
# The CLI emits shell-safe, quoted values for its local credentials.
# shellcheck disable=SC1090
source "$TMP/supabase.env"

API_URL=${API_URL:-${SUPABASE_URL:-}}
SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}
ANON_KEY=${ANON_KEY:-${PUBLISHABLE_KEY:-}}
DB_URL=${DB_URL:-}
[[ "$API_URL" == "http://127.0.0.1:54321" ]] || {
  echo "test:notifications:local expected API_URL=http://127.0.0.1:54321" >&2
  exit 1
}
[[ -n "$SERVICE_ROLE_KEY" ]] || { echo "test:notifications:local could not read the local service-role key" >&2; exit 1; }
[[ -n "$ANON_KEY" ]] || { echo "test:notifications:local could not read the local anon key" >&2; exit 1; }
[[ "$DB_URL" == postgresql://* ]] || { echo "test:notifications:local could not read the local database URL" >&2; exit 1; }

psql -X -q "$DB_URL" -v ON_ERROR_STOP=1 -f docs/cgs-group-invitations.sql >/dev/null
psql -X -q "$DB_URL" -v ON_ERROR_STOP=1 -f docs/user-emails.sql >/dev/null
psql -X -q "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260805235500_notification_outbox.sql >/dev/null
psql -X -q "$DB_URL" -v ON_ERROR_STOP=1 -c "notify pgrst, 'reload schema';" >/dev/null

SCHEMA_STATE=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -c "select (to_regclass('public.notification_outbox') is not null)::int || '|' || (to_regclass('public.cgs_group_invitations') is not null)::int || '|' || (to_regclass('public.user_emails') is not null)::int;")
[[ "$SCHEMA_STATE" == "1|1|1" ]] || {
  echo "test:notifications:local expected notification_outbox, cgs_group_invitations, and user_emails; got $SCHEMA_STATE" >&2
  exit 1
}

SERVICE_STATUS=000
for _ in $(seq 1 60); do
  SERVICE_STATUS=$(curl --silent --output "$TMP/health.json" --write-out '%{http_code}' \
    --request POST \
    --header "apikey: $SERVICE_ROLE_KEY" \
    --header "authorization: Bearer $SERVICE_ROLE_KEY" \
    --header 'content-type: application/json' \
    --data '{}' \
    "$API_URL/rest/v1/rpc/notification_outbox_health" || true)
  [[ "$SERVICE_STATUS" == 200 ]] && break
  sleep 0.1
done
[[ "$SERVICE_STATUS" == 200 ]] || {
  echo "test:notifications:local expected service-role health RPC access after schema reload, got HTTP $SERVICE_STATUS" >&2
  cat "$TMP/health.json" >&2
  exit 1
}

expect_postgrest_denial() {
  local label=$1 key=$2 output=$3
  shift 3
  local status
  status=$(curl --silent --output "$output" --write-out '%{http_code}' \
    --header "apikey: $key" \
    --header "authorization: Bearer $key" \
    "$@")
  [[ "$status" == 401 || "$status" == 403 ]] || {
    echo "test:notifications:local expected $label denial, got HTTP $status" >&2
    cat "$output" >&2
    exit 1
  }
}

expect_postgrest_denial "anonymous notification_outbox read" "$ANON_KEY" "$TMP/anon-outbox.json" \
  "$API_URL/rest/v1/notification_outbox?select=id"
expect_postgrest_denial "anonymous invitation read" "$ANON_KEY" "$TMP/anon-invitations.json" \
  "$API_URL/rest/v1/cgs_group_invitations?select=id"
expect_postgrest_denial "anonymous private-email read" "$ANON_KEY" "$TMP/anon-user-emails.json" \
  "$API_URL/rest/v1/user_emails?select=did"
expect_postgrest_denial "anonymous notification health RPC" "$ANON_KEY" "$TMP/anon-health.json" \
  --request POST --header 'content-type: application/json' --data '{}' \
  "$API_URL/rest/v1/rpc/notification_outbox_health"
expect_postgrest_denial "service-role direct invitation insert" "$SERVICE_ROLE_KEY" "$TMP/service-invitation-insert.json" \
  --request POST --header 'content-type: application/json' --data '{}' \
  "$API_URL/rest/v1/cgs_group_invitations"
expect_postgrest_denial "service-role direct outbox insert" "$SERVICE_ROLE_KEY" "$TMP/service-outbox-insert.json" \
  --request POST --header 'content-type: application/json' --data '{}' \
  "$API_URL/rest/v1/notification_outbox"
expect_postgrest_denial "service-role private-email delete" "$SERVICE_ROLE_KEY" "$TMP/service-user-email-delete.json" \
  --request DELETE "$API_URL/rest/v1/user_emails?did=eq.did%3Aplc%3Anone"

APP_PORT=${NOTIFICATION_LOCAL_APP_PORT:-3055}
[[ "$APP_PORT" =~ ^[0-9]+$ && "$APP_PORT" -ge 1024 && "$APP_PORT" -le 65535 ]] || {
  echo "test:notifications:local requires NOTIFICATION_LOCAL_APP_PORT to be an unprivileged TCP port" >&2
  exit 2
}
if ! APP_PORT="$APP_PORT" node <<'NODE'
const net = require("node:net");
const server = net.createServer();
server.once("error", () => process.exit(1));
server.listen({ host: "127.0.0.1", port: Number(process.env.APP_PORT), exclusive: true }, () => {
  server.close(error => process.exit(error ? 1 : 0));
});
NODE
then
  echo "test:notifications:local cannot start because 127.0.0.1:$APP_PORT is already in use" >&2
  exit 2
fi

RESEND_PORT=${NOTIFICATION_LOCAL_RESEND_PORT:-3056}
[[ "$RESEND_PORT" =~ ^[0-9]+$ && "$RESEND_PORT" -ge 1024 && "$RESEND_PORT" -le 65535 && "$RESEND_PORT" != "$APP_PORT" ]] || {
  echo "test:notifications:local requires a distinct unprivileged NOTIFICATION_LOCAL_RESEND_PORT" >&2
  exit 2
}
RESEND_PORT="$RESEND_PORT" RESEND_CAPTURE_FILE="$TMP/resend.jsonl" node <<'NODE' >"$TMP/resend.log" 2>&1 &
const fs = require("node:fs");
const http = require("node:http");
let sequence = 0;
const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(204).end();
    return;
  }
  if (request.method !== "POST" || request.url !== "/emails"
    || request.headers.authorization !== "Bearer local-resend-test-key"
    || typeof request.headers["idempotency-key"] !== "string") {
    response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ message: "invalid local Resend request" }));
    return;
  }
  const chunks = [];
  request.on("data", chunk => chunks.push(Buffer.from(chunk)));
  request.on("end", () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      fs.appendFileSync(process.env.RESEND_CAPTURE_FILE, `${JSON.stringify({
        idempotencyKey: request.headers["idempotency-key"], body,
      })}\n`);
      sequence += 1;
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `local-resend-${sequence}` }));
    } catch {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ message: "invalid JSON" }));
    }
  });
});
server.listen(Number(process.env.RESEND_PORT), "127.0.0.1");
NODE
RESEND_PID=$!
for _ in $(seq 1 40); do
  curl --silent --fail "http://127.0.0.1:$RESEND_PORT/health" >/dev/null && break
  kill -0 "$RESEND_PID" >/dev/null 2>&1 || break
  sleep 0.1
done
curl --silent --fail "http://127.0.0.1:$RESEND_PORT/health" >/dev/null || {
  echo "test:notifications:local could not start the loopback Resend stub" >&2
  cat "$TMP/resend.log" >&2
  exit 1
}

APP_URL="http://127.0.0.1:$APP_PORT"
WEBHOOK_SECRET="local-notification-webhook-secret"
CRON_SECRET="local-notification-cron-secret"
SUPABASE_URL="$API_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
NEXT_PUBLIC_AUTH_BASE_URL="http://127.0.0.1:9" \
NEXT_PUBLIC_SITE_URL="$APP_URL" \
EMAIL_DISABLED=false \
RESEND_API_KEY=local-resend-test-key \
NOTIFICATION_TEST_RESEND_API_URL="http://127.0.0.1:$RESEND_PORT/emails" \
NODE_ENV=development \
EMAIL_FROM="GainForest Local <notifications@example.test>" \
WELCOME_EMAIL_WEBHOOK_SECRET="$WEBHOOK_SECRET" \
NOTIFICATION_CRON_SECRET="$CRON_SECRET" \
NEXT_TELEMETRY_DISABLED=1 \
pnpm exec next dev --hostname 127.0.0.1 --port "$APP_PORT" >"$TMP/next.log" 2>&1 &
APP_PID=$!

APP_READY=false
for _ in $(seq 1 120); do
  if ! kill -0 "$APP_PID" >/dev/null 2>&1; then break; fi
  APP_STATUS=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "$APP_URL/api/internal/notifications/drain" || true)
  if [[ "$APP_STATUS" == 401 ]] && kill -0 "$APP_PID" >/dev/null 2>&1; then APP_READY=true; break; fi
  sleep 0.25
done
if [[ "$APP_READY" != true ]]; then
  echo "test:notifications:local could not start Next.js on $APP_URL" >&2
  cat "$TMP/next.log" >&2
  exit 1
fi

WELCOME_BODY='{"type":"user.signup.completed","eventId":"local-signup-1","createdAt":"2026-08-06T01:00:00.000Z","locale":"en","user":{"did":"did:plc:localuser","email":"local-user@example.test","name":"Local Steward"}}'
WEBHOOK_TIMESTAMP=$(date +%s)
WEBHOOK_SIGNATURE=$(WEBHOOK_BODY="$WELCOME_BODY" WEBHOOK_TIMESTAMP="$WEBHOOK_TIMESTAMP" WEBHOOK_SECRET="$WEBHOOK_SECRET" node -e '
  const { createHmac } = require("node:crypto");
  process.stdout.write(createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(`${process.env.WEBHOOK_TIMESTAMP}.${process.env.WEBHOOK_BODY}`).digest("hex"));
')

send_welcome() {
  local output=$1
  curl --silent --show-error --fail-with-body \
    --request POST \
    --header 'content-type: application/json' \
    --header "x-gainforest-webhook-timestamp: $WEBHOOK_TIMESTAMP" \
    --header "x-gainforest-webhook-signature: sha256=$WEBHOOK_SIGNATURE" \
    --data "$WELCOME_BODY" \
    "$APP_URL/api/internal/welcome-email-events" >"$output"
}

send_welcome "$TMP/welcome-first.json"
node - "$TMP/welcome-first.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.ok !== true || value?.ignored !== true || value?.reason !== "signup_welcome_uses_first_app_session") {
  throw new Error(`legacy signup webhook was not accepted as a no-op: ${JSON.stringify(value)}`);
}
NODE

send_welcome "$TMP/welcome-duplicate.json"
node - "$TMP/welcome-duplicate.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.ok !== true || value?.ignored !== true || value?.reason !== "signup_welcome_uses_first_app_session") {
  throw new Error(`duplicate legacy signup webhook was not accepted as a no-op: ${JSON.stringify(value)}`);
}
NODE

WELCOME_STATE=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -c "
  select count(*) from public.notification_outbox where event_type='signup' and source_id='local-signup-1';
")
[[ "$WELCOME_STATE" == "0" ]] || {
  echo "test:notifications:local legacy signup webhook unexpectedly created a notification: $WELCOME_STATE" >&2
  exit 1
}

WELCOME_BODY='{"type":"organization.membership.joined","eventId":"local-creator-membership-1","createdAt":"2026-08-06T01:01:00.000Z","locale":"en","user":{"did":"did:plc:localcreator","email":"local-creator@example.test","name":"Local Creator"},"organization":{"did":"did:plc:localgroup","name":"Local Forest Circle"}}'
WEBHOOK_SIGNATURE=$(WEBHOOK_BODY="$WELCOME_BODY" WEBHOOK_TIMESTAMP="$WEBHOOK_TIMESTAMP" WEBHOOK_SECRET="$WEBHOOK_SECRET" node -e '
  const { createHmac } = require("node:crypto");
  process.stdout.write(createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(`${process.env.WEBHOOK_TIMESTAMP}.${process.env.WEBHOOK_BODY}`).digest("hex"));
')
send_welcome "$TMP/membership.json"
node - "$TMP/membership.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.ok !== true || value?.ignored !== true || value?.reason !== "membership_welcome_uses_invitation_acceptance") {
  throw new Error(`legacy membership event was not accepted as a no-op: ${JSON.stringify(value)}`);
}
NODE
MEMBERSHIP_STATE=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -F '|' -c "
  select count(*),bool_and(status='sent'),bool_and(template_key='welcome-membership-joined'),
    bool_and(frozen_to='local-member@example.test'),bool_and(frozen_html like '%Local Forest Circle%')
  from public.notification_outbox where event_type='membership_joined';
")
[[ "$MEMBERSHIP_STATE" == "0||||" ]] || {
  echo "test:notifications:local unmatched membership assertion failed: $MEMBERSHIP_STATE" >&2
  exit 1
}

INVITATION_ID="81000000-0000-4000-8000-000000000101"
INVITATION_CREATED_AT=$(node -e 'process.stdout.write(new Date().toISOString())')
INVITATION_EXPIRES_AT=$(node -e 'process.stdout.write(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString())')
INVITATION_BODY=$(INVITATION_ID="$INVITATION_ID" APP_URL="$APP_URL" \
  INVITATION_CREATED_AT="$INVITATION_CREATED_AT" INVITATION_EXPIRES_AT="$INVITATION_EXPIRES_AT" node -e '
  const value = {
    p_invitation_id: process.env.INVITATION_ID,
    p_repo: "did:plc:localgroup",
    p_email: "local-invitee@example.test",
    p_role: "member",
    p_inviter_did: "did:plc:localowner",
    p_inviter_handle: "local-owner.example.test",
    p_inviter_email: "local-owner@example.test",
    p_group_name: "Local Forest Circle",
    p_group_handle: "local-forest.example.test",
    p_inviter_name: "Local Owner",
    p_inviter_url: `${process.env.APP_URL}/account/local-owner.example.test`,
    p_public_origin: process.env.APP_URL,
    p_locale: "en",
    p_enqueue_notification: true,
    p_created_at: process.env.INVITATION_CREATED_AT,
    p_expires_at: process.env.INVITATION_EXPIRES_AT,
  };
  process.stdout.write(JSON.stringify(value));
')

curl --silent --show-error --fail-with-body \
  --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" \
  --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' \
  --data "$INVITATION_BODY" \
  "$API_URL/rest/v1/rpc/notification_invitation_create" >"$TMP/invitation.json"
node - "$TMP/invitation.json" "$INVITATION_ID" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.invitation?.id !== process.argv[3] || value?.notification?.status !== "queued") {
  throw new Error(`invitation and notification were not committed together: ${JSON.stringify(value)}`);
}
NODE

curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/internal/notifications/drain" >"$TMP/drain.json"
node - "$TMP/drain.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.kind !== "completed" || (value?.outcomes?.sent ?? 0) < 1) {
  throw new Error(`authenticated recovery did not send queued work through the loopback provider: ${JSON.stringify(value)}`);
}
NODE

INVITATION_STATE=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -F '|' -c "
  select count(*),bool_and(i.status='pending'),bool_and(n.status='sent'),
    bool_and(n.recipient_email='local-invitee@example.test'),bool_and(n.frozen_to='local-invitee@example.test'),
    bool_and(n.frozen_subject is not null),bool_and(n.frozen_html like '%Local Forest Circle%'),bool_and(n.provider_id like 'local-resend-%')
  from public.cgs_group_invitations i join public.notification_outbox n on n.source_id=i.id::text
  where i.id='$INVITATION_ID';
")
[[ "$INVITATION_STATE" == "1|t|t|t|t|t|t|t" ]] || {
  echo "test:notifications:local invitation recovery assertion failed: $INVITATION_STATE" >&2
  exit 1
}

curl --silent --show-error --fail-with-body --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' \
  --data "{\"p_invitation_id\":\"$INVITATION_ID\",\"p_status\":\"accepted\",\"p_accepted_by_did\":\"did:plc:localmember\",\"p_accepted_by_email\":\"local-invitee@example.test\"}" \
  "$API_URL/rest/v1/rpc/notification_invitation_close" >"$TMP/invitation-accepted.json"

JOINED_SOURCE_ID="invitation.accepted.v1:$INVITATION_ID"
JOINED_EVENT_KEY="organization-membership-joined:$JOINED_SOURCE_ID"
JOINED_BODY=$(JOINED_SOURCE_ID="$JOINED_SOURCE_ID" JOINED_EVENT_KEY="$JOINED_EVENT_KEY" node -e '
  process.stdout.write(JSON.stringify({
    p_event_key: process.env.JOINED_EVENT_KEY,
    p_event_type: "membership_joined",
    p_payload: {
      displayName: null,
      occurredAt: new Date().toISOString(),
      organizationDid: "did:plc:localgroup",
      organizationName: "Local Forest Circle",
      userDid: "did:plc:localmember",
    },
    p_source_id: process.env.JOINED_SOURCE_ID,
    p_recipient_did: "did:plc:localmember",
    p_recipient_email: "local-invitee@example.test",
    p_template_key: "welcome-membership-joined",
    p_locale: "en",
    p_provider_idempotency_key: process.env.JOINED_EVENT_KEY,
    p_next_attempt_at: new Date().toISOString(),
  }));
')
curl --silent --show-error --fail-with-body --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' --data "$JOINED_BODY" \
  "$API_URL/rest/v1/rpc/notification_outbox_enqueue" >"$TMP/joined-enqueue.json"
curl --silent --show-error --fail-with-body --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' --data "$JOINED_BODY" \
  "$API_URL/rest/v1/rpc/notification_outbox_enqueue" >"$TMP/joined-enqueue-duplicate.json"
node - "$TMP/joined-enqueue-duplicate.json" <<'NODE'
const fs = require("node:fs");
const response = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const value = Array.isArray(response) ? response[0] : response;
if (value?.duplicate !== true || value?.status !== "queued") {
  throw new Error(`duplicate invitation acceptance did not reuse queued work: ${JSON.stringify(response)}`);
}
NODE

JOINED_QUEUED=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -F '|' -c "
  select count(*),bool_and(status='queued'),
    bool_and(source_id='invitation.accepted.v1:$INVITATION_ID'),
    bool_and(provider_idempotency_key='organization-membership-joined:invitation.accepted.v1:$INVITATION_ID')
  from public.notification_outbox where event_type='membership_joined';
")
[[ "$JOINED_QUEUED" == "1|t|t|t" ]] || {
  echo "test:notifications:local invitation acceptance enqueue assertion failed: $JOINED_QUEUED" >&2
  exit 1
}

curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/internal/notifications/drain" >"$TMP/joined-drain-first.json"
curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/internal/notifications/drain" >"$TMP/joined-drain-second.json"
JOINED_SENT=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -F '|' -c "
  select count(*),bool_and(status='sent'),bool_and(provider_attempt_count=1),
    bool_and(source_id='invitation.accepted.v1:$INVITATION_ID')
  from public.notification_outbox where event_type='membership_joined';
")
[[ "$JOINED_SENT" == "1|t|t|t" ]] || {
  echo "test:notifications:local joined-email exactly-once drain assertion failed: $JOINED_SENT" >&2
  exit 1
}

curl --silent --show-error --fail-with-body \
  --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" \
  --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' \
  --data '{"did":"did:plc:localwinner","email":"local-winner@example.test"}' \
  "$API_URL/rest/v1/user_emails" >/dev/null

BIOBLITZ_DUE_AT=$(node -e 'process.stdout.write(new Date().toISOString())')
BIOBLITZ_BODY=$(BIOBLITZ_DUE_AT="$BIOBLITZ_DUE_AT" node -e '
  process.stdout.write(JSON.stringify({
    p_event_key: "bioblitz:999:best-picture:did:plc:localwinner",
    p_event_type: "bioblitz_winner",
    p_payload: {
      createdAt: "2026-08-06T01:00:00.000Z",
      prize: "best-picture",
      roundId: 999,
      roundLabel: "Local Round",
      winnerDid: "did:plc:localwinner",
    },
    p_source_id: "bioblitz:999:best-picture",
    p_recipient_did: "did:plc:localwinner",
    p_recipient_email: null,
    p_template_key: "bioblitz-winner",
    p_locale: "en",
    p_provider_idempotency_key: null,
    p_next_attempt_at: process.env.BIOBLITZ_DUE_AT,
  }));
')
curl --silent --show-error --fail-with-body \
  --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" \
  --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' \
  --data "$BIOBLITZ_BODY" \
  "$API_URL/rest/v1/rpc/notification_outbox_enqueue" >"$TMP/bioblitz-enqueue.json"
node - "$TMP/bioblitz-enqueue.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(value) || value[0]?.status !== "waiting_recipient" || value[0]?.duplicate !== false) {
  throw new Error(`BioBlitz notification was not queued for recipient lookup: ${JSON.stringify(value)}`);
}
NODE

curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/internal/notifications/drain" >"$TMP/bioblitz-drain.json"
node - "$TMP/bioblitz-drain.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.kind !== "completed" || (value?.outcomes?.sent ?? 0) < 1) {
  throw new Error(`BioBlitz recovery did not resolve and send the winner email through the loopback provider: ${JSON.stringify(value)}`);
}
NODE

BIOBLITZ_STATE=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -F '|' -c "
  select count(*),bool_and(status='sent'),bool_and(recipient_did='did:plc:localwinner'),
    bool_and(recipient_email='local-winner@example.test'),bool_and(frozen_to='local-winner@example.test'),
    bool_and(frozen_subject like '%Best picture%'),bool_and(frozen_html like '%Local Round%'),bool_and(provider_id like 'local-resend-%')
  from public.notification_outbox where event_type='bioblitz_winner' and source_id='bioblitz:999:best-picture';
")
[[ "$BIOBLITZ_STATE" == "1|t|t|t|t|t|t|t" ]] || {
  echo "test:notifications:local BioBlitz recovery assertion failed: $BIOBLITZ_STATE" >&2
  exit 1
}

MISSING_EVENT_KEY="bioblitz:999:most-observations:did:plc:missingwinner"
MISSING_BIOBLITZ_BODY=$(MISSING_EVENT_KEY="$MISSING_EVENT_KEY" BIOBLITZ_DUE_AT="$BIOBLITZ_DUE_AT" node -e '
  process.stdout.write(JSON.stringify({
    p_event_key: process.env.MISSING_EVENT_KEY,
    p_event_type: "bioblitz_winner",
    p_payload: {
      createdAt: "2026-08-06T01:00:00.000Z",
      prize: "most-observations",
      roundId: 999,
      roundLabel: "Local Round",
      winnerDid: "did:plc:missingwinner",
    },
    p_source_id: "bioblitz:999:most-observations",
    p_recipient_did: "did:plc:missingwinner",
    p_recipient_email: null,
    p_template_key: "bioblitz-winner",
    p_locale: "en",
    p_provider_idempotency_key: null,
    p_next_attempt_at: process.env.BIOBLITZ_DUE_AT,
  }));
')
curl --silent --show-error --fail-with-body \
  --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" \
  --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' \
  --data "$MISSING_BIOBLITZ_BODY" \
  "$API_URL/rest/v1/rpc/notification_outbox_enqueue" >/dev/null
curl --silent --show-error --fail-with-body \
  --header "authorization: Bearer $CRON_SECRET" \
  "$APP_URL/api/internal/notifications/drain" >"$TMP/missing-bioblitz-drain.json"
node - "$TMP/missing-bioblitz-drain.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if ((value?.outcomes?.waiting_recipient ?? 0) < 1) {
  throw new Error(`missing BioBlitz email did not remain recoverable: ${JSON.stringify(value)}`);
}
NODE

curl --silent --show-error --fail-with-body \
  --request POST \
  --header "apikey: $SERVICE_ROLE_KEY" \
  --header "authorization: Bearer $SERVICE_ROLE_KEY" \
  --header 'content-type: application/json' \
  --data "{\"p_event_key\":\"$MISSING_EVENT_KEY\",\"p_moderator_did\":\"did:plc:localmoderator\"}" \
  "$API_URL/rest/v1/rpc/notification_bioblitz_mark_handled" >"$TMP/bioblitz-handled.json"
node - "$TMP/bioblitz-handled.json" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (value?.status !== "suppressed" || value?.handled_manually !== true) {
  throw new Error(`BioBlitz manual handling did not suppress recovery: ${JSON.stringify(value)}`);
}
NODE

HANDLED_STATE=$(psql -X -Atq "$DB_URL" -v ON_ERROR_STOP=1 -F '|' -c "
  select count(*),bool_and(status='suppressed'),bool_and(manual_handled_by='did:plc:localmoderator'),
    bool_and(template_key is null),bool_and(recipient_did is null),bool_and(recipient_email is null)
  from public.notification_outbox where event_key_hash=extensions.notification_outbox_sha256(convert_to('$MISSING_EVENT_KEY','UTF8'));
")
[[ "$HANDLED_STATE" == "1|t|t|t|t|t" ]] || {
  echo "test:notifications:local BioBlitz manual handling assertion failed: $HANDLED_STATE" >&2
  exit 1
}

echo "notification local signup, membership, invitation, BioBlitz, loopback delivery, deduplication, recovery, and manual handling passed"
