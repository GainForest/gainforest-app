\set ON_ERROR_STOP on
\pset tuples_only on

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'assertion failed: %', message; end if;
end $$;

create or replace function pg_temp.assert_raises(statement text, expected text, message text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm like '%' || expected || '%' then return; end if;
    raise exception 'assertion failed: % (unexpected error: %)', message, sqlerrm;
  end;
  raise exception 'assertion failed: % (no error)', message;
end $$;

-- Schema, RLS, grants, and bounded constraints.
select pg_temp.assert_true(to_regclass('public.notification_outbox') is not null, 'table exists');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.notification_outbox'::regclass), 'RLS enabled');
select pg_temp.assert_true(not has_table_privilege('anon','public.notification_outbox','select'), 'anon cannot select');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.notification_outbox','insert'), 'authenticated cannot insert');
select pg_temp.assert_true(not has_table_privilege('service_role','public.notification_outbox','update'), 'service role cannot arbitrarily patch state');
select pg_temp.assert_true(has_table_privilege('service_role','public.notification_outbox','select'), 'service role can inspect rows');
select pg_temp.assert_true(not has_function_privilege('public','public.notification_outbox_claim_due(integer,integer)','execute'), 'PUBLIC cannot claim');
select pg_temp.assert_true(not has_function_privilege('anon','public.notification_outbox_enqueue(text,text,jsonb,text,text,text,text,text,text,text,timestamptz)','execute'), 'anon cannot enqueue');
select pg_temp.assert_true(has_function_privilege('service_role','public.notification_outbox_claim_due(integer,integer)','execute'), 'service role can claim');
select pg_temp.assert_true(not has_function_privilege('public','public.notification_outbox_expire_claimed(uuid,uuid,text)','execute') and has_function_privilege('service_role','public.notification_outbox_expire_claimed(uuid,uuid,text)','execute'), 'claimed expiry is service-role-only');
select pg_temp.assert_true(not has_function_privilege('public','public.notification_outbox_terminal_provider_failure(uuid,uuid,text)','execute') and has_function_privilege('service_role','public.notification_outbox_terminal_provider_failure(uuid,uuid,text)','execute'), 'atomic permanent provider terminalization is service-role-only');
select pg_temp.assert_true(to_regprocedure('public.notification_outbox_suppress_event(text,text)') is not null, 'mode-independent suppression RPC exists');
select pg_temp.assert_true(to_regprocedure('public.notification_outbox_suppress_event(text,text,text)') is null, 'mode-dependent suppression RPC is absent');
select pg_temp.assert_true((select count(*)=1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='notification_outbox_suppress_event'), 'only one suppression RPC signature exists');
select pg_temp.assert_true(not has_function_privilege('public','public.notification_outbox_suppress_event(text,text)','execute') and not has_function_privilege('anon','public.notification_outbox_suppress_event(text,text)','execute') and not has_function_privilege('authenticated','public.notification_outbox_suppress_event(text,text)','execute'), 'browser roles cannot suppress events');
select pg_temp.assert_true(not has_function_privilege('public','public.notification_invitation_create(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone)','execute') and has_function_privilege('service_role','public.notification_invitation_create(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone)','execute'), 'atomic invitation creation is service-role-only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.notification_invitation_close(uuid,text,text,text)','execute') and has_function_privilege('service_role','public.notification_invitation_close(uuid,text,text,text)','execute'), 'invitation closing is service-role-only');
select pg_temp.assert_true(not has_function_privilege('anon','public.notification_invitation_retry(uuid)','execute') and has_function_privilege('service_role','public.notification_invitation_retry(uuid)','execute'), 'invitation retry is service-role-only');
select pg_temp.assert_true(to_regprocedure('extensions.notification_outbox_sha256(bytea)') is not null, 'internal SHA-256 helper exists');
select pg_temp.assert_true(not has_function_privilege('public','extensions.notification_outbox_sha256(bytea)','execute') and not has_function_privilege('anon','extensions.notification_outbox_sha256(bytea)','execute') and not has_function_privilege('authenticated','extensions.notification_outbox_sha256(bytea)','execute') and not has_function_privilege('service_role','extensions.notification_outbox_sha256(bytea)','execute'), 'internal SHA-256 helper is not directly callable by API roles');
select pg_temp.assert_true(to_regprocedure('public.notification_outbox_wait_recipient(uuid,uuid,timestamp with time zone,text,text)') is null, 'free-form recipient error summary RPC is absent');
select pg_temp.assert_true(to_regprocedure('public.notification_outbox_defer_ambiguous(uuid,uuid,timestamp with time zone,text)') is null, 'free-form ambiguity error summary RPC is absent');
select pg_temp.assert_true(to_regprocedure('public.notification_outbox_record_provider_failure(uuid,uuid,text,text)') is null, 'free-form provider error summary RPC is absent');
select pg_temp.assert_true(to_regprocedure('public.notification_outbox_requeue(uuid,uuid,timestamp with time zone,text,text)') is null, 'free-form requeue error summary RPC is absent');
select pg_temp.assert_true(to_regprocedure('public.notification_outbox_mark_dead(uuid,uuid,text,text)') is null, 'free-form terminal error summary RPC is absent');
select pg_temp.assert_true((select bool_and(
  not has_function_privilege('public',p.oid,'execute') and
  not has_function_privilege('anon',p.oid,'execute') and
  not has_function_privilege('authenticated',p.oid,'execute') and
  has_function_privilege('service_role',p.oid,'execute')
) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'notification_outbox_%' and p.proname<>'notification_outbox_guard_immutable'), 'every callable outbox RPC is service-role-only');

select pg_temp.assert_raises(
  $$set local role anon; select * from public.notification_outbox$$,
  'permission denied', 'actual anon table read is denied'
);
select pg_temp.assert_raises(
  $$set local role authenticated; select * from public.notification_outbox_claim_due(1, 60)$$,
  'permission denied', 'actual authenticated RPC execution is denied'
);
reset role;

truncate public.notification_outbox;

-- Enqueue derives hashes in SQL, is deterministic, and distinguishes conflicts.
create temp table first_enqueue as
select * from public.notification_outbox_enqueue(
  'signup:event-1', 'signup', '{"name":"One"}'::jsonb, 'event-1', null,
  'person@example.com', 'welcome', 'en', 'event-1', 'resend', clock_timestamp()
);
select pg_temp.assert_true(not (select duplicate from first_enqueue), 'first enqueue is not duplicate');
select pg_temp.assert_true((select length(event_key_hash)=64 from public.notification_outbox where id=(select outbox_id from first_enqueue)), 'event hash is SHA-256 hex');
select pg_temp.assert_true((select length(input_fingerprint_hash)=64 from public.notification_outbox where id=(select outbox_id from first_enqueue)), 'input fingerprint is stored');
select pg_temp.assert_true((select provider_idempotency_key='event-1' from public.notification_outbox where id=(select outbox_id from first_enqueue)), 'welcome provider key preserves the immutable auth event source ID');

create temp table duplicate_enqueue as
select * from public.notification_outbox_enqueue(
  'signup:event-1', 'signup', '{"name":"One"}'::jsonb, 'event-1', null,
  'person@example.com', 'welcome', 'en', 'event-1', 'resend', clock_timestamp() + interval '1 hour'
);
select pg_temp.assert_true((select duplicate from duplicate_enqueue), 'exact replay is duplicate');
select pg_temp.assert_true((select outbox_id from first_enqueue)=(select outbox_id from duplicate_enqueue), 'exact replay returns same row');
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('signup:event-1','signup','{"name":"Changed"}'::jsonb,'event-1',null,'person@example.com','welcome','en','event-1','resend',clock_timestamp())$$,
  'notification_outbox_idempotency_conflict', 'changed delivery input conflicts'
);
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue(repeat('x',513),'signup','{}'::jsonb,'x',null,'person@example.com','welcome','en','key','resend',clock_timestamp())$$,
  'event key', 'event key is bounded'
);
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('bad-email','signup','{}'::jsonb,'x',null,' Person@Example.com ','welcome','en','x','resend',clock_timestamp())$$,
  'recipient email', 'email must already be normalized'
);
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('bad-mode','signup','{}'::jsonb,'x',null,'person@example.com','welcome','en','key','disabled',clock_timestamp())$$,
  'delivery mode', 'disabled mode never creates a row'
);
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('welcome-wrong-key','signup','{}'::jsonb,'auth-event',null,'person@example.com','welcome','en','other-key','resend',clock_timestamp())$$,
  'must equal source ID', 'welcome callers cannot select a provider key distinct from the auth event ID'
);
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('welcome-missing-source','membership_joined','{}'::jsonb,null,null,'person@example.com','welcome','en',null,'resend',clock_timestamp())$$,
  'source ID', 'welcome provider ownership requires the immutable auth event ID'
);
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('generated-arbitrary','invitation','{}'::jsonb,'invite',null,'person@example.com','invite','en','caller-key','resend',clock_timestamp())$$,
  'must not be supplied', 'invitation callers cannot select a provider key'
);
create temp table generated_provider_key as
select * from public.notification_outbox_enqueue(
  'generated:invitation', 'invitation', '{}'::jsonb, 'invite-generated', null,
  'invitee@example.com', 'invite', 'en', null, 'resend', clock_timestamp()
);
select pg_temp.assert_true((select provider_idempotency_key=id::text from public.notification_outbox where id=(select outbox_id from generated_provider_key)), 'invitation provider key is generated from its row UUID');
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('welcome:key-collision','signup','{}'::jsonb,'event-1',null,'other@example.com','welcome','en','event-1','resend',clock_timestamp())$$,
  'provider', 'two rows cannot share a provider key'
);
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('bio-no-did','bioblitz_winner','{}'::jsonb,'x',null,null,'bio','en',null,'resend',clock_timestamp())$$,
  'recipient', 'BioBlitz requires a DID'
);

-- Claims are token owned, return prior state/phase, and reject stale/cross-row tokens.
create temp table queued_two as
select * from public.notification_outbox_enqueue(
  'signup:event-2', 'signup', '{}'::jsonb, 'event-2', null,
  'two@example.com', 'welcome', 'en', 'event-2', 'resend', clock_timestamp()
);
create temp table claim_one as
select * from public.notification_outbox_claim_one(
  (select outbox_id from queued_two), '20000000-0000-4000-8000-000000000001', 60
);
select pg_temp.assert_true((select previous_status='queued' from claim_one), 'claim returns previous queued status');
select pg_temp.assert_true((select resume_provider_call_phase='idle' from claim_one), 'claim returns idle phase');
select pg_temp.assert_true((select processing_run_count=1 from public.notification_outbox where id=(select outbox_id from queued_two)), 'claim increments processing run only');
select pg_temp.assert_true(not public.notification_outbox_release_claim((select outbox_id from queued_two),'20000000-0000-4000-8000-000000000099'), 'stale token cannot release');

create temp table queued_three as
select * from public.notification_outbox_enqueue(
  'signup:event-3', 'signup', '{}'::jsonb, 'event-3', null,
  'three@example.com', 'welcome', 'en', 'event-3', 'resend', clock_timestamp()
);
select pg_temp.assert_true(not public.notification_outbox_release_claim((select outbox_id from queued_three),'20000000-0000-4000-8000-000000000001'), 'token cannot mutate a different row');
select pg_temp.assert_true(public.notification_outbox_release_claim((select outbox_id from queued_two),'20000000-0000-4000-8000-000000000001'), 'owner can release idle claim');
select pg_temp.assert_true((select status='queued' and processing_token is null from public.notification_outbox where id=(select outbox_id from queued_two)), 'release restores queue and clears ownership');

-- Recipient waiting/resolution uses token-guarded transitions.
create temp table bio as
select * from public.notification_outbox_enqueue(
  'bioblitz:1:most-observations:did:plc:winner', 'bioblitz_winner', '{"round":1}'::jsonb, 'round-1', 'did:plc:winner',
  null, 'bio-winner', 'en', null, 'resend', clock_timestamp()
);
select pg_temp.assert_true((select status='waiting_recipient' from public.notification_outbox where id=(select outbox_id from bio)), 'missing BioBlitz email waits');
select * from public.notification_outbox_claim_one((select outbox_id from bio),'30000000-0000-4000-8000-000000000001',60);
select pg_temp.assert_true(public.notification_outbox_wait_recipient((select outbox_id from bio),'30000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour','recipient_missing'), 'recipient wait releases claim');
select pg_temp.assert_true((select last_error_code='recipient_missing' and last_error_summary='Recipient email is not available' from public.notification_outbox where id=(select outbox_id from bio)), 'recipient wait stores an allowlisted actionable summary');
create temp table future_claim as select * from public.notification_outbox_claim_one((select outbox_id from bio),'30000000-0000-4000-8000-000000000002',60);
select pg_temp.assert_true((select count(*)=0 from future_claim), 'future not-due row claim returns zero rows');
select pg_temp.assert_true((select status='waiting_recipient' and processing_token is null from public.notification_outbox where id=(select outbox_id from bio)), 'future not-due row remains waiting without a token');
update public.notification_outbox set next_attempt_at=clock_timestamp()-interval '1 second' where id=(select outbox_id from bio);
select * from public.notification_outbox_claim_one((select outbox_id from bio),'30000000-0000-4000-8000-000000000003',60);
select pg_temp.assert_true(public.notification_outbox_resolve_recipient((select outbox_id from bio),'30000000-0000-4000-8000-000000000003','winner@example.com'), 'recipient resolution freezes destination candidate under claim');
select pg_temp.assert_true((select recipient_email='winner@example.com' from public.notification_outbox where id=(select outbox_id from bio)), 'resolved email stored');
update public.notification_outbox set locked_until=clock_timestamp()-interval '1 second' where id=(select outbox_id from bio);
create temp table resolved_reclaim as select * from public.notification_outbox_claim_one((select outbox_id from bio),'30000000-0000-4000-8000-000000000004',60);
select pg_temp.assert_true((select previous_status='processing' and resume_provider_call_phase='idle' from resolved_reclaim), 'resolved recipient work is reclaimable after a crash');
select pg_temp.assert_true((select recipient_email='winner@example.com' and processing_token='30000000-0000-4000-8000-000000000004' from public.notification_outbox where id=(select outbox_id from bio)), 'reclaim preserves the persisted recipient under the new token');
select pg_temp.assert_true(not public.notification_outbox_release_claim((select outbox_id from bio),'30000000-0000-4000-8000-000000000003'), 'pre-crash token cannot release reclaimed recipient work');
select pg_temp.assert_true(public.notification_outbox_release_claim((select outbox_id from bio),'30000000-0000-4000-8000-000000000004'), 'reclaimed resolved recipient can release');
select pg_temp.assert_true((select status='queued' and recipient_email='winner@example.com' from public.notification_outbox where id=(select outbox_id from bio)), 'resolved recipient remains frozen when released to queued');

-- Frozen request, provider phases, separate counters, authoritative failure, and terminal capture.
select * from public.notification_outbox_claim_one((select outbox_id from queued_three),'39000000-0000-4000-8000-000000000001',60);
select pg_temp.assert_raises(
  format($q$select public.notification_outbox_freeze_request('%s','39000000-0000-4000-8000-000000000001','GainForest <hello@example.com>','wrong@example.com','Hello','<p>Hello</p>','Hello')$q$,(select outbox_id from queued_three)),
  'frozen destination', 'initial freeze destination must match the recipient'
);
select pg_temp.assert_true((select frozen_at is null and frozen_to is null and frozen_subject is null and frozen_html is null and frozen_text is null from public.notification_outbox where id=(select outbox_id from queued_three)), 'rejected initial freeze writes no frozen fields');
select pg_temp.assert_true(public.notification_outbox_release_claim((select outbox_id from queued_three),'39000000-0000-4000-8000-000000000001'), 'initial freeze mismatch leaves the claim releasable');

select * from public.notification_outbox_claim_one((select outbox_id from queued_two),'40000000-0000-4000-8000-000000000001',60);
select pg_temp.assert_true(public.notification_outbox_freeze_request((select outbox_id from queued_two),'40000000-0000-4000-8000-000000000001','GainForest <hello@example.com>','two@example.com','Hello','<p>Hello</p>','Hello'), 'request freezes');
select pg_temp.assert_true(public.notification_outbox_freeze_request((select outbox_id from queued_two),'40000000-0000-4000-8000-000000000001','GainForest <hello@example.com>','two@example.com','Hello','<p>Hello</p>','Hello'), 'identical freeze is idempotent');
select pg_temp.assert_raises(
  format($q$select public.notification_outbox_freeze_request('%s','40000000-0000-4000-8000-000000000001','GainForest <hello@example.com>','other@example.com','Hello','<p>Hello</p>','Hello')$q$,(select outbox_id from queued_two)),
  'frozen request conflict', 'frozen request cannot change'
);
select pg_temp.assert_true(public.notification_outbox_begin_provider_call((select outbox_id from queued_two),'40000000-0000-4000-8000-000000000001',clock_timestamp()+interval '24 hours'), 'provider call starts durably');
select pg_temp.assert_true((select provider_call_phase='in_flight' and provider_attempt_count=1 and processing_run_count=2 from public.notification_outbox where id=(select outbox_id from queued_two)), 'provider and processing counts are separate');
select pg_temp.assert_true(not public.notification_outbox_release_claim((select outbox_id from queued_two),'40000000-0000-4000-8000-000000000001'), 'in-flight claim cannot be released');
select pg_temp.assert_raises(
  format($q$select public.notification_outbox_record_provider_failure('%s','40000000-0000-4000-8000-000000000001','provider_timeout')$q$,(select outbox_id from queued_two)),
  'unsupported provider error code', 'timeout cannot clear an ambiguous provider call'
);
select pg_temp.assert_true(public.notification_outbox_record_provider_failure((select outbox_id from queued_two),'40000000-0000-4000-8000-000000000001','provider_5xx'), 'authoritative response returns to idle');
select pg_temp.assert_true((select provider_call_phase='idle' and provider_idempotency_expires_at is null from public.notification_outbox where id=(select outbox_id from queued_two)), 'authoritative failure clears ambiguity state');
select pg_temp.assert_raises(
  format($q$select public.notification_outbox_requeue('%s','40000000-0000-4000-8000-000000000001',clock_timestamp()+interval '5 minutes','provider_timeout')$q$,(select outbox_id from queued_two)),
  'unsupported requeue error code', 'timeout cannot use ordinary requeue'
);
select pg_temp.assert_true(public.notification_outbox_requeue((select outbox_id from queued_two),'40000000-0000-4000-8000-000000000001',clock_timestamp()+interval '5 minutes','provider_5xx'), 'idle work requeues');

-- Fresh authoritative permanent provider responses terminalize directly from
-- in_flight in one token-owned transition. Resumed ambiguity is defer-only.
create temp table permanent_provider_codes(code text);
insert into permanent_provider_codes values ('provider_rejected'),('notification_invalid');
do $$
declare v_code text; v_id uuid; v_token uuid; v_key text;
begin
  for v_code in select code from permanent_provider_codes loop
    v_token=pg_catalog.gen_random_uuid(); v_key='atomic-permanent:' || v_code;
    select outbox_id into v_id from public.notification_outbox_enqueue(
      v_key,'signup','{}',v_key,null,(v_code || '@example.com'), 'welcome','en',v_key,'resend',clock_timestamp()
    );
    perform public.notification_outbox_claim_one(v_id,v_token,60);
    perform pg_temp.assert_true(public.notification_outbox_freeze_request(v_id,v_token,'from@example.com',(v_code || '@example.com'),'Permanent','Permanent','Permanent'),'atomic permanent request freezes');
    perform pg_temp.assert_true(public.notification_outbox_begin_provider_call(v_id,v_token,clock_timestamp()+interval '1 hour'),'atomic permanent provider call begins');
    perform pg_temp.assert_true(public.notification_outbox_terminal_provider_failure(v_id,v_token,v_code),'fresh permanent provider result terminalizes atomically');
    perform pg_temp.assert_true((select status='dead' and last_error_code=v_code and provider_call_phase='idle' and processing_token is null and locked_until is null from public.notification_outbox where id=v_id),'atomic permanent terminalization clears provider and lease state');
    perform pg_temp.assert_true(not exists(select 1 from public.notification_outbox_claim_one(v_id,pg_catalog.gen_random_uuid(),60)),'atomic permanent terminal row is unclaimable');
    perform pg_temp.assert_true(not public.notification_outbox_mark_sent(v_id,v_token,'late-provider'),'atomic permanent terminal row cannot later complete sent');
    perform pg_temp.assert_true(not public.notification_outbox_terminal_provider_failure(v_id,v_token,v_code),'atomic permanent transition rejects stale ownership');
  end loop;
end $$;

create temp table atomic_ambiguous as
select * from public.notification_outbox_enqueue('atomic:ambiguous','signup','{}','atomic-ambiguous',null,'atomic-ambiguous@example.com','welcome','en','atomic-ambiguous','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from atomic_ambiguous),'49000000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select outbox_id from atomic_ambiguous),'49000000-0000-4000-8000-000000000001','from@example.com','atomic-ambiguous@example.com','Ambiguous','Ambiguous','Ambiguous');
select public.notification_outbox_begin_provider_call((select outbox_id from atomic_ambiguous),'49000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
update public.notification_outbox set locked_until=clock_timestamp()-interval '1 second' where id=(select outbox_id from atomic_ambiguous);
create temp table atomic_ambiguous_reclaim as select * from public.notification_outbox_claim_one((select outbox_id from atomic_ambiguous),'49000000-0000-4000-8000-000000000002',60);
select pg_temp.assert_true(not public.notification_outbox_terminal_provider_failure((select outbox_id from atomic_ambiguous),'49000000-0000-4000-8000-000000000002','provider_rejected'), 'resumed ambiguous retry refuses permanent terminalization');
select pg_temp.assert_true((select status='processing' and provider_call_phase='in_flight' and provider_call_is_ambiguous_retry from public.notification_outbox where id=(select outbox_id from atomic_ambiguous)), 'refused permanent terminalization preserves ambiguity');
select pg_temp.assert_true(public.notification_outbox_defer_ambiguous((select outbox_id from atomic_ambiguous),'49000000-0000-4000-8000-000000000002',clock_timestamp()+interval '1 second'), 'refused resumed permanent response remains defer-only');

create temp table capture as
select * from public.notification_outbox_enqueue('capture:event','signup','{}'::jsonb,'capture',null,'capture@example.com','welcome','en','capture','capture',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from capture),'50000000-0000-4000-8000-000000000001',60);
select pg_temp.assert_true(public.notification_outbox_freeze_request((select outbox_id from capture),'50000000-0000-4000-8000-000000000001','GainForest <hello@example.com>','capture@example.com','Captured','<p>Captured</p>','Captured'), 'capture request freezes');
select pg_temp.assert_true(public.notification_outbox_begin_provider_call((select outbox_id from capture),'50000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour'), 'capture provider phase starts');
select pg_temp.assert_true(public.notification_outbox_mark_sent((select outbox_id from capture),'50000000-0000-4000-8000-000000000001','capture'), 'capture terminally completes');
select pg_temp.assert_true((select status='sent' and delivery_mode='capture' from public.notification_outbox where id=(select outbox_id from capture)), 'capture mode remains distinguishable');
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox_claim_one((select outbox_id from capture),'50000000-0000-4000-8000-000000000002',60)), 'captured terminal row is never claimable');
select pg_temp.assert_raises(format($q$update public.notification_outbox set delivery_mode='resend' where id='%s'$q$,(select outbox_id from capture)), 'immutable', 'delivery mode is immutable');

-- Expired lease reclaim: idle is safe, in-flight resumes only inside guarantee,
-- and outside guarantee becomes dead without a new claim.
create temp table idle_reclaim as
select * from public.notification_outbox_enqueue('reclaim:idle','signup','{}'::jsonb,'idle',null,'idle@example.com','welcome','en','idle','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from idle_reclaim),'60000000-0000-4000-8000-000000000001',60);
update public.notification_outbox set locked_until=clock_timestamp()-interval '1 second' where id=(select outbox_id from idle_reclaim);
create temp table idle_reclaimed as select * from public.notification_outbox_claim_one((select outbox_id from idle_reclaim),'60000000-0000-4000-8000-000000000002',60);
select pg_temp.assert_true((select previous_status='processing' and resume_provider_call_phase='idle' from idle_reclaimed), 'expired idle lease is reclaimed');
select pg_temp.assert_true(not public.notification_outbox_mark_dead((select outbox_id from idle_reclaim),'60000000-0000-4000-8000-000000000001','provider_rejected'), 'old owner cannot complete reclaimed row');

create temp table safe_ambiguous as
select * from public.notification_outbox_enqueue('reclaim:safe','signup','{}'::jsonb,'safe',null,'safe@example.com','welcome','en','safe','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000001','from@example.com','safe@example.com','Safe','Safe','Safe');
select public.notification_outbox_begin_provider_call((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000001',clock_timestamp()+interval '24 hours');
update public.notification_outbox set locked_until=clock_timestamp()-interval '1 second' where id=(select outbox_id from safe_ambiguous);
create temp table safe_reclaimed as select * from public.notification_outbox_claim_one((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000002',60);
select pg_temp.assert_true((select resume_provider_call_phase='in_flight' from safe_reclaimed), 'crash after provider start resumes inside guarantee');
select pg_temp.assert_true((select provider_attempt_count=1 from public.notification_outbox where id=(select outbox_id from safe_ambiguous)), 'reclaim does not invent provider attempt');
select pg_temp.assert_true(public.notification_outbox_begin_provider_call((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000002',clock_timestamp()+interval '48 hours'), 'resumed transmission records another provider call');
select pg_temp.assert_true((select provider_attempt_count=2 and provider_idempotency_expires_at<clock_timestamp()+interval '25 hours' and provider_call_is_ambiguous_retry from public.notification_outbox where id=(select outbox_id from safe_ambiguous)), 'resumed call is durably marked ambiguous and does not extend the original guarantee');
create temp table resumed_original as select provider_call_started_at,ambiguous_since,provider_idempotency_expires_at from public.notification_outbox where id=(select outbox_id from safe_ambiguous);
select pg_temp.assert_true(public.notification_outbox_record_provider_failure((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000002','provider_5xx'), 'authoritative failure is recorded on an ambiguous retry');
select pg_temp.assert_true((select n.provider_call_phase='in_flight' and n.provider_call_is_ambiguous_retry and n.provider_call_started_at=o.provider_call_started_at and n.ambiguous_since=o.ambiguous_since and n.provider_idempotency_expires_at=o.provider_idempotency_expires_at and n.last_error_summary='Provider returned a retryable server error' from public.notification_outbox n cross join resumed_original o where n.id=(select outbox_id from safe_ambiguous)), 'ambiguous retry failure preserves the original ambiguity window and stores only an allowlisted summary');
select pg_temp.assert_true(not public.notification_outbox_requeue((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000002',clock_timestamp()+interval '5 minutes','provider_5xx'), 'ambiguous retry failure cannot become ordinary queued work');
select pg_temp.assert_true(public.notification_outbox_defer_ambiguous((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000002',clock_timestamp()+interval '1 second'), 'ambiguous retry failure remains on the defer path');
update public.notification_outbox set locked_until=clock_timestamp()-interval '2 hours',provider_idempotency_expires_at=clock_timestamp()-interval '1 hour' where id=(select outbox_id from safe_ambiguous);
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox_claim_one((select outbox_id from safe_ambiguous),'61000000-0000-4000-8000-000000000003',60)), 'ambiguous retry is not reclaimed after the original guarantee expires');
select pg_temp.assert_true((select status='dead' and last_error_code='provider_idempotency_expired' and not provider_call_is_ambiguous_retry from public.notification_outbox where id=(select outbox_id from safe_ambiguous)), 'ambiguous retry dies at the original expiry and resets retry state');

create temp table deferred_ambiguous as
select * from public.notification_outbox_enqueue('reclaim:deferred','signup','{}'::jsonb,'deferred',null,'deferred@example.com','welcome','en','deferred','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000001','from@example.com','deferred@example.com','Deferred','Deferred','Deferred');
select public.notification_outbox_begin_provider_call((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000001',clock_timestamp()+interval '24 hours');
create temp table deferred_original as select provider_call_started_at,ambiguous_since,provider_idempotency_expires_at from public.notification_outbox where id=(select outbox_id from deferred_ambiguous);
select pg_temp.assert_true(public.notification_outbox_defer_ambiguous((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 second'), 'ambiguous timeout defers under the current token');
select pg_temp.assert_true(not public.notification_outbox_defer_ambiguous((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 second'), 'ambiguous defer invalidates the old token');
select pg_temp.assert_true((select n.provider_call_started_at=o.provider_call_started_at and n.ambiguous_since=o.ambiguous_since and n.provider_idempotency_expires_at=o.provider_idempotency_expires_at and n.locked_until<n.provider_idempotency_expires_at from public.notification_outbox n cross join deferred_original o where n.id=(select outbox_id from deferred_ambiguous)), 'defer preserves original ambiguity timestamps and expiry');
update public.notification_outbox set locked_until=clock_timestamp()-interval '1 second' where id=(select outbox_id from deferred_ambiguous);
create temp table deferred_reclaimed as select * from public.notification_outbox_claim_one((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000002',60);
select pg_temp.assert_true((select resume_provider_call_phase='in_flight' from deferred_reclaimed), 'deferred ambiguity reclaims inside the original guarantee');
select pg_temp.assert_true((select provider_call_is_ambiguous_retry from public.notification_outbox where id=(select outbox_id from deferred_ambiguous)), 'single reclaim durably marks the new owner as handling an ambiguous transmission');
select pg_temp.assert_true(public.notification_outbox_record_provider_failure((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000002','provider_5xx'), 'failure immediately after single reclaim is recorded');
select pg_temp.assert_true((select n.provider_call_phase='in_flight' and n.provider_call_is_ambiguous_retry and n.provider_call_started_at=o.provider_call_started_at and n.ambiguous_since=o.ambiguous_since and n.provider_idempotency_expires_at=o.provider_idempotency_expires_at from public.notification_outbox n cross join deferred_original o where n.id=(select outbox_id from deferred_ambiguous)), 'failure without another begin cannot clear reclaimed ambiguity or change its original expiry');
select pg_temp.assert_true(not public.notification_outbox_requeue((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000002',clock_timestamp()+interval '5 minutes','provider_5xx'), 'failure immediately after single reclaim cannot requeue ambiguous work');
select pg_temp.assert_true(public.notification_outbox_defer_ambiguous((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000002',clock_timestamp()+interval '1 second'), 'failure immediately after reclaim remains deferrable');
update public.notification_outbox set locked_until=clock_timestamp()-interval '2 hours',provider_idempotency_expires_at=clock_timestamp()-interval '1 hour' where id=(select outbox_id from deferred_ambiguous);
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox_claim_one((select outbox_id from deferred_ambiguous),'61500000-0000-4000-8000-000000000003',60)), 'deferred reclaimed ambiguity cannot be claimed after the original guarantee expires');
select pg_temp.assert_true((select status='dead' and last_error_code='provider_idempotency_expired' from public.notification_outbox where id=(select outbox_id from deferred_ambiguous)), 'deferred reclaimed ambiguity dies at original expiry');

create temp table unsafe_ambiguous as
select * from public.notification_outbox_enqueue('reclaim:unsafe','signup','{}'::jsonb,'unsafe',null,'unsafe@example.com','welcome','en','unsafe','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from unsafe_ambiguous),'62000000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select outbox_id from unsafe_ambiguous),'62000000-0000-4000-8000-000000000001','from@example.com','unsafe@example.com','Unsafe','Unsafe','Unsafe');
select public.notification_outbox_begin_provider_call((select outbox_id from unsafe_ambiguous),'62000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
update public.notification_outbox set locked_until=clock_timestamp()-interval '2 hours', provider_idempotency_expires_at=clock_timestamp()-interval '1 hour' where id=(select outbox_id from unsafe_ambiguous);
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox_claim_one((select outbox_id from unsafe_ambiguous),'62000000-0000-4000-8000-000000000002',60)), 'unsafe ambiguity is not reclaimed');
select pg_temp.assert_true((select status='dead' and last_error_code='provider_idempotency_expired' and terminal_at is not null from public.notification_outbox where id=(select outbox_id from unsafe_ambiguous)), 'unsafe ambiguity terminates dead');

-- Batch claim independently enforces ambiguity expiry.
create temp table batch_ambiguous as
select * from public.notification_outbox_enqueue('batch:ambiguous','signup','{}'::jsonb,'batch-ambiguous',null,'batch-ambiguous@example.com','welcome','en','batch-ambiguous','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from batch_ambiguous),'62500000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select outbox_id from batch_ambiguous),'62500000-0000-4000-8000-000000000001','from@example.com','batch-ambiguous@example.com','Batch','Batch','Batch');
select public.notification_outbox_begin_provider_call((select outbox_id from batch_ambiguous),'62500000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
update public.notification_outbox set locked_until=clock_timestamp()-interval '2 hours',provider_idempotency_expires_at=clock_timestamp()-interval '1 hour' where id=(select outbox_id from batch_ambiguous);
select * from public.notification_outbox_claim_due(10,60);
select pg_temp.assert_true((select status='dead' and last_error_code='provider_idempotency_expired' from public.notification_outbox where id=(select outbox_id from batch_ambiguous)), 'batch claim kills expired in-flight ambiguity rather than reclaiming it');

create temp table batch_safe_ambiguous as
select * from public.notification_outbox_enqueue('batch:safe-ambiguous','signup','{}'::jsonb,'batch-safe-ambiguous',null,'batch-safe@example.com','welcome','en','batch-safe-ambiguous','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select outbox_id from batch_safe_ambiguous),'62600000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select outbox_id from batch_safe_ambiguous),'62600000-0000-4000-8000-000000000001','from@example.com','batch-safe@example.com','Batch safe','Batch safe','Batch safe');
select public.notification_outbox_begin_provider_call((select outbox_id from batch_safe_ambiguous),'62600000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
update public.notification_outbox set locked_until=clock_timestamp()-interval '1 second' where id=(select outbox_id from batch_safe_ambiguous);
create temp table batch_safe_reclaimed as select * from public.notification_outbox_claim_due(10,60);
select pg_temp.assert_true((select resume_provider_call_phase='in_flight' from batch_safe_reclaimed where outbox_id=(select outbox_id from batch_safe_ambiguous)), 'batch claim reclaims expired in-flight ambiguity inside the original guarantee');
select pg_temp.assert_true((select provider_call_is_ambiguous_retry from public.notification_outbox where id=(select outbox_id from batch_safe_ambiguous)), 'batch reclaim durably marks the new owner as handling an ambiguous transmission');
select pg_temp.assert_true(public.notification_outbox_record_provider_failure((select outbox_id from batch_safe_ambiguous),(select processing_token from batch_safe_reclaimed where outbox_id=(select outbox_id from batch_safe_ambiguous)),'provider_rate_limited'), 'failure immediately after batch reclaim is recorded');
select pg_temp.assert_true(not public.notification_outbox_requeue((select outbox_id from batch_safe_ambiguous),(select processing_token from batch_safe_reclaimed where outbox_id=(select outbox_id from batch_safe_ambiguous)),clock_timestamp()+interval '5 minutes','provider_rate_limited'), 'failure immediately after batch reclaim cannot requeue ambiguous work');
select pg_temp.assert_true(public.notification_outbox_begin_provider_call((select outbox_id from batch_safe_ambiguous),(select processing_token from batch_safe_reclaimed where outbox_id=(select outbox_id from batch_safe_ambiguous)),clock_timestamp()+interval '30 minutes'), 'batch-reclaimed ambiguity records a retry transmission');
select pg_temp.assert_true(public.notification_outbox_mark_sent((select outbox_id from batch_safe_ambiguous),(select processing_token from batch_safe_reclaimed where outbox_id=(select outbox_id from batch_safe_ambiguous)),'provider-batch-safe'), 'ambiguous retry can still complete sent');
select pg_temp.assert_true((select status='sent' and provider_id='provider-batch-safe' and not provider_call_is_ambiguous_retry from public.notification_outbox where id=(select outbox_id from batch_safe_ambiguous)), 'sent completion resets ambiguous retry state');

-- Batch claim is bounded and claims due rows only.
truncate public.notification_outbox;
select * from public.notification_outbox_enqueue('batch:1','signup','{}','1',null,'one@example.com','welcome','en','1','resend',clock_timestamp());
select * from public.notification_outbox_enqueue('batch:2','signup','{}','2',null,'two@example.com','welcome','en','2','resend',clock_timestamp());
select * from public.notification_outbox_enqueue('batch:future','signup','{}','3',null,'three@example.com','welcome','en','3','resend',clock_timestamp()+interval '1 day');
create temp table batch_claim as select * from public.notification_outbox_claim_due(1,60);
select pg_temp.assert_true((select count(*)=1 from batch_claim), 'batch cap honored');
select pg_temp.assert_true((select count(*)=1 from public.notification_outbox where status='processing'), 'one batch row owns lease');
select pg_temp.assert_raises($$select * from public.notification_outbox_claim_due(101,60)$$,'batch size','batch size capped');
select pg_temp.assert_true(public.notification_outbox_suppress_claimed(
  (select id from public.notification_outbox where status='processing'),
  (select processing_token from public.notification_outbox where status='processing'),
  'invitation_not_pending'
), 'token owner can suppress idle claimed work');
select * from public.notification_outbox_claim_due(1,60);
select pg_temp.assert_true(public.notification_outbox_mark_dead(
  (select id from public.notification_outbox where status='processing'),
  (select processing_token from public.notification_outbox where status='processing'),
  'provider_rejected'
), 'token owner can terminally mark idle work dead');

-- Suppression works for existing and absent deterministic events and blocks replay.
truncate public.notification_outbox;
select * from public.notification_outbox_enqueue('existing:suppress','invitation','{"private":true}','invite-1',null,'invite@example.com','invite','en',null,'resend',clock_timestamp());
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_suppress_event('existing:suppress',null)$$,
  'unsupported event type', 'null event type cannot suppress an existing event'
);
select pg_temp.assert_true((select status='queued' and redacted_at is null from public.notification_outbox where event_key_hash=encode(extensions.digest('existing:suppress','sha256'),'hex')), 'null event type leaves the existing event unchanged');
create temp table existing_suppressed as select * from public.notification_outbox_suppress_event('existing:suppress','invitation');
select pg_temp.assert_true((select status='suppressed' and duplicate from existing_suppressed), 'existing deterministic event is suppressed in place');
select pg_temp.assert_true((select redacted_at is not null and payload is null and source_id is null and recipient_email is null and delivery_mode is null and provider_idempotency_key is null and last_error_summary is null and not provider_call_is_ambiguous_retry from public.notification_outbox where id=(select outbox_id from existing_suppressed)), 'queued suppression immediately removes private delivery data and retry state');
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('existing:suppress','signup','{}','other',null,'other@example.com','welcome','en','other','resend',clock_timestamp())$$,
  'event type differs', 'suppressed tombstone rejects a cross-type replay'
);
create temp table absent_suppressed as select * from public.notification_outbox_suppress_event('bioblitz:absent','bioblitz_winner');
select pg_temp.assert_true((select status='suppressed' and not duplicate from absent_suppressed), 'absent event gets tombstone');
create temp table replay_after_suppress as
select * from public.notification_outbox_enqueue('bioblitz:absent','bioblitz_winner','{"changed":true}','award','did:plc:winner',null,'bio','en',null,'resend',clock_timestamp());
select pg_temp.assert_true((select status='suppressed' and duplicate from replay_after_suppress), 'terminal tombstone wins over changed replay');

-- An in-flight suppression race is a typed no-op. Claimed idle suppression
-- removes private data and invalidates ownership.
select * from public.notification_outbox_enqueue('suppress:in-flight','invitation','{"private":true}','invite-flight',null,'flight@example.com','invite','en',null,'resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:in-flight','sha256'),'hex')),'68000000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:in-flight','sha256'),'hex')),'68000000-0000-4000-8000-000000000001','from@example.com','flight@example.com','Flight','private html','private text');
select public.notification_outbox_begin_provider_call((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:in-flight','sha256'),'hex')),'68000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
begin;
create temp table in_flight_suppress as select * from public.notification_outbox_suppress_event('suppress:in-flight','invitation');
select pg_temp.assert_true((select status='processing' and duplicate from in_flight_suppress), 'in-flight suppression returns existing processing as a typed no-op');
select 1;
commit;

select * from public.notification_outbox_enqueue('suppress:event-claimed','invitation','{"secret":true}','invite-event-claimed',null,'event-claimed@example.com','invite','en',null,'resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:event-claimed','sha256'),'hex')),'68050000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:event-claimed','sha256'),'hex')),'68050000-0000-4000-8000-000000000001','from@example.com','event-claimed@example.com','Private subject','Private html','Private text');
create temp table event_claimed_suppress as select * from public.notification_outbox_suppress_event('suppress:event-claimed','invitation');
select pg_temp.assert_true((select status='suppressed' and duplicate from event_claimed_suppress), 'event-level suppression handles an idle claimed row');
select pg_temp.assert_true((select status='suppressed' and redacted_at is not null and payload is null and recipient_email is null and frozen_subject is null and processing_token is null and locked_until is null from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:event-claimed','sha256'),'hex')), 'event-level suppression redacts idle claimed work and invalidates its token');
select pg_temp.assert_true(not public.notification_outbox_release_claim((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:event-claimed','sha256'),'hex')),'68050000-0000-4000-8000-000000000001'), 'event-level suppression invalidates the former owner token');

select * from public.notification_outbox_enqueue('suppress:claimed','invitation','{"secret":true}','invite-claimed',null,'claimed@example.com','invite','en',null,'resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:claimed','sha256'),'hex')),'68100000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:claimed','sha256'),'hex')),'68100000-0000-4000-8000-000000000001','from@example.com','claimed@example.com','Private subject','Private html','Private text');
select pg_temp.assert_true(public.notification_outbox_suppress_claimed((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:claimed','sha256'),'hex')),'68100000-0000-4000-8000-000000000001','manually_suppressed'), 'claimed idle suppression succeeds');
select pg_temp.assert_true((select status='suppressed' and redacted_at is not null and payload is null and recipient_email is null and source_id is null and provider_idempotency_key is null and frozen_subject is null and frozen_html is null and processing_token is null from public.notification_outbox where event_key_hash=encode(extensions.digest('suppress:claimed','sha256'),'hex')), 'claimed suppression redacts private data and frozen content, then invalidates ownership');

-- Invitation creation and notification enqueue commit atomically. Closing an
-- invitation suppresses unsent work; manual retry is permission-ready and safe.
create table public.cgs_group_invitations (
  id uuid primary key,repo text not null,email text not null,role text not null,status text not null,
  inviter_did text not null,inviter_handle text,inviter_email text,group_name text,group_handle text,
  created_at timestamptz not null,updated_at timestamptz not null,expires_at timestamptz not null,
  accepted_at timestamptz,accepted_by_did text,accepted_by_email text,email_sent_at timestamptz,last_email_error text
);
create unique index invitation_pending_identity on public.cgs_group_invitations(repo,email) where status='pending';

create temp table invitation_created as select public.notification_invitation_create(
  '81000000-0000-4000-8000-000000000001','did:plc:forest','invitee@example.com','member','did:plc:owner','owner.example.com','owner@example.com',
  'Forest Circle','forest.example.com','Forest Owner','https://example.test/account/owner','https://example.test','en','resend',
  clock_timestamp(),clock_timestamp()+interval '7 days'
) result;
select pg_temp.assert_true((select result#>>'{invitation,id}'='81000000-0000-4000-8000-000000000001' and result#>>'{notification,status}'='queued' from invitation_created), 'atomic invitation creation returns invitation and queued notification');
select pg_temp.assert_true((select count(*)=1 from public.cgs_group_invitations where id='81000000-0000-4000-8000-000000000001'), 'atomic invitation creation stores one invitation');
select pg_temp.assert_true((select count(*)=1 and bool_and(event_type='invitation' and source_id='81000000-0000-4000-8000-000000000001' and recipient_email='invitee@example.com' and provider_idempotency_key=id::text) from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000001'), 'atomic invitation creation stores one UUID-keyed outbox row');
select pg_temp.assert_true((select payload->>'acceptUrl'='https://example.test/invite/81000000-0000-4000-8000-000000000001' and payload->>'organizationName'='Forest Circle' from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000001'), 'invitation render input is frozen from committed identity');

create temp table invitation_duplicate as select public.notification_invitation_create(
  '81000000-0000-4000-8000-000000000099','did:plc:forest','invitee@example.com','member','did:plc:other','other.example.com','other@example.com',
  'Changed name','changed.example.com','Changed Inviter',null,'https://other.example','pt','capture',
  clock_timestamp(),clock_timestamp()+interval '14 days'
) result;
select pg_temp.assert_true((select result#>>'{invitation,id}'='81000000-0000-4000-8000-000000000001' and (result#>>'{notification,duplicate}')::boolean from invitation_duplicate), 'same pending identity and role returns the original invitation and notification');
select pg_temp.assert_true((select count(*)=1 from public.cgs_group_invitations where repo='did:plc:forest' and email='invitee@example.com'), 'duplicate invitation does not create a second row');
select pg_temp.assert_raises(
  $$select public.notification_invitation_create('81000000-0000-4000-8000-000000000098','did:plc:forest','invitee@example.com','admin','did:plc:owner',null,null,'Forest Circle',null,'Owner',null,'https://example.test','en','resend',clock_timestamp(),clock_timestamp()+interval '7 days')$$,
  'invitation_role_conflict', 'pending invitation role cannot be changed by replay'
);

select public.notification_invitation_create(
  '81000000-0000-4000-8000-000000000005','did:plc:expired-org','expired@example.com','member','did:plc:owner',null,null,
  'Expired Org',null,'Owner',null,'https://example.test','en','resend',clock_timestamp()-interval '8 days',clock_timestamp()-interval '1 day'
);
create temp table replaced_expired_invitation as select public.notification_invitation_create(
  '81000000-0000-4000-8000-000000000006','did:plc:expired-org','expired@example.com','admin','did:plc:owner',null,null,
  'Expired Org',null,'Owner',null,'https://example.test','en','resend',clock_timestamp(),clock_timestamp()+interval '7 days'
) result;
select pg_temp.assert_true((select result#>>'{invitation,id}'='81000000-0000-4000-8000-000000000006' from replaced_expired_invitation), 'expired pending identity can be replaced by a new invitation');
select pg_temp.assert_true((select status='expired' from public.cgs_group_invitations where id='81000000-0000-4000-8000-000000000005'), 'replacement durably expires the old invitation');
select pg_temp.assert_true((select status='suppressed' from public.notification_outbox where event_key_hash=encode(extensions.digest('organization-invite:81000000-0000-4000-8000-000000000005','sha256'),'hex')), 'replacement suppresses the expired invitation notification');

select * from public.notification_outbox_enqueue(
  'organization-invite:81000000-0000-4000-8000-000000000004','signup','{}','conflicting-source',null,
  'conflict@example.com','welcome','en','conflicting-source','resend',clock_timestamp()
);
select pg_temp.assert_raises(
  $$select public.notification_invitation_create('81000000-0000-4000-8000-000000000004','did:plc:rollback','rollback@example.com','member','did:plc:owner',null,null,'Rollback Org',null,'Owner',null,'https://example.test','en','resend',clock_timestamp(),clock_timestamp()+interval '7 days')$$,
  'notification_outbox_idempotency_conflict', 'outbox conflict rolls invitation creation back'
);
select pg_temp.assert_true(not exists(select 1 from public.cgs_group_invitations where id='81000000-0000-4000-8000-000000000004'), 'failed outbox enqueue leaves no invitation');

select pg_temp.assert_true((public.notification_invitation_retry('81000000-0000-4000-8000-000000000001')->>'status')='queued', 'queued invitation notification can be expedited');
select pg_temp.assert_raises(
  $$select public.notification_invitation_retry('81000000-0000-4000-8000-000000000001')$$,
  'invitation_retry_cooldown', 'manual invitation retry enforces database cooldown'
);
create temp table invitation_canceled as select public.notification_invitation_close('81000000-0000-4000-8000-000000000001','canceled',null,null) result;
select pg_temp.assert_true((select result#>>'{invitation,status}'='canceled' and result#>>'{notification,status}'='suppressed' from invitation_canceled), 'cancel and notification suppression commit together');
select pg_temp.assert_true((select status='suppressed' and recipient_email is null and payload is null from public.notification_outbox where event_key_hash=encode(extensions.digest('organization-invite:81000000-0000-4000-8000-000000000001','sha256'),'hex')), 'canceled invitation redacts unsent notification');

create temp table invitation_rejected as select public.notification_invitation_create(
  '81000000-0000-4000-8000-000000000002','did:plc:forest','rejected@example.com','member','did:plc:owner',null,null,
  'Forest Circle',null,'Owner',null,'https://example.test','en','resend',clock_timestamp(),clock_timestamp()+interval '7 days'
) result;
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000002'),'82000000-0000-4000-8000-000000000002',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000002'),'82000000-0000-4000-8000-000000000002','from@example.com','rejected@example.com','Invite','Invite html','Invite text');
select public.notification_outbox_begin_provider_call((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000002'),'82000000-0000-4000-8000-000000000002',clock_timestamp()+interval '1 hour');
select public.notification_outbox_terminal_provider_failure((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000002'),'82000000-0000-4000-8000-000000000002','provider_rejected');
select pg_temp.assert_true((public.notification_invitation_retry('81000000-0000-4000-8000-000000000002')->>'status')='queued', 'definitive provider rejection can be retried after operator correction');
create temp table invitation_accepted as select public.notification_invitation_close('81000000-0000-4000-8000-000000000002','accepted','did:plc:member','rejected@example.com') result;
select pg_temp.assert_true((select result#>>'{invitation,status}'='accepted' and result#>>'{notification,status}'='suppressed' from invitation_accepted), 'acceptance and queued-notification suppression commit together');

create temp table invitation_invalid as select public.notification_invitation_create(
  '81000000-0000-4000-8000-000000000003','did:plc:forest','invalid@example.com','member','did:plc:owner',null,null,
  'Forest Circle',null,'Owner',null,'https://example.test','en','resend',clock_timestamp(),clock_timestamp()+interval '7 days'
) result;
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000003'),'82000000-0000-4000-8000-000000000003',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000003'),'82000000-0000-4000-8000-000000000003','from@example.com','invalid@example.com','Invite','Invite html','Invite text');
select public.notification_outbox_begin_provider_call((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000003'),'82000000-0000-4000-8000-000000000003',clock_timestamp()+interval '1 hour');
select public.notification_outbox_terminal_provider_failure((select id from public.notification_outbox where source_id='81000000-0000-4000-8000-000000000003'),'82000000-0000-4000-8000-000000000003','notification_invalid');
select pg_temp.assert_raises(
  $$select public.notification_invitation_retry('81000000-0000-4000-8000-000000000003')$$,
  'invitation_notification_not_safely_retryable', 'invalid immutable notification cannot be manually retried'
);

-- Claim and token-owned transitions enforce retention/provider boundaries
-- independently of cleanup while preserving unexpired live leases.
truncate public.notification_outbox;
select * from public.notification_outbox_enqueue('retention:claim-one','signup','{}','claim-one',null,'claim-one@example.com','welcome','en','claim-one','resend',clock_timestamp());
update public.notification_outbox set created_at=clock_timestamp()-interval '7 days' where source_id='claim-one';
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='claim-one'),'72000000-0000-4000-8000-000000000001',60)), 'claim_one does not return retention-expired due work');
select pg_temp.assert_true((select status='dead' and last_error_code='active_retention_expired' from public.notification_outbox where source_id='claim-one'), 'claim_one terminalizes retention-expired due work');

select * from public.notification_outbox_enqueue('retention:claim-due','signup','{}','claim-due',null,'claim-due@example.com','welcome','en','claim-due','resend',clock_timestamp());
update public.notification_outbox set created_at=clock_timestamp()-interval '7 days' where source_id='claim-due';
select * from public.notification_outbox_claim_due(10,60);
select pg_temp.assert_true((select status='dead' and last_error_code='active_retention_expired' from public.notification_outbox where source_id='claim-due'), 'claim_due terminalizes retention-expired due work');

select * from public.notification_outbox_enqueue('retention:owned-idle','signup','{}','owned-idle',null,'owned-idle@example.com','welcome','en','owned-idle','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='owned-idle'),'72100000-0000-4000-8000-000000000001',60);
update public.notification_outbox set created_at=clock_timestamp()-interval '7 days' where source_id='owned-idle';
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='owned-idle'),'72100000-0000-4000-8000-000000000002',60)), 'claim_one preserves an unexpired live lease');
select pg_temp.assert_true((select status='processing' and processing_token='72100000-0000-4000-8000-000000000001' from public.notification_outbox where source_id='owned-idle'), 'live lease ownership is unchanged');
select pg_temp.assert_true(public.notification_outbox_expire_claimed((select id from public.notification_outbox where source_id='owned-idle'),'72100000-0000-4000-8000-000000000001','active_retention_expired'), 'owner expires idle work at active retention boundary');

select * from public.notification_outbox_enqueue('retention:active-flight','signup','{}','active-flight',null,'active-flight@example.com','welcome','en','active-flight','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='active-flight'),'72150000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where source_id='active-flight'),'72150000-0000-4000-8000-000000000001','from@example.com','active-flight@example.com','Flight','Flight','Flight');
select public.notification_outbox_begin_provider_call((select id from public.notification_outbox where source_id='active-flight'),'72150000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
update public.notification_outbox set created_at=clock_timestamp()-interval '7 days' where source_id='active-flight';
select pg_temp.assert_true(public.notification_outbox_expire_claimed((select id from public.notification_outbox where source_id='active-flight'),'72150000-0000-4000-8000-000000000001','active_retention_expired'), 'owner expires in-flight work at active retention boundary');
select pg_temp.assert_true((select status='dead' and provider_call_phase='idle' and last_error_code='active_retention_expired' from public.notification_outbox where source_id='active-flight'), 'active retention safely terminalizes in-flight work');

select * from public.notification_outbox_enqueue('retention:owned-flight','signup','{}','owned-flight',null,'owned-flight@example.com','welcome','en','owned-flight','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='owned-flight'),'72200000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where source_id='owned-flight'),'72200000-0000-4000-8000-000000000001','from@example.com','owned-flight@example.com','Flight','Flight','Flight');
select public.notification_outbox_begin_provider_call((select id from public.notification_outbox where source_id='owned-flight'),'72200000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
select pg_temp.assert_true(not public.notification_outbox_expire_claimed((select id from public.notification_outbox where source_id='owned-flight'),'72200000-0000-4000-8000-000000000001','provider_idempotency_expired'), 'owner cannot expire ambiguity before its stored boundary');
update public.notification_outbox set provider_idempotency_expires_at=clock_timestamp()-interval '1 second' where source_id='owned-flight';
select pg_temp.assert_true(public.notification_outbox_expire_claimed((select id from public.notification_outbox where source_id='owned-flight'),'72200000-0000-4000-8000-000000000001','provider_idempotency_expired'), 'owner expires in-flight ambiguity at stored boundary');
select pg_temp.assert_true((select status='dead' and last_error_code='provider_idempotency_expired' from public.notification_outbox where source_id='owned-flight'), 'owned in-flight expiry is terminal');

select * from public.notification_outbox_enqueue('invalid:terminal','signup','{}','invalid-terminal',null,'invalid@example.com','welcome','en','invalid-terminal','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='invalid-terminal'),'72300000-0000-4000-8000-000000000001',60);
select pg_temp.assert_true(public.notification_outbox_mark_dead((select id from public.notification_outbox where source_id='invalid-terminal'),'72300000-0000-4000-8000-000000000001','notification_invalid'), 'deterministic invalid idle work terminates');
select pg_temp.assert_true((select status='dead' and last_error_code='notification_invalid' and last_error_summary='Notification delivery input is invalid' from public.notification_outbox where source_id='invalid-terminal'), 'invalid terminal detail is allowlisted');

select * from public.notification_outbox_enqueue('requeue:active-bound','signup','{}','requeue-active-bound',null,'bound@example.com','welcome','en','requeue-active-bound','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where source_id='requeue-active-bound'),'72400000-0000-4000-8000-000000000001',60);
update public.notification_outbox set created_at=clock_timestamp()-interval '6 days' where source_id='requeue-active-bound';
select pg_temp.assert_raises(
  format($q$select public.notification_outbox_requeue('%s','72400000-0000-4000-8000-000000000001',clock_timestamp()+interval '2 days','provider_5xx')$q$,(select id from public.notification_outbox where source_id='requeue-active-bound')),
  'active boundary', 'token-owned requeue rejects a timestamp beyond the row active boundary'
);
select pg_temp.assert_true((select status='processing' and processing_token='72400000-0000-4000-8000-000000000001' from public.notification_outbox where source_id='requeue-active-bound'), 'rejected out-of-bound requeue preserves ownership');

-- Remaining retention behavior uses terminal_at for redaction, created_at for
-- cleanup, and owner-only clock changes in this disposable database.
truncate public.notification_outbox;
select * from public.notification_outbox_enqueue('retention:active','signup','{"private":true}','a',null,'active@example.com','welcome','en','a','resend',clock_timestamp());
update public.notification_outbox set created_at=clock_timestamp()-interval '7 days 1 second', updated_at=clock_timestamp()-interval '7 days 1 second';
select * from public.notification_outbox_cleanup(100);
select pg_temp.assert_true((select status='dead' and last_error_code='active_retention_expired' and terminal_at is not null from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:active','sha256'),'hex')), 'active row expires dead after seven days');

-- Build terminal rows through the public state machine, then age them.
select * from public.notification_outbox_enqueue('retention:sent','signup','{"private":true}','s',null,'sent@example.com','welcome','en','s','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex')),'70000000-0000-4000-8000-000000000001',60);
select public.notification_outbox_freeze_request((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex')),'70000000-0000-4000-8000-000000000001','from@example.com','sent@example.com','Sent','Sent html','Sent text');
select public.notification_outbox_begin_provider_call((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex')),'70000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 hour');
select public.notification_outbox_mark_sent((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex')),'70000000-0000-4000-8000-000000000001','provider-sent');
update public.notification_outbox set terminal_at=clock_timestamp()-interval '7 days 1 second' where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex');

select * from public.notification_outbox_enqueue('retention:dead','signup','{"private":true}','d',null,'dead@example.com','welcome','en','d','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:dead','sha256'),'hex')),'71000000-0000-4000-8000-000000000001',60);
select public.notification_outbox_mark_dead((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:dead','sha256'),'hex')),'71000000-0000-4000-8000-000000000001','provider_rejected');
select pg_temp.assert_true((select last_error_summary='Provider permanently rejected the notification' and last_error_summary not like '%private-ish%' from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:dead','sha256'),'hex')), 'terminal errors persist only allowlisted static summaries');
select pg_temp.assert_raises(
  format($q$select public.notification_outbox_mark_dead('%s','71000000-0000-4000-8000-000000000001','provider_rejected','private-ish provider response')$q$,(select id from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:dead','sha256'),'hex'))),
  'does not exist', 'private provider text cannot be supplied to a public transition RPC'
);
update public.notification_outbox set terminal_at=clock_timestamp()-interval '14 days 1 second' where event_key_hash=encode(extensions.digest('retention:dead','sha256'),'hex');

select * from public.notification_outbox_enqueue('retention:sent-before','signup','{"private":true}','sb',null,'sent-before@example.com','welcome','en','sb','resend',clock_timestamp());
update public.notification_outbox set status='sent',terminal_at=clock_timestamp()-interval '6 days 23 hours',provider_id='provider-before',
  frozen_from='from@example.com',frozen_to='sent-before@example.com',frozen_subject='Before',frozen_html='Before',frozen_text='Before',frozen_at=clock_timestamp()-interval '6 days 23 hours'
  where event_key_hash=encode(extensions.digest('retention:sent-before','sha256'),'hex');
select * from public.notification_outbox_enqueue('retention:dead-before','signup','{"private":true}','db',null,'dead-before@example.com','welcome','en','db','resend',clock_timestamp());
update public.notification_outbox set status='dead',terminal_at=clock_timestamp()-interval '13 days 23 hours',last_error_code='provider_rejected',last_error_summary='detail'
  where event_key_hash=encode(extensions.digest('retention:dead-before','sha256'),'hex');

select * from public.notification_outbox_cleanup(100);
select pg_temp.assert_true((select redacted_at is not null and recipient_email is null and payload is null and frozen_html is null and input_fingerprint_hash is null from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex')), 'sent redacts seven days from terminal');
select pg_temp.assert_true((select redacted_at is not null and recipient_email is null and payload is null and last_error_summary is null and input_fingerprint_hash is null from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:dead','sha256'),'hex')), 'dead redacts fourteen days from terminal');
select pg_temp.assert_true((select redacted_at is null from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent-before','sha256'),'hex')), 'sent is not redacted before seven terminal days');
select pg_temp.assert_true((select redacted_at is null from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:dead-before','sha256'),'hex')), 'dead is not redacted before fourteen terminal days');

-- Redacted replay must return retained row, never recreate, despite erased fingerprint.
create temp table redacted_replay as
select * from public.notification_outbox_enqueue('retention:sent','signup','{"different":true}','different',null,'different@example.com','other','pt','different','capture',clock_timestamp());
select pg_temp.assert_true((select duplicate and status='sent' from redacted_replay), 'redacted terminal replay returns retained row');

update public.notification_outbox set created_at=clock_timestamp()-interval '90 days 1 second' where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex');
select * from public.notification_outbox_cleanup(1);
select pg_temp.assert_true(not exists(select 1 from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent','sha256'),'hex')), 'cleanup deletes at ninety days from creation');
update public.notification_outbox set created_at=clock_timestamp()-interval '89 days 23 hours' where event_key_hash=encode(extensions.digest('retention:sent-before','sha256'),'hex');
select * from public.notification_outbox_cleanup(100);
select pg_temp.assert_true(exists(select 1 from public.notification_outbox where event_key_hash=encode(extensions.digest('retention:sent-before','sha256'),'hex')), 'cleanup retains rows before ninety created days');

-- Cleanup cannot invalidate a live unexpired processing lease.
select * from public.notification_outbox_enqueue('cleanup:live','signup','{"private":true}','cleanup-live',null,'cleanup-live@example.com','welcome','en','cleanup-live','resend',clock_timestamp());
select * from public.notification_outbox_claim_one((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('cleanup:live','sha256'),'hex')),'72000000-0000-4000-8000-000000000001',300);
update public.notification_outbox set created_at=clock_timestamp()-interval '91 days' where event_key_hash=encode(extensions.digest('cleanup:live','sha256'),'hex');
select * from public.notification_outbox_cleanup(500);
select pg_temp.assert_true((select status='processing' and processing_token='72000000-0000-4000-8000-000000000001' and locked_until>clock_timestamp() and payload is not null from public.notification_outbox where event_key_hash=encode(extensions.digest('cleanup:live','sha256'),'hex')), 'cleanup preserves an unexpired processing lease and its private state');
select pg_temp.assert_true(public.notification_outbox_mark_dead((select id from public.notification_outbox where event_key_hash=encode(extensions.digest('cleanup:live','sha256'),'hex')),'72000000-0000-4000-8000-000000000001','provider_rejected'), 'live lease owner can complete after cleanup');

-- Retained redacted identity still rejects a cross-type replay.
select pg_temp.assert_raises(
  $$select * from public.notification_outbox_enqueue('retention:dead','invitation','{}','different',null,'different@example.com','invite','en',null,'capture',clock_timestamp())$$,
  'event type differs', 'redacted tombstone rejects a cross-type replay'
);

-- Direct invalid states and bounds are rejected by table constraints.
select pg_temp.assert_raises(format($q$update public.notification_outbox set status='unknown' where id='%s'$q$,(select id from public.notification_outbox limit 1)),'notification_outbox_status_check','unknown status rejected');
select pg_temp.assert_raises(format($q$update public.notification_outbox set processing_run_count=-1 where id='%s'$q$,(select id from public.notification_outbox limit 1)),'notification_outbox_processing_run_count_check','negative processing count rejected');

select 'notification outbox SQL contracts passed';
