-- Canonical private durable notification outbox schema.
-- This migration is the source of truth for the final table and RPC surface.
-- It intentionally does not baseline user_emails or cgs_group_invitations;
-- those remain externally managed prerequisites.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- pgcrypto may already be installed outside extensions; CREATE EXTENSION IF
-- NOT EXISTS does not relocate it. Resolve its catalog-owned namespace and
-- quote the identifier before dispatching to digest.
create function extensions.notification_outbox_sha256(p_value bytea)
returns text language plpgsql security definer set search_path='' as $$
declare v_schema name; v_digest bytea;
begin
  select n.nspname into v_schema
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid=e.extnamespace
    where e.extname='pgcrypto';
  if v_schema is null then raise exception 'pgcrypto extension is required for notification outbox hashing'; end if;
  execute pg_catalog.format('select %I.digest($1, %L)',v_schema,'sha256') into v_digest using p_value;
  return pg_catalog.encode(v_digest,'hex');
end $$;
revoke all on function extensions.notification_outbox_sha256(bytea) from public,anon,authenticated,service_role;

create table public.notification_outbox (
  -- Identity and deduplication.
  id uuid primary key default pg_catalog.gen_random_uuid(),
  event_key_hash text not null,
  input_fingerprint_hash text,

  -- Private notification and render inputs. template_key=NULL marks cleared data.
  event_type text not null,
  payload jsonb,
  source_id text,
  recipient_did text,
  recipient_email text,
  template_key text,
  locale text,

  -- Immutable provider request. The five fields are always all NULL or all set.
  frozen_from text,
  frozen_to text,
  frozen_subject text,
  frozen_html text,
  frozen_text text,

  -- Queue scheduling and lease ownership.
  status text not null,
  next_attempt_at timestamptz not null default clock_timestamp(),
  processing_run_count integer not null default 0,
  provider_attempt_count integer not null default 0,
  locked_until timestamptz,
  processing_token uuid,
  claimed_from_status text,

  -- Provider result and ambiguous-delivery safety.
  provider_call_phase text not null default 'idle',
  provider_call_is_ambiguous_retry boolean not null default false,
  provider_id text,
  provider_idempotency_key text,
  provider_idempotency_expires_at timestamptz,

  -- Allowlisted diagnostics and operator-initiated invitation retry state.
  last_error_code text,
  last_error_summary text,
  last_manual_retry_at timestamptz,
  manual_retry_count integer not null default 0,
  manual_handled_at timestamptz,
  manual_handled_by text,

  -- Terminal and audit timestamps.
  terminal_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  constraint notification_outbox_event_key_hash_format check (event_key_hash ~ '^[0-9a-f]{64}$'),
  constraint notification_outbox_fingerprint_format check (input_fingerprint_hash is null or input_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  constraint notification_outbox_event_type_check check (event_type in ('signup','membership_joined','invitation','bioblitz_winner')),
  constraint notification_outbox_status_check check (status in ('waiting_recipient','queued','processing','sent','suppressed','dead')),
  constraint notification_outbox_provider_phase_check check (provider_call_phase in ('idle','in_flight')),
  constraint notification_outbox_processing_run_count_check check (processing_run_count >= 0),
  constraint notification_outbox_provider_attempt_count_check check (provider_attempt_count >= 0),
  constraint notification_outbox_manual_retry_count_check check (manual_retry_count >= 0),
  constraint notification_outbox_manual_handling_check check (
    (manual_handled_at is null and manual_handled_by is null) or
    (manual_handled_at is not null and manual_handled_by is not null and status='suppressed' and length(manual_handled_by) between 5 and 256)
  ),
  constraint notification_outbox_source_id_bound check (source_id is null or length(source_id) between 1 and 512),
  constraint notification_outbox_recipient_did_bound check (recipient_did is null or (length(recipient_did) between 5 and 256 and recipient_did like 'did:%')),
  constraint notification_outbox_recipient_email_format check (
    recipient_email is null or
    (length(recipient_email) between 3 and 320 and recipient_email=lower(trim(recipient_email)) and position('@' in recipient_email)>1)
  ),
  constraint notification_outbox_template_key_bound check (
    template_key is null or length(template_key) between 1 and 128
  ),
  constraint notification_outbox_locale_bound check (locale is null or length(locale) between 1 and 35),
  constraint notification_outbox_provider_key_bound check (
    provider_idempotency_key is null or length(provider_idempotency_key) between 1 and 256
  ),
  constraint notification_outbox_provider_key_ownership check (
    template_key is null or
    (event_type='signup' and source_id is not null and provider_idempotency_key='signup:' || source_id) or
    (event_type='membership_joined' and source_id is not null and provider_idempotency_key='organization-membership-joined:' || source_id) or
    (event_type in ('invitation','bioblitz_winner') and provider_idempotency_key=id::text)
  ),
  constraint notification_outbox_provider_id_bound check (provider_id is null or length(provider_id) between 1 and 256),
  constraint notification_outbox_error_code_check check (last_error_code is null or last_error_code in (
    'recipient_missing','recipient_lookup_failed','provider_5xx','provider_timeout',
    'provider_rate_limited','provider_rejected','provider_idempotency_expired',
    'active_retention_expired','notification_invalid','invitation_not_pending','manually_suppressed'
  )),
  constraint notification_outbox_error_summary_bound check (last_error_summary is null or length(last_error_summary) between 1 and 512),
  constraint notification_outbox_recipient_contract check (
    template_key is null or status='suppressed' or
    (event_type='bioblitz_winner' and recipient_did is not null and (recipient_email is not null or status='waiting_recipient' or (status='processing' and claimed_from_status='waiting_recipient'))) or
    (event_type<>'bioblitz_winner' and recipient_email is not null)
  ),
  constraint notification_outbox_lease_contract check (
    (status='processing' and locked_until is not null and processing_token is not null and claimed_from_status in ('waiting_recipient','queued')) or
    (status<>'processing' and locked_until is null and processing_token is null and claimed_from_status is null)
  ),
  constraint notification_outbox_provider_phase_contract check (
    (provider_call_phase='idle' and not provider_call_is_ambiguous_retry and provider_idempotency_expires_at is null) or
    (provider_call_phase='in_flight' and status='processing' and provider_idempotency_expires_at is not null)
  ),
  constraint notification_outbox_frozen_all_or_none check (
    (frozen_from is null and frozen_to is null and frozen_subject is null and frozen_html is null and frozen_text is null) or
    (frozen_from is not null and frozen_to is not null and frozen_subject is not null and frozen_html is not null and frozen_text is not null)
  ),
  constraint notification_outbox_terminal_contract check (
    (status in ('sent','suppressed','dead') and terminal_at is not null) or
    (status not in ('sent','suppressed','dead') and terminal_at is null)
  ),
  constraint notification_outbox_sent_contract check (
    status<>'sent' or template_key is null or
    (frozen_from is not null and provider_id is not null)
  ),
  constraint notification_outbox_private_data_contract check (
    template_key is not null or (
      status in ('sent','dead','suppressed') and input_fingerprint_hash is null and payload is null and source_id is null and
      recipient_did is null and recipient_email is null and locale is null and
      frozen_from is null and frozen_to is null and frozen_subject is null and
      frozen_html is null and frozen_text is null and provider_id is null and
      provider_idempotency_key is null and last_error_code is null and last_error_summary is null and
      processing_run_count=0 and provider_attempt_count=0 and not provider_call_is_ambiguous_retry and last_manual_retry_at is null and manual_retry_count=0
    )
  )
);

comment on table public.notification_outbox is
  'Private durable notification delivery state. Mutate through notification_outbox_* RPCs only.';
comment on column public.notification_outbox.template_key is
  'Template identifier while private delivery data is retained; NULL marks cleared terminal data.';
comment on column public.notification_outbox.frozen_from is
  'Presence marker for the immutable provider request; all five frozen_* fields are set together.';
comment on column public.notification_outbox.processing_run_count is
  'Number of successful worker claims, including claims that do not call the provider.';
comment on column public.notification_outbox.provider_attempt_count is
  'Number of provider transmissions begun by notification_outbox_begin_provider_call.';
comment on column public.notification_outbox.provider_call_is_ambiguous_retry is
  'True when the current owner is retrying a call whose earlier delivery result is unknown.';
comment on column public.notification_outbox.provider_idempotency_expires_at is
  'Original provider idempotency deadline; ambiguous retries must not extend it.';
comment on column public.notification_outbox.last_manual_retry_at is
  'Most recent operator-initiated retry time, used to enforce invitation retry cooldowns.';
comment on column public.notification_outbox.manual_retry_count is
  'Number of operator-initiated invitation retries.';
comment on column public.notification_outbox.manual_handled_at is
  'Time a moderator replaced automatic BioBlitz email with manual follow-up.';
comment on column public.notification_outbox.manual_handled_by is
  'Moderator DID responsible for manual BioBlitz follow-up.';

create unique index notification_outbox_event_key_unique on public.notification_outbox(event_key_hash);
create unique index notification_outbox_provider_key_unique on public.notification_outbox(provider_idempotency_key)
  where provider_idempotency_key is not null;
create index notification_outbox_due_idx on public.notification_outbox(next_attempt_at,created_at)
  where status in ('waiting_recipient','queued');
create index notification_outbox_expired_lease_idx on public.notification_outbox(locked_until)
  where status='processing';

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public, anon, authenticated, service_role;
grant select on public.notification_outbox to service_role;

create function public.notification_outbox_guard_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.event_key_hash is distinct from old.event_key_hash
    or new.event_type is distinct from old.event_type
    or (new.input_fingerprint_hash is distinct from old.input_fingerprint_hash and new.template_key is not null)
    or (new.provider_idempotency_key is distinct from old.provider_idempotency_key and new.template_key is not null)
    or (old.frozen_from is not null and new.template_key is not null and (
      new.frozen_from is distinct from old.frozen_from or new.frozen_to is distinct from old.frozen_to or
      new.frozen_subject is distinct from old.frozen_subject or new.frozen_html is distinct from old.frozen_html or
      new.frozen_text is distinct from old.frozen_text
    ))
    or (old.recipient_email is not null and new.recipient_email is distinct from old.recipient_email and new.template_key is not null)
  then raise exception using errcode='23514', message='notification outbox immutable delivery fields cannot change';
  end if;
  new.updated_at=clock_timestamp();
  return new;
end $$;
create trigger notification_outbox_guard_immutable before update on public.notification_outbox
for each row execute function public.notification_outbox_guard_immutable();
revoke all on function public.notification_outbox_guard_immutable() from public, anon, authenticated, service_role;

create function public.notification_outbox_enqueue(
  p_event_key text, p_event_type text, p_payload jsonb, p_source_id text,
  p_recipient_did text, p_recipient_email text, p_template_key text, p_locale text,
  p_provider_idempotency_key text, p_next_attempt_at timestamptz
) returns table(outbox_id uuid,status text,duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare
  v_event_hash text;
  v_fingerprint text;
  v_provider_key text;
  v_expected_provider_key text;
  v_existing public.notification_outbox%rowtype;
  v_id uuid;
begin
  if p_event_key is null or length(p_event_key) not between 1 and 512 then raise exception 'event key must contain 1 to 512 characters'; end if;
  if p_event_type is null or p_event_type not in ('signup','membership_joined','invitation','bioblitz_winner') then raise exception 'unsupported event type'; end if;
  if p_event_type in ('signup','membership_joined') then
    if p_source_id is null then raise exception 'source ID is required for welcome provider key ownership'; end if;
    v_expected_provider_key=case p_event_type
      when 'signup' then 'signup:' || p_source_id
      else 'organization-membership-joined:' || p_source_id
    end;
    if length(v_expected_provider_key)>256 then raise exception 'welcome provider idempotency key exceeds 256 characters after event namespacing'; end if;
    if p_provider_idempotency_key is null or p_provider_idempotency_key not in (p_source_id,v_expected_provider_key) then
      raise exception 'welcome provider idempotency key must equal source ID or its event namespace';
    end if;
  elsif p_provider_idempotency_key is not null then
    raise exception 'provider idempotency key must not be supplied for invitation or BioBlitz events';
  end if;
  if p_template_key is null or length(p_template_key) not between 1 and 128 then raise exception 'template key must contain 1 to 128 characters'; end if;
  if p_source_id is not null and length(p_source_id) not between 1 and 512 then raise exception 'source ID must contain at most 512 characters'; end if;
  if p_locale is not null and length(p_locale) not between 1 and 35 then raise exception 'locale must contain at most 35 characters'; end if;
  if p_recipient_email is not null and (length(p_recipient_email) not between 3 and 320 or p_recipient_email<>lower(trim(p_recipient_email)) or position('@' in p_recipient_email)<=1) then raise exception 'recipient email must be a normalized lowercase address'; end if;
  if p_event_type='bioblitz_winner' and (p_recipient_did is null or p_recipient_did not like 'did:%' or length(p_recipient_did)>256) then raise exception 'BioBlitz recipient requires a bounded DID'; end if;
  if p_event_type<>'bioblitz_winner' and p_recipient_email is null then raise exception 'recipient email is required for this event type'; end if;
  if p_payload is not null and pg_column_size(p_payload)>65536 then raise exception 'payload must be at most 64 KiB'; end if;

  v_event_hash=extensions.notification_outbox_sha256(pg_catalog.convert_to(p_event_key,'UTF8'));
  select * into v_existing from public.notification_outbox where event_key_hash=v_event_hash for update;
  if found then
    if v_existing.event_type<>p_event_type then raise exception 'notification_outbox_idempotency_conflict: event type differs'; end if;
    v_provider_key=v_existing.provider_idempotency_key;
    v_fingerprint=extensions.notification_outbox_sha256(pg_catalog.convert_to(jsonb_build_object(
      'event_type',p_event_type,'payload',p_payload,'source_id',p_source_id,'recipient_did',p_recipient_did,
      'recipient_email',p_recipient_email,'template_key',p_template_key,'locale',p_locale,
      'provider_idempotency_key',v_provider_key
    )::text,'UTF8'));
    if v_existing.template_key is null or v_existing.status='suppressed' or v_existing.input_fingerprint_hash=v_fingerprint then
      return query select v_existing.id,v_existing.status,true; return;
    end if;
    raise exception 'notification_outbox_idempotency_conflict: event key was already used with different delivery input';
  end if;

  v_id=pg_catalog.gen_random_uuid();
  v_provider_key=case when p_event_type in ('signup','membership_joined') then v_expected_provider_key else v_id::text end;
  v_fingerprint=extensions.notification_outbox_sha256(pg_catalog.convert_to(jsonb_build_object(
    'event_type',p_event_type,'payload',p_payload,'source_id',p_source_id,'recipient_did',p_recipient_did,
    'recipient_email',p_recipient_email,'template_key',p_template_key,'locale',p_locale,
    'provider_idempotency_key',v_provider_key
  )::text,'UTF8'));

  begin
    insert into public.notification_outbox(
      id,event_key_hash,input_fingerprint_hash,event_type,payload,source_id,recipient_did,recipient_email,
      template_key,locale,provider_idempotency_key,status,next_attempt_at
    ) values (
      v_id,v_event_hash,v_fingerprint,p_event_type,p_payload,p_source_id,p_recipient_did,p_recipient_email,
      p_template_key,p_locale,v_provider_key,
      case when p_event_type='bioblitz_winner' and p_recipient_email is null then 'waiting_recipient' else 'queued' end,
      coalesce(p_next_attempt_at,clock_timestamp())
    );
  exception when unique_violation then
    select * into v_existing from public.notification_outbox where event_key_hash=v_event_hash for update;
    if not found then raise exception 'notification_outbox_provider_key_conflict: provider idempotency key is already owned by another event'; end if;
    if v_existing.event_type<>p_event_type then raise exception 'notification_outbox_idempotency_conflict: event type differs'; end if;
    v_provider_key=v_existing.provider_idempotency_key;
    v_fingerprint=extensions.notification_outbox_sha256(pg_catalog.convert_to(jsonb_build_object(
      'event_type',p_event_type,'payload',p_payload,'source_id',p_source_id,'recipient_did',p_recipient_did,
      'recipient_email',p_recipient_email,'template_key',p_template_key,'locale',p_locale,
      'provider_idempotency_key',v_provider_key
    )::text,'UTF8'));
    if v_existing.template_key is null or v_existing.status='suppressed' or v_existing.input_fingerprint_hash=v_fingerprint then
      return query select v_existing.id,v_existing.status,true; return;
    end if;
    raise exception 'notification_outbox_idempotency_conflict: event key was already used with different delivery input';
  end;
  return query select v_id,(select n.status from public.notification_outbox n where n.id=v_id),false;
end $$;

create function public.notification_outbox_claim_one(p_outbox_id uuid,p_token uuid,p_lease_seconds integer)
returns table(outbox_id uuid,previous_status text,resume_provider_call_phase text,processing_token uuid,locked_until timestamptz)
language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype; v_previous text;
begin
  if p_token is null then raise exception 'processing token is required'; end if;
  if p_lease_seconds is null or p_lease_seconds not between 1 and 300 then raise exception 'lease seconds must be between 1 and 300'; end if;
  select * into v from public.notification_outbox where id=p_outbox_id for update;
  if not found then return; end if;
  if not ((v.status in ('waiting_recipient','queued') and v.next_attempt_at<=clock_timestamp()) or
          (v.status='processing' and v.locked_until<=clock_timestamp())) then return; end if;
  if v.created_at<=clock_timestamp()-interval '7 days' then
    update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code='active_retention_expired',
      last_error_summary='Notification exceeded the seven-day active retention limit',locked_until=null,processing_token=null,
      claimed_from_status=null,provider_call_phase='idle',provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null
      where id=p_outbox_id;
    return;
  end if;
  if v.status='processing' and v.provider_call_phase='in_flight' and v.provider_idempotency_expires_at<=clock_timestamp() then
    update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code='provider_idempotency_expired',
      last_error_summary='Provider outcome remained ambiguous beyond the stored idempotency guarantee',locked_until=null,processing_token=null,
      claimed_from_status=null,provider_call_phase='idle',provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null
      where id=p_outbox_id;
    return;
  end if;
  v_previous=v.status;
  update public.notification_outbox set status='processing',locked_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    processing_token=p_token,claimed_from_status=case when v.status='processing' then v.claimed_from_status else v.status end,
    provider_call_is_ambiguous_retry=(v.status='processing' and v.provider_call_phase='in_flight'),
    processing_run_count=processing_run_count+1 where id=p_outbox_id
    returning notification_outbox.locked_until into v.locked_until;
  return query select p_outbox_id,v_previous,v.provider_call_phase,p_token,v.locked_until;
end $$;

create function public.notification_outbox_claim_due(p_batch_size integer,p_lease_seconds integer)
returns table(outbox_id uuid,previous_status text,resume_provider_call_phase text,processing_token uuid,locked_until timestamptz)
language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype; v_token uuid; v_until timestamptz;
begin
  if p_batch_size is null or p_batch_size not between 1 and 100 then raise exception 'batch size must be between 1 and 100'; end if;
  if p_lease_seconds is null or p_lease_seconds not between 1 and 300 then raise exception 'lease seconds must be between 1 and 300'; end if;
  for v in select * from public.notification_outbox n where
    (n.status in ('waiting_recipient','queued') and n.next_attempt_at<=clock_timestamp()) or
    (n.status='processing' and n.locked_until<=clock_timestamp())
    order by coalesce(n.locked_until,n.next_attempt_at),n.created_at limit p_batch_size for update skip locked
  loop
    if v.created_at<=clock_timestamp()-interval '7 days' then
      update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code='active_retention_expired',
        last_error_summary='Notification exceeded the seven-day active retention limit',locked_until=null,processing_token=null,
        claimed_from_status=null,provider_call_phase='idle',provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null where id=v.id;
      continue;
    end if;
    if v.status='processing' and v.provider_call_phase='in_flight' and v.provider_idempotency_expires_at<=clock_timestamp() then
      update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code='provider_idempotency_expired',
        last_error_summary='Provider outcome remained ambiguous beyond the stored idempotency guarantee',locked_until=null,processing_token=null,
        claimed_from_status=null,provider_call_phase='idle',provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null where id=v.id;
      continue;
    end if;
    v_token=pg_catalog.gen_random_uuid(); v_until=clock_timestamp()+make_interval(secs=>p_lease_seconds);
    update public.notification_outbox set status='processing',locked_until=v_until,processing_token=v_token,
      claimed_from_status=case when v.status='processing' then v.claimed_from_status else v.status end,
      provider_call_is_ambiguous_retry=(v.status='processing' and v.provider_call_phase='in_flight'),
      processing_run_count=processing_run_count+1 where id=v.id;
    outbox_id=v.id; previous_status=v.status; resume_provider_call_phase=v.provider_call_phase; processing_token=v_token; locked_until=v_until;
    return next;
  end loop;
end $$;

create function public.notification_outbox_expire_claimed(p_outbox_id uuid,p_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype;
begin
  if p_error_code is null or p_error_code not in ('active_retention_expired','provider_idempotency_expired') then raise exception 'unsupported claimed expiry code'; end if;
  select * into v from public.notification_outbox
    where id=p_outbox_id and status='processing' and processing_token=p_token for update;
  if not found then return false; end if;
  if p_error_code='active_retention_expired' and v.created_at>clock_timestamp()-interval '7 days' then return false; end if;
  if p_error_code='provider_idempotency_expired' and
     (v.provider_call_phase<>'in_flight' or v.provider_idempotency_expires_at>clock_timestamp()) then return false; end if;
  update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code=p_error_code,
    last_error_summary=case p_error_code
      when 'provider_idempotency_expired' then 'Provider outcome remained ambiguous beyond the stored idempotency guarantee'
      else 'Notification exceeded the seven-day active retention limit'
    end,
    locked_until=null,processing_token=null,claimed_from_status=null,provider_call_phase='idle',
    provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null
    where id=p_outbox_id;
  return true;
end $$;

create function public.notification_outbox_resolve_recipient(p_outbox_id uuid,p_token uuid,p_recipient_email text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_recipient_email is null or length(p_recipient_email) not between 3 and 320 or p_recipient_email<>lower(trim(p_recipient_email)) or position('@' in p_recipient_email)<=1 then raise exception 'recipient email must be a normalized lowercase address'; end if;
  update public.notification_outbox set recipient_email=p_recipient_email,claimed_from_status='queued',last_error_code=null,last_error_summary=null
    where id=p_outbox_id and status='processing' and processing_token=p_token and event_type='bioblitz_winner' and provider_call_phase='idle' and recipient_email is null;
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_wait_recipient(p_outbox_id uuid,p_token uuid,p_next_attempt_at timestamptz,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_next_attempt_at is null or p_next_attempt_at<=clock_timestamp() or p_next_attempt_at>clock_timestamp()+interval '7 days' then raise exception 'next recipient attempt must be within seven days'; end if;
  if p_error_code is null or p_error_code not in ('recipient_missing','recipient_lookup_failed') then raise exception 'unsupported recipient error code'; end if;
  update public.notification_outbox set status='waiting_recipient',next_attempt_at=p_next_attempt_at,last_error_code=p_error_code,
    last_error_summary=case p_error_code when 'recipient_missing' then 'Recipient email is not available' else 'Recipient lookup failed' end,
    locked_until=null,processing_token=null,claimed_from_status=null where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='idle' and event_type='bioblitz_winner' and recipient_email is null;
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_freeze_request(p_outbox_id uuid,p_token uuid,p_from text,p_to text,p_subject text,p_html text,p_text text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype;
begin
  if p_from is null or length(p_from) not between 1 and 320 or p_to is null or length(p_to) not between 3 and 320 or
     p_subject is null or length(p_subject) not between 1 and 998 or p_html is null or length(p_html) not between 1 and 262144 or
     p_text is null or length(p_text) not between 1 and 262144 then raise exception 'complete frozen request fields are required and bounded'; end if;
  select * into v from public.notification_outbox where id=p_outbox_id and status='processing' and processing_token=p_token for update;
  if not found or v.provider_call_phase<>'idle' or v.recipient_email is null then return false; end if;
  if v.frozen_from is not null then
    if (v.frozen_from,v.frozen_to,v.frozen_subject,v.frozen_html,v.frozen_text) is distinct from (p_from,p_to,p_subject,p_html,p_text) then raise exception 'frozen request conflict: request fields cannot change'; end if;
    return true;
  end if;
  if p_to<>v.recipient_email then raise exception 'frozen destination must match resolved recipient email'; end if;
  update public.notification_outbox set frozen_from=p_from,frozen_to=p_to,frozen_subject=p_subject,frozen_html=p_html,frozen_text=p_text where id=p_outbox_id;
  return true;
end $$;

create function public.notification_outbox_begin_provider_call(p_outbox_id uuid,p_token uuid,p_idempotency_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype;
begin
  if p_idempotency_expires_at is null or p_idempotency_expires_at<=clock_timestamp() or p_idempotency_expires_at>clock_timestamp()+interval '7 days' then raise exception 'idempotency expiry must be in the future and no more than seven days away'; end if;
  select * into v from public.notification_outbox where id=p_outbox_id and status='processing' and processing_token=p_token and frozen_from is not null for update;
  if not found then return false; end if;
  if v.provider_call_phase='in_flight' and v.provider_idempotency_expires_at<=clock_timestamp() then return false; end if;
  update public.notification_outbox set provider_call_phase='in_flight',
    provider_call_is_ambiguous_retry=(v.provider_call_phase='in_flight'),
    -- A resumed ambiguous call may shorten, but must never extend, the guarantee
    -- durably recorded before the call that may already have succeeded.
    provider_idempotency_expires_at=case when v.provider_call_phase='in_flight' then least(v.provider_idempotency_expires_at,p_idempotency_expires_at) else p_idempotency_expires_at end,
    provider_attempt_count=provider_attempt_count+1 where id=p_outbox_id;
  return true;
end $$;

create function public.notification_outbox_defer_ambiguous(p_outbox_id uuid,p_token uuid,p_reclaim_at timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype;
begin
  select * into v from public.notification_outbox
    where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='in_flight'
    for update;
  if not found then return false; end if;
  if p_reclaim_at is null or p_reclaim_at<=clock_timestamp() or p_reclaim_at>=v.provider_idempotency_expires_at then
    raise exception 'ambiguous reclaim must be scheduled in the future and inside the original idempotency guarantee';
  end if;
  update public.notification_outbox set locked_until=p_reclaim_at,processing_token=pg_catalog.gen_random_uuid(),
    last_error_code='provider_timeout',last_error_summary='Provider outcome is uncertain; retry remains inside the original idempotency guarantee'
    where id=p_outbox_id;
  return true;
end $$;

create function public.notification_outbox_record_provider_failure(p_outbox_id uuid,p_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_error_code is null or p_error_code not in ('provider_5xx','provider_rate_limited','provider_rejected','notification_invalid') then raise exception 'unsupported provider error code'; end if;
  update public.notification_outbox set
    provider_call_phase=case when provider_call_is_ambiguous_retry then 'in_flight' else 'idle' end,
    provider_idempotency_expires_at=case when provider_call_is_ambiguous_retry then provider_idempotency_expires_at else null end,
    last_error_code=p_error_code,
    last_error_summary=case p_error_code
      when 'provider_5xx' then 'Provider returned a retryable server error'
      when 'provider_rate_limited' then 'Provider rate limit requires a later retry'
      when 'provider_rejected' then 'Provider permanently rejected the notification'
      else 'Notification delivery input is invalid'
    end
    where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='in_flight';
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_terminal_provider_failure(p_outbox_id uuid,p_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_error_code is null or p_error_code not in ('provider_rejected','notification_invalid') then raise exception 'unsupported permanent provider error code'; end if;
  update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code=p_error_code,
    last_error_summary=case p_error_code
      when 'provider_rejected' then 'Provider permanently rejected the notification'
      else 'Notification delivery input is invalid'
    end,
    locked_until=null,processing_token=null,claimed_from_status=null,provider_call_phase='idle',
    provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null
    where id=p_outbox_id and status='processing' and processing_token=p_token
      and provider_call_phase='in_flight' and not provider_call_is_ambiguous_retry;
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_mark_sent(p_outbox_id uuid,p_token uuid,p_provider_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_provider_id is null or length(p_provider_id) not between 1 and 256 then raise exception 'provider ID must contain 1 to 256 characters'; end if;
  update public.notification_outbox set status='sent',provider_id=p_provider_id,terminal_at=clock_timestamp(),last_error_code=null,last_error_summary=null,
    locked_until=null,processing_token=null,claimed_from_status=null,provider_call_phase='idle',provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null
    where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='in_flight' and frozen_from is not null;
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_requeue(p_outbox_id uuid,p_token uuid,p_next_attempt_at timestamptz,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; v public.notification_outbox%rowtype;
begin
  if p_next_attempt_at is null or p_next_attempt_at<=clock_timestamp() or p_next_attempt_at>clock_timestamp()+interval '7 days' then raise exception 'next attempt must be within seven days'; end if;
  if p_error_code is null or p_error_code not in ('provider_5xx','provider_rate_limited','provider_rejected','recipient_lookup_failed') then raise exception 'unsupported requeue error code'; end if;
  select * into v from public.notification_outbox
    where id=p_outbox_id and status='processing' and processing_token=p_token for update;
  if not found then return false; end if;
  if p_next_attempt_at>v.created_at+interval '7 days' then raise exception 'next attempt must not exceed the notification active boundary'; end if;
  update public.notification_outbox set status='queued',next_attempt_at=p_next_attempt_at,last_error_code=p_error_code,
    last_error_summary=case p_error_code
      when 'provider_5xx' then 'Provider returned a retryable server error'
      when 'provider_rate_limited' then 'Provider rate limit requires a later retry'
      when 'provider_rejected' then 'Provider permanently rejected the notification'
      else 'Recipient lookup failed'
    end,
    locked_until=null,processing_token=null,claimed_from_status=null where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='idle' and recipient_email is not null;
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_mark_dead(p_outbox_id uuid,p_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_error_code is null or p_error_code not in ('provider_rejected','provider_timeout','provider_idempotency_expired','active_retention_expired','notification_invalid') then raise exception 'unsupported terminal error code'; end if;
  update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code=p_error_code,
    last_error_summary=case p_error_code
      when 'provider_rejected' then 'Provider permanently rejected the notification'
      when 'provider_timeout' then 'Provider outcome remained uncertain'
      when 'provider_idempotency_expired' then 'Provider outcome remained ambiguous beyond the stored idempotency guarantee'
      when 'active_retention_expired' then 'Notification exceeded the seven-day active retention limit'
      else 'Notification delivery input is invalid'
    end,
    locked_until=null,processing_token=null,claimed_from_status=null where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='idle';
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_suppress_claimed(p_outbox_id uuid,p_token uuid,p_error_code text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_error_code is null or p_error_code not in ('invitation_not_pending','manually_suppressed') then raise exception 'unsupported suppression code'; end if;
  update public.notification_outbox set status='suppressed',terminal_at=clock_timestamp(),
    input_fingerprint_hash=null,payload=null,source_id=null,recipient_did=null,recipient_email=null,
    template_key=null,locale=null,frozen_from=null,frozen_to=null,frozen_subject=null,
    frozen_html=null,frozen_text=null,provider_id=null,provider_idempotency_key=null,
    last_error_code=null,last_error_summary=null,processing_run_count=0,provider_attempt_count=0,provider_call_is_ambiguous_retry=false,
    last_manual_retry_at=null,manual_retry_count=0,locked_until=null,processing_token=null,claimed_from_status=null
    where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='idle';
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_release_claim(p_outbox_id uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  update public.notification_outbox set status=claimed_from_status,next_attempt_at=clock_timestamp(),locked_until=null,processing_token=null,claimed_from_status=null
    where id=p_outbox_id and status='processing' and processing_token=p_token and provider_call_phase='idle';
  get diagnostics n=row_count; return n=1;
end $$;

create function public.notification_outbox_suppress_event(p_event_key text,p_event_type text)
returns table(outbox_id uuid,status text,duplicate boolean)
language plpgsql security definer set search_path='' as $$
declare v_hash text; v public.notification_outbox%rowtype; v_id uuid;
begin
  if p_event_key is null or length(p_event_key) not between 1 and 512 then raise exception 'event key must contain 1 to 512 characters'; end if;
  if p_event_type is null or p_event_type not in ('signup','membership_joined','invitation','bioblitz_winner') then raise exception 'unsupported event type'; end if;
  v_hash=extensions.notification_outbox_sha256(pg_catalog.convert_to(p_event_key,'UTF8'));
  loop
    select * into v from public.notification_outbox where event_key_hash=v_hash for update;
    if found then
      if v.event_type<>p_event_type then raise exception 'notification_outbox_idempotency_conflict: event type differs'; end if;
      if v.status in ('waiting_recipient','queued','dead') or (v.status='processing' and v.provider_call_phase='idle') then
        update public.notification_outbox set status='suppressed',terminal_at=clock_timestamp(),
          input_fingerprint_hash=null,payload=null,source_id=null,recipient_did=null,recipient_email=null,
          template_key=null,locale=null,frozen_from=null,frozen_to=null,frozen_subject=null,
          frozen_html=null,frozen_text=null,provider_id=null,provider_idempotency_key=null,
          last_error_code=null,last_error_summary=null,processing_run_count=0,provider_attempt_count=0,provider_call_is_ambiguous_retry=false,
          last_manual_retry_at=null,manual_retry_count=0,locked_until=null,processing_token=null,claimed_from_status=null
          where id=v.id returning notification_outbox.status into v.status;
      end if;
      return query select v.id,v.status,true; return;
    end if;
    v_id=pg_catalog.gen_random_uuid();
    begin
      insert into public.notification_outbox(id,event_key_hash,input_fingerprint_hash,event_type,template_key,provider_idempotency_key,status,
        terminal_at,last_error_code)
      values(v_id,v_hash,null,p_event_type,null,null,'suppressed',clock_timestamp(),null);
      return query select v_id,'suppressed'::text,false; return;
    exception when unique_violation then
      -- A concurrent enqueue or suppression owns the event hash. Retry the
      -- locked existing-row path so unsent work is suppressed atomically.
    end;
  end loop;
end $$;

create function public.notification_invitation_create(
  p_invitation_id uuid,p_repo text,p_email text,p_role text,p_inviter_did text,p_inviter_handle text,p_inviter_email text,
  p_group_name text,p_group_handle text,p_inviter_name text,p_inviter_url text,p_public_origin text,p_locale text,
  p_enqueue_notification boolean,p_created_at timestamptz,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_invitation record;
  v_outbox_id uuid;
  v_outbox_status text;
  v_duplicate boolean;
  v_event_key text;
  v_event_hash text;
  v_payload jsonb;
  v_existing boolean;
begin
  if p_invitation_id is null then raise exception 'invitation ID is required'; end if;
  if p_repo is null or length(p_repo) not between 1 and 256 then raise exception 'invitation repo must contain 1 to 256 characters'; end if;
  if p_email is null or length(p_email) not between 3 and 320 or p_email<>lower(trim(p_email)) or position('@' in p_email)<=1 then raise exception 'invitation email must be normalized'; end if;
  if p_role not in ('member','admin') then raise exception 'invitation role must be member or admin'; end if;
  if p_inviter_did is null or length(p_inviter_did) not between 1 and 256 then raise exception 'inviter DID is required'; end if;
  if p_enqueue_notification is null then raise exception 'invitation notification choice is required'; end if;
  if p_created_at is null or p_expires_at is null or p_expires_at<=p_created_at or p_expires_at>p_created_at+interval '30 days' then raise exception 'invitation expiry must follow creation by at most 30 days'; end if;
  if p_public_origin is null or length(p_public_origin) not between 8 and 512 or p_public_origin !~ '^https?://' then raise exception 'public origin must be an HTTP(S) origin'; end if;
  if p_locale is not null and length(p_locale)>35 then raise exception 'locale must contain at most 35 characters'; end if;

  select * into v_invitation from public.cgs_group_invitations
    where repo=p_repo and email=p_email and status='pending' for update;
  v_existing=found;
  if v_existing and v_invitation.expires_at<=p_created_at then
    update public.cgs_group_invitations set status='expired' where id=v_invitation.id;
    perform * from public.notification_outbox_suppress_event('organization-invite:' || v_invitation.id::text,'invitation');
    v_existing=false;
  end if;
  if v_existing then
    if v_invitation.role<>p_role then raise exception 'invitation_role_conflict: cancel the pending invitation before changing its role'; end if;
  else
    begin
      insert into public.cgs_group_invitations(
        id,repo,email,role,status,inviter_did,inviter_handle,inviter_email,group_name,group_handle,created_at,updated_at,expires_at,last_email_error
      ) values (
        p_invitation_id,p_repo,p_email,p_role,'pending',p_inviter_did,p_inviter_handle,p_inviter_email,p_group_name,p_group_handle,
        p_created_at,p_created_at,p_expires_at,null
      ) returning * into v_invitation;
    exception when unique_violation then
      select * into v_invitation from public.cgs_group_invitations
        where repo=p_repo and email=p_email and status='pending' for update;
      if not found then raise; end if;
      if v_invitation.role<>p_role then raise exception 'invitation_role_conflict: cancel the pending invitation before changing its role'; end if;
    end;
  end if;

  if p_enqueue_notification then
    v_event_key='organization-invite:' || v_invitation.id::text;
    v_event_hash=extensions.notification_outbox_sha256(pg_catalog.convert_to(v_event_key,'UTF8'));
    select id,status into v_outbox_id,v_outbox_status from public.notification_outbox where event_key_hash=v_event_hash for update;
    if found then
      if (select event_type from public.notification_outbox where id=v_outbox_id)<>'invitation' then
        raise exception 'notification_outbox_idempotency_conflict: event type differs';
      end if;
      v_duplicate=true;
    else
      v_payload=pg_catalog.jsonb_build_object(
        'invitationId',v_invitation.id::text,
        'invitedEmail',v_invitation.email,
        'organizationName',v_invitation.group_name,
        'inviterName',p_inviter_name,
        'inviterUrl',p_inviter_url,
        'role',v_invitation.role,
        'acceptUrl',rtrim(p_public_origin,'/') || '/invite/' || v_invitation.id::text,
        'siteUrl',rtrim(p_public_origin,'/')
      );
      select outbox_id,status,duplicate into v_outbox_id,v_outbox_status,v_duplicate
        from public.notification_outbox_enqueue(
          v_event_key,'invitation',v_payload,v_invitation.id::text,null,v_invitation.email,
          'organization-invitation',p_locale,null,p_created_at
        );
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'invitation',to_jsonb(v_invitation),
    'notification',case when v_outbox_id is null then null else pg_catalog.jsonb_build_object(
      'outbox_id',v_outbox_id,'status',v_outbox_status,'duplicate',v_duplicate
    ) end
  );
end $$;

create function public.notification_invitation_close(
  p_invitation_id uuid,p_status text,p_accepted_by_did text,p_accepted_by_email text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_invitation record; v_notification record;
begin
  if p_status not in ('accepted','canceled','expired') then raise exception 'unsupported invitation terminal status'; end if;
  select * into v_invitation from public.cgs_group_invitations where id=p_invitation_id for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_invitation.status<>'pending' and v_invitation.status<>p_status then raise exception 'invitation_not_pending'; end if;
  if p_status='accepted' then
    if p_accepted_by_did is null or p_accepted_by_email is null then raise exception 'accepted invitation requires recipient identity'; end if;
    update public.cgs_group_invitations set status='accepted',accepted_at=coalesce(accepted_at,clock_timestamp()),
      accepted_by_did=coalesce(accepted_by_did,p_accepted_by_did),accepted_by_email=coalesce(accepted_by_email,p_accepted_by_email)
      where id=p_invitation_id returning * into v_invitation;
  else
    if p_accepted_by_did is not null or p_accepted_by_email is not null then raise exception 'non-accepted invitation must not include recipient identity'; end if;
    update public.cgs_group_invitations set status=p_status where id=p_invitation_id returning * into v_invitation;
  end if;
  select * into v_notification from public.notification_outbox_suppress_event('organization-invite:' || p_invitation_id::text,'invitation');
  return pg_catalog.jsonb_build_object('invitation',to_jsonb(v_invitation),'notification',to_jsonb(v_notification));
end $$;

create function public.notification_invitation_retry(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_invitation record; v public.notification_outbox%rowtype; v_hash text;
begin
  select * into v_invitation from public.cgs_group_invitations where id=p_invitation_id for update;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_invitation.status<>'pending' or v_invitation.expires_at<=clock_timestamp() then raise exception 'invitation_not_pending'; end if;
  v_hash=extensions.notification_outbox_sha256(pg_catalog.convert_to('organization-invite:' || p_invitation_id::text,'UTF8'));
  select * into v from public.notification_outbox where event_key_hash=v_hash for update;
  if not found then raise exception 'invitation_notification_missing'; end if;
  if v.last_manual_retry_at is not null and v.last_manual_retry_at>clock_timestamp()-interval '1 minute' then raise exception 'invitation_retry_cooldown'; end if;
  if v.status in ('queued','waiting_recipient') then
    update public.notification_outbox set next_attempt_at=clock_timestamp(),last_manual_retry_at=clock_timestamp(),manual_retry_count=manual_retry_count+1
      where id=v.id returning * into v;
  elsif v.status='dead' and v.last_error_code='provider_rejected' and v.template_key is not null and v.provider_call_phase='idle' then
    update public.notification_outbox set status='queued',terminal_at=null,next_attempt_at=clock_timestamp(),last_error_code=null,last_error_summary=null,
      last_manual_retry_at=clock_timestamp(),manual_retry_count=manual_retry_count+1 where id=v.id returning * into v;
  else
    raise exception 'invitation_notification_not_safely_retryable';
  end if;
  return pg_catalog.jsonb_build_object('outbox_id',v.id,'status',v.status,'retryable',true,'next_attempt_at',v.next_attempt_at);
end $$;

create function public.notification_bioblitz_mark_handled(p_event_key text,p_moderator_did text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v record;
begin
  if p_event_key is null or p_event_key not like 'bioblitz:%' or length(p_event_key)>512 then raise exception 'invalid BioBlitz event key'; end if;
  if p_moderator_did is null or p_moderator_did not like 'did:%' or length(p_moderator_did)>256 then raise exception 'invalid moderator identity'; end if;
  select * into v from public.notification_outbox_suppress_event(p_event_key,'bioblitz_winner');
  if v.status='sent' then raise exception 'bioblitz_notification_already_sent'; end if;
  if v.status<>'suppressed' then raise exception 'bioblitz_notification_not_safely_suppressible'; end if;
  update public.notification_outbox set manual_handled_at=coalesce(manual_handled_at,clock_timestamp()),manual_handled_by=coalesce(manual_handled_by,p_moderator_did) where id=v.outbox_id;
  return pg_catalog.jsonb_build_object('outbox_id',v.outbox_id,'status','suppressed','retryable',false,'handled_manually',true);
end $$;

create function public.notification_outbox_cleanup(p_batch_size integer)
returns table(active_expired integer,redacted integer,deleted integer)
language plpgsql security definer set search_path='' as $$
declare v public.notification_outbox%rowtype; a integer:=0; r integer:=0; d integer:=0; n integer;
begin
  if p_batch_size is null or p_batch_size not between 1 and 500 then raise exception 'batch size must be between 1 and 500'; end if;
  for v in select * from public.notification_outbox n where
    not (n.status='processing' and n.locked_until>clock_timestamp()) and (
      n.created_at<=clock_timestamp()-interval '90 days' or
      (n.status in ('waiting_recipient','queued','processing') and n.created_at<=clock_timestamp()-interval '7 days') or
      (n.status='sent' and n.template_key is not null and n.terminal_at<=clock_timestamp()-interval '7 days') or
      (n.status='dead' and n.template_key is not null and n.terminal_at<=clock_timestamp()-interval '14 days')
    ) order by n.created_at limit p_batch_size for update skip locked
  loop
    if v.created_at<=clock_timestamp()-interval '90 days' then
      delete from public.notification_outbox where id=v.id
        and not (status='processing' and locked_until>clock_timestamp());
      get diagnostics n=row_count; d=d+n;
    elsif v.status in ('waiting_recipient','queued','processing') and v.created_at<=clock_timestamp()-interval '7 days' then
      update public.notification_outbox set status='dead',terminal_at=clock_timestamp(),last_error_code='active_retention_expired',
        last_error_summary='Notification exceeded the seven-day active retention limit',locked_until=null,processing_token=null,claimed_from_status=null,
        provider_call_phase='idle',provider_call_is_ambiguous_retry=false,provider_idempotency_expires_at=null where id=v.id
        and not (status='processing' and locked_until>clock_timestamp());
      get diagnostics n=row_count; a=a+n;
    elsif (v.status='sent' and v.terminal_at<=clock_timestamp()-interval '7 days') or (v.status='dead' and v.terminal_at<=clock_timestamp()-interval '14 days') then
      update public.notification_outbox set input_fingerprint_hash=null,payload=null,source_id=null,recipient_did=null,recipient_email=null,
        template_key=null,locale=null,frozen_from=null,frozen_to=null,frozen_subject=null,frozen_html=null,frozen_text=null,
        provider_id=null,provider_idempotency_key=null,last_error_code=null,last_error_summary=null,
        processing_run_count=0,provider_attempt_count=0,provider_call_is_ambiguous_retry=false,last_manual_retry_at=null,manual_retry_count=0 where id=v.id
        and not (status='processing' and locked_until>clock_timestamp());
      get diagnostics n=row_count; r=r+n;
    end if;
  end loop;
  return query select a,r,d;
end $$;

-- All callable state transitions are service-role-only. Keep signatures explicit
-- so future overloads do not accidentally inherit PUBLIC execution.
revoke all on function public.notification_outbox_enqueue(text,text,jsonb,text,text,text,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.notification_outbox_claim_one(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.notification_outbox_claim_due(integer,integer) from public,anon,authenticated;
revoke all on function public.notification_outbox_expire_claimed(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_resolve_recipient(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_wait_recipient(uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_freeze_request(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_begin_provider_call(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.notification_outbox_defer_ambiguous(uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.notification_outbox_record_provider_failure(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_terminal_provider_failure(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_mark_sent(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_requeue(uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_mark_dead(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_suppress_claimed(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_release_claim(uuid,uuid) from public,anon,authenticated;
revoke all on function public.notification_outbox_suppress_event(text,text) from public,anon,authenticated;
revoke all on function public.notification_invitation_create(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.notification_invitation_close(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.notification_invitation_retry(uuid) from public,anon,authenticated;
revoke all on function public.notification_bioblitz_mark_handled(text,text) from public,anon,authenticated;
revoke all on function public.notification_outbox_cleanup(integer) from public,anon,authenticated;

grant execute on function public.notification_outbox_enqueue(text,text,jsonb,text,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.notification_outbox_claim_one(uuid,uuid,integer) to service_role;
grant execute on function public.notification_outbox_claim_due(integer,integer) to service_role;
grant execute on function public.notification_outbox_expire_claimed(uuid,uuid,text) to service_role;
grant execute on function public.notification_outbox_resolve_recipient(uuid,uuid,text) to service_role;
grant execute on function public.notification_outbox_wait_recipient(uuid,uuid,timestamptz,text) to service_role;
grant execute on function public.notification_outbox_freeze_request(uuid,uuid,text,text,text,text,text) to service_role;
grant execute on function public.notification_outbox_begin_provider_call(uuid,uuid,timestamptz) to service_role;
grant execute on function public.notification_outbox_defer_ambiguous(uuid,uuid,timestamptz) to service_role;
grant execute on function public.notification_outbox_record_provider_failure(uuid,uuid,text) to service_role;
grant execute on function public.notification_outbox_terminal_provider_failure(uuid,uuid,text) to service_role;
grant execute on function public.notification_outbox_mark_sent(uuid,uuid,text) to service_role;
grant execute on function public.notification_outbox_requeue(uuid,uuid,timestamptz,text) to service_role;
grant execute on function public.notification_outbox_mark_dead(uuid,uuid,text) to service_role;
grant execute on function public.notification_outbox_suppress_claimed(uuid,uuid,text) to service_role;
grant execute on function public.notification_outbox_release_claim(uuid,uuid) to service_role;
grant execute on function public.notification_outbox_suppress_event(text,text) to service_role;
grant execute on function public.notification_invitation_create(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz) to service_role;
grant execute on function public.notification_invitation_close(uuid,text,text,text) to service_role;
grant execute on function public.notification_invitation_retry(uuid) to service_role;
grant execute on function public.notification_bioblitz_mark_handled(text,text) to service_role;
grant execute on function public.notification_outbox_cleanup(integer) to service_role;
