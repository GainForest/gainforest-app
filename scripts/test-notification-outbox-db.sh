#!/usr/bin/env bash
set -euo pipefail

command -v docker >/dev/null || { echo "test:db requires local docker" >&2; exit 2; }
if [[ -n "${DOCKER_HOST:-}" ]]; then
  DOCKER_ENDPOINT=$DOCKER_HOST
else
  DOCKER_CONTEXT_NAME=${DOCKER_CONTEXT:-}
  if [[ -z "$DOCKER_CONTEXT_NAME" ]]; then
    DOCKER_CONTEXT_NAME=$(docker context show 2>/dev/null) || DOCKER_CONTEXT_NAME=""
  fi
  [[ -n "$DOCKER_CONTEXT_NAME" ]] || { echo "test:db could not resolve the effective local Docker context" >&2; exit 2; }
  DOCKER_ENDPOINT=$(docker context inspect "$DOCKER_CONTEXT_NAME" --format '{{ (index .Endpoints "docker").Host }}' 2>/dev/null) || {
    echo "test:db could not inspect Docker context '$DOCKER_CONTEXT_NAME' from local configuration" >&2
    exit 2
  }
fi
case "$DOCKER_ENDPOINT" in
  unix:///*) ;;
  *)
    echo "test:db refuses non-local Docker endpoint '$DOCKER_ENDPOINT'; select a Unix-socket context or unset remote DOCKER_HOST/DOCKER_CONTEXT" >&2
    exit 2
    ;;
esac
[[ "${1:-}" == "--check-docker-endpoint-only" ]] && { echo "local Docker endpoint accepted: $DOCKER_ENDPOINT"; exit 0; }
[[ $# == 0 ]] || { echo "usage: $0 [--check-docker-endpoint-only]" >&2; exit 2; }

for tool in psql pg_isready; do
  command -v "$tool" >/dev/null || { echo "test:db requires local $tool" >&2; exit 2; }
done

docker info >/dev/null 2>&1 || { echo "test:db requires a running local Docker daemon" >&2; exit 2; }

IMAGE="${NOTIFICATION_DB_TEST_IMAGE:-}"
case "$IMAGE" in
  '')
    for candidate in postgres:16-alpine postgres:16; do
      if docker image inspect "$candidate" >/dev/null 2>&1; then IMAGE="$candidate"; break; fi
    done
    ;;
  postgres:16|postgres:16-alpine) ;;
  *) echo "test:db refuses image '$IMAGE'; use locally cached postgres:16 or postgres:16-alpine" >&2; exit 2 ;;
esac
if [[ -z "$IMAGE" ]] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "test:db requires a locally cached postgres:16-alpine or postgres:16 image and will not pull one" >&2
  exit 2
fi

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
NAME="notification-outbox-db-$PPID-$RANDOM"
PASSWORD="local-contract-only-$RANDOM"
CID=""
TMP=$(mktemp -d)
CHILD_PIDS=()
cleanup() {
  local pid
  touch \
    "$TMP/claim-release" \
    "$TMP/skip-locked-release" \
    "$TMP/enqueue-release" \
    "$TMP/suppress-release" \
    2>/dev/null || true
  for pid in "${CHILD_PIDS[@]}"; do
    for _ in $(seq 1 20); do
      ! kill -0 "$pid" 2>/dev/null && break
      sleep 0.05
    done
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  [[ -n "$CID" ]] && docker rm -f "$CID" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

CID=$(docker run --detach --pull=never \
  --name "$NAME" \
  --label app.gainforest.test=notification-outbox \
  --label app.gainforest.disposable=true \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_PASSWORD="$PASSWORD" \
  --env POSTGRES_DB=notification_outbox_contract \
  "$IMAGE")
PORT=$(docker port "$CID" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')
export PGHOST=127.0.0.1 PGPORT="$PORT" PGDATABASE=notification_outbox_contract PGUSER=postgres PGPASSWORD="$PASSWORD"

READY=""
for _ in $(seq 1 300); do
  if pg_isready -q && psql -X -Atq -v ON_ERROR_STOP=1 -c 'select 1' >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.2
done
[[ -n "$READY" ]] || {
  echo "local disposable PostgreSQL did not become ready within 60 seconds" >&2
  docker logs "$CID" 2>&1 | tail -n 40 >&2 || true
  exit 1
}

psql -X -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema extensions;
create extension pgcrypto with schema extensions;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres;
SQL

shopt -s nullglob
migrations=("$ROOT"/supabase/migrations/*.sql)
((${#migrations[@]} > 0)) || { echo "no migrations found under supabase/migrations" >&2; exit 1; }
NOTIFICATION_MIGRATION="$ROOT/supabase/migrations/20260805235500_notification_outbox.sql"
[[ -f "$NOTIFICATION_MIGRATION" ]] || { echo "notification outbox migration is missing" >&2; exit 1; }
if psql -X -v ON_ERROR_STOP=1 -f "$NOTIFICATION_MIGRATION" >"$TMP/missing-prerequisites.out" 2>"$TMP/missing-prerequisites.err"; then
  echo "notification outbox migration must fail before invitation and user-email prerequisites exist" >&2
  exit 1
fi
grep -q 'notification outbox prerequisites' "$TMP/missing-prerequisites.err" || {
  echo "notification outbox migration prerequisite failure was not actionable" >&2
  cat "$TMP/missing-prerequisites.err" >&2
  exit 1
}

psql -X -q -v ON_ERROR_STOP=1 -c "create table public.cgs_group_invitations(id uuid); create table public.user_emails(did text);" >/dev/null
if psql -X -v ON_ERROR_STOP=1 -f "$NOTIFICATION_MIGRATION" >"$TMP/incomplete-prerequisites.out" 2>"$TMP/incomplete-prerequisites.err"; then
  echo "notification outbox migration must fail when prerequisite columns are incomplete" >&2
  exit 1
fi
grep -q 'notification outbox prerequisites are incomplete' "$TMP/incomplete-prerequisites.err" || {
  echo "notification outbox incomplete-prerequisite failure was not actionable" >&2
  cat "$TMP/incomplete-prerequisites.err" >&2
  exit 1
}
psql -X -q -v ON_ERROR_STOP=1 -c "drop table public.cgs_group_invitations; drop table public.user_emails;" >/dev/null

psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/docs/cgs-group-invitations.sql" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/docs/user-emails.sql" >/dev/null
for migration in "${migrations[@]}"; do
  echo "Applying $(basename "$migration")"
  psql -X -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/tests/database/notification-outbox-contract.sql" >/dev/null

# Prove the migration also works when pgcrypto was previously installed in
# public. CREATE EXTENSION IF NOT EXISTS does not relocate existing installs.
PUBLIC_CRYPTO_DB=notification_outbox_pgcrypto_public
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database $PUBLIC_CRYPTO_DB" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$PUBLIC_CRYPTO_DB" -c "create extension pgcrypto with schema public" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$PUBLIC_CRYPTO_DB" -f "$ROOT/docs/cgs-group-invitations.sql" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d "$PUBLIC_CRYPTO_DB" -f "$ROOT/docs/user-emails.sql" >/dev/null
for migration in "${migrations[@]}"; do
  echo "Applying $(basename "$migration") with pgcrypto in public"
  psql -X -v ON_ERROR_STOP=1 -d "$PUBLIC_CRYPTO_DB" -f "$migration" >/dev/null
done
PUBLIC_CRYPTO_ENQUEUE=$(psql -X -Atq -v ON_ERROR_STOP=1 -d "$PUBLIC_CRYPTO_DB" -c "select status || '|' || duplicate from public.notification_outbox_enqueue('public-pgcrypto:enqueue','signup','{}','public-pgcrypto-source',null,'public-pgcrypto@example.com','welcome','en','signup:public-pgcrypto-source',clock_timestamp());")
[[ "$PUBLIC_CRYPTO_ENQUEUE" == 'queued|false' || "$PUBLIC_CRYPTO_ENQUEUE" == 'queued|f' ]] || { echo "enqueue with pgcrypto in public failed: $PUBLIC_CRYPTO_ENQUEUE" >&2; exit 1; }

wait_for_backend_lock() {
  local application_name=$1
  local expected_count=${2:-1}
  local count
  for _ in $(seq 1 100); do
    count=$(psql -X -Atq -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='$application_name' and wait_event_type='Lock';")
    [[ "$count" == "$expected_count" ]] && return 0
    sleep 0.05
  done
  echo "timed out waiting for PostgreSQL lock state: application_name=$application_name expected=$expected_count" >&2
  psql -X -P pager=off -v ON_ERROR_STOP=1 -c "select pid,application_name,state,wait_event_type,wait_event,query from pg_stat_activity where application_name='$application_name';" >&2 || true
  psql -X -P pager=off -v ON_ERROR_STOP=1 -c "select a.pid,a.application_name,l.locktype,l.mode,l.granted,l.relation::regclass as relation,l.transactionid from pg_stat_activity a join pg_locks l on l.pid=a.pid where a.application_name='$application_name' order by l.granted,l.locktype,l.mode;" >&2 || true
  return 1
}

# Hold both claim statements at the table boundary so claim_one and claim_due
# are concurrently waiting before either can acquire ownership.
RACE_ID=$(psql -X -Atq -v ON_ERROR_STOP=1 <<'SQL'
truncate public.notification_outbox;
select outbox_id from public.notification_outbox_enqueue(
  'race:event', 'signup', '{"name":"race"}'::jsonb, 'race-source', null,
  'race@example.com', 'race-template', 'en', 'signup:race-source', clock_timestamp()
);
SQL
)
TOKEN_A=10000000-0000-4000-8000-000000000001
cat >"$TMP/claim-holder.sql" <<SQL
begin;
lock table public.notification_outbox in access exclusive mode;
\! touch '$TMP/claim-ready'
\! while [ ! -f '$TMP/claim-release' ]; do sleep 0.05; done
commit;
SQL
PGAPPNAME=outbox-claim-holder psql -X -q -v ON_ERROR_STOP=1 -f "$TMP/claim-holder.sql" >/dev/null &
HOLDER_PID=$!
CHILD_PIDS+=("$HOLDER_PID")
for _ in $(seq 1 100); do [[ -f "$TMP/claim-ready" ]] && break; sleep 0.02; done
[[ -f "$TMP/claim-ready" ]] || { echo "claim race barrier did not become ready" >&2; exit 1; }
PGAPPNAME=outbox-claim-one psql -X -Atq -v ON_ERROR_STOP=1 -c "select outbox_id from public.notification_outbox_claim_one('$RACE_ID', '$TOKEN_A', 60);" >"$TMP/claim-one" &
PID_A=$!
CHILD_PIDS+=("$PID_A")
PGAPPNAME=outbox-claim-due psql -X -Atq -v ON_ERROR_STOP=1 -c "select outbox_id from public.notification_outbox_claim_due(1, 60);" >"$TMP/claim-due" &
PID_B=$!
CHILD_PIDS+=("$PID_B")
wait_for_backend_lock outbox-claim-one
wait_for_backend_lock outbox-claim-due
touch "$TMP/claim-release"
wait "$HOLDER_PID"; wait "$PID_A"; wait "$PID_B"
CHILD_PIDS=()
CLAIMS=$(cat "$TMP/claim-one" "$TMP/claim-due" | grep -c . || true)
[[ "$CLAIMS" == 1 ]] || { echo "claim_one-vs-claim_due race expected exactly one owner, got $CLAIMS" >&2; exit 1; }
OWNER=$(psql -X -Atq -v ON_ERROR_STOP=1 -c "select processing_token is not null from public.notification_outbox where id='$RACE_ID';")
[[ "$OWNER" == t ]] || { echo "claim race winner token was not durably stored" >&2; exit 1; }

# Hold one due row at row level. A concurrent batch claim must skip it and
# claim the other due row without waiting for the holder to commit.
SKIP_LOCKED_ID=$(psql -X -Atq -v ON_ERROR_STOP=1 <<'SQL'
truncate public.notification_outbox;
select outbox_id from public.notification_outbox_enqueue(
  'skip-locked:held', 'signup', '{}', 'skip-locked-held', null,
  'held@example.com', 'welcome', 'en', 'signup:skip-locked-held', clock_timestamp()
);
SQL
)
SKIP_AVAILABLE_ID=$(psql -X -Atq -v ON_ERROR_STOP=1 -c "select outbox_id from public.notification_outbox_enqueue('skip-locked:available','signup','{}','skip-locked-available',null,'available@example.com','welcome','en','signup:skip-locked-available',clock_timestamp());")
cat >"$TMP/skip-locked-holder.sql" <<SQL
begin;
select id from public.notification_outbox where id='$SKIP_LOCKED_ID' for update;
\! touch '$TMP/skip-locked-ready'
\! while [ ! -f '$TMP/skip-locked-release' ]; do sleep 0.05; done
commit;
SQL
PGAPPNAME=outbox-skip-locked-holder psql -X -q -v ON_ERROR_STOP=1 -f "$TMP/skip-locked-holder.sql" >/dev/null &
HOLDER_PID=$!
CHILD_PIDS+=("$HOLDER_PID")
for _ in $(seq 1 100); do [[ -f "$TMP/skip-locked-ready" ]] && break; sleep 0.02; done
[[ -f "$TMP/skip-locked-ready" ]] || { echo "skip-locked row holder did not become ready" >&2; exit 1; }
if ! PGAPPNAME=outbox-skip-locked-claim PGOPTIONS='-c statement_timeout=5000' \
  psql -X -Atq -v ON_ERROR_STOP=1 -c "select outbox_id from public.notification_outbox_claim_due(2, 60);" >"$TMP/skip-locked-claim"; then
  touch "$TMP/skip-locked-release"
  wait "$HOLDER_PID" || true
  CHILD_PIDS=()
  echo "claim_due blocked instead of skipping a row-level lock" >&2
  exit 1
fi
touch "$TMP/skip-locked-release"
wait "$HOLDER_PID"
CHILD_PIDS=()
grep -qx "$SKIP_AVAILABLE_ID" "$TMP/skip-locked-claim" || { echo "claim_due did not claim only the unlocked due row" >&2; exit 1; }
SKIPPED_STATE=$(psql -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "select status,processing_token is null from public.notification_outbox where id='$SKIP_LOCKED_ID';")
[[ "$SKIPPED_STATE" == 'queued|t' ]] || { echo "claim_due mutated the row held by another session: $SKIPPED_STATE" >&2; exit 1; }

# Enqueue inserts but remains uncommitted. The suppressing session therefore
# observes no row, loses the unique race after commit, and must recover by
# locking and suppressing the winner.
psql -X -q -v ON_ERROR_STOP=1 -c "truncate public.notification_outbox" >/dev/null
cat >"$TMP/enqueue-racer.sql" <<SQL
begin;
select status,duplicate from public.notification_outbox_enqueue('race:suppress','invitation','{}','invite-race',null,'race@example.com','invite','en',null,clock_timestamp());
\! touch '$TMP/enqueue-ready'
\! while [ ! -f '$TMP/enqueue-release' ]; do sleep 0.05; done
commit;
SQL
PGAPPNAME=outbox-enqueue-first psql -X -Atq -F '|' -v ON_ERROR_STOP=1 -f "$TMP/enqueue-racer.sql" >"$TMP/enqueue" &
PID_A=$!
CHILD_PIDS+=("$PID_A")
for _ in $(seq 1 100); do [[ -f "$TMP/enqueue-ready" ]] && break; sleep 0.02; done
[[ -f "$TMP/enqueue-ready" ]] || { echo "suppression race enqueue did not become ready" >&2; exit 1; }
PGAPPNAME=outbox-suppress-second psql -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "select status,duplicate from public.notification_outbox_suppress_event('race:suppress','invitation');" >"$TMP/suppress" &
PID_B=$!
CHILD_PIDS+=("$PID_B")
wait_for_backend_lock outbox-suppress-second
touch "$TMP/enqueue-release"
wait "$PID_A"; wait "$PID_B"
CHILD_PIDS=()
grep -q '^queued|f$' "$TMP/enqueue" || { echo "concurrent enqueue did not create the race winner" >&2; exit 1; }
grep -q '^suppressed|t$' "$TMP/suppress" || { echo "suppression did not recover and suppress the concurrent winner" >&2; exit 1; }
FINAL=$(psql -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "select count(*),bool_and(status='suppressed' and template_key is null and payload is null and recipient_email is null) from public.notification_outbox;")
[[ "$FINAL" == '1|t' ]] || { echo "suppress-vs-enqueue race did not retain exactly one redacted tombstone: $FINAL" >&2; exit 1; }

# Suppression inserts a tombstone but remains uncommitted. The enqueue session
# must block on its unique insert, then recover the retained suppressed row.
psql -X -q -v ON_ERROR_STOP=1 -c "truncate public.notification_outbox" >/dev/null
cat >"$TMP/suppress-racer.sql" <<SQL
begin;
select status,duplicate from public.notification_outbox_suppress_event('race:suppress-first','invitation');
\! touch '$TMP/suppress-ready'
\! while [ ! -f '$TMP/suppress-release' ]; do sleep 0.05; done
commit;
SQL
PGAPPNAME=outbox-suppress-first psql -X -Atq -F '|' -v ON_ERROR_STOP=1 -f "$TMP/suppress-racer.sql" >"$TMP/suppress-first" &
PID_A=$!
CHILD_PIDS+=("$PID_A")
for _ in $(seq 1 100); do [[ -f "$TMP/suppress-ready" ]] && break; sleep 0.02; done
[[ -f "$TMP/suppress-ready" ]] || { echo "suppress-first race barrier did not become ready" >&2; exit 1; }
PGAPPNAME=outbox-enqueue-second psql -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "select status,duplicate from public.notification_outbox_enqueue('race:suppress-first','invitation','{\"private\":true}','invite-race-first',null,'race-first@example.com','invite','en',null,clock_timestamp());" >"$TMP/enqueue-second" &
PID_B=$!
CHILD_PIDS+=("$PID_B")
wait_for_backend_lock outbox-enqueue-second
touch "$TMP/suppress-release"
wait "$PID_A"; wait "$PID_B"
CHILD_PIDS=()
grep -q '^suppressed|f$' "$TMP/suppress-first" || { echo "suppress-first racer did not create the tombstone" >&2; exit 1; }
grep -q '^suppressed|t$' "$TMP/enqueue-second" || { echo "enqueue did not recover the concurrent suppression tombstone" >&2; exit 1; }
FINAL=$(psql -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "select count(*),bool_and(status='suppressed' and template_key is null and payload is null and source_id is null and recipient_email is null and provider_idempotency_key is null) from public.notification_outbox;")
[[ "$FINAL" == '1|t' ]] || { echo "enqueue-vs-suppress-first race did not retain exactly one redacted tombstone: $FINAL" >&2; exit 1; }

echo "notification outbox database contracts passed (including deterministic claim and bidirectional suppression races)"
