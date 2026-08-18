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

select pg_temp.assert_true(to_regclass('public.organization_memberships') is not null, 'membership table exists');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.organization_memberships'::regclass), 'RLS is enabled');
select pg_temp.assert_true(not has_table_privilege('anon','public.organization_memberships','select'), 'anon cannot read memberships');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.organization_memberships','select'), 'authenticated cannot read memberships directly');
select pg_temp.assert_true(has_table_privilege('service_role','public.organization_memberships','select'), 'service role can check roster freshness');
select pg_temp.assert_true(not has_table_privilege('service_role','public.organization_memberships','insert'), 'service role cannot bypass atomic replacement');
select pg_temp.assert_true(to_regprocedure('public.organization_memberships_replace_roster(text,jsonb,timestamp with time zone)') is not null, 'replacement RPC exists');
select pg_temp.assert_true(not has_function_privilege('public','public.organization_memberships_replace_roster(text,jsonb,timestamp with time zone)','execute'), 'PUBLIC cannot replace rosters');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.organization_memberships_replace_roster(text,jsonb,timestamp with time zone)','execute'), 'browser sessions cannot replace rosters');
select pg_temp.assert_true(has_function_privilege('service_role','public.organization_memberships_replace_roster(text,jsonb,timestamp with time zone)','execute'), 'service role can replace rosters');

select pg_temp.assert_true(public.organization_memberships_replace_roster(
  'did:plc:forest',
  '[{"memberDid":"did:plc:alice","role":"owner"},{"memberDid":"did:plc:bob","role":"member"}]'::jsonb,
  '2026-08-17T08:00:00Z'
), 'first complete snapshot applies');
select pg_temp.assert_true((
  select count(*)=2
    and bool_and(removed_at is null)
    and bool_and(roster_synced_at='2026-08-17T08:00:00Z')
  from public.organization_memberships
  where organization_did='did:plc:forest'
), 'first snapshot stores every active member with one roster timestamp');

select pg_temp.assert_true(public.organization_memberships_replace_roster(
  'did:plc:forest',
  '[{"memberDid":"did:plc:alice","role":"owner"},{"memberDid":"did:plc:carol","role":"admin"}]'::jsonb,
  '2026-08-17T09:00:00Z'
), 'newer snapshot applies');
select pg_temp.assert_true((
  select removed_at='2026-08-17T09:00:00Z'
    and last_confirmed_at='2026-08-17T08:00:00Z'
    and roster_synced_at='2026-08-17T09:00:00Z'
  from public.organization_memberships
  where organization_did='did:plc:forest' and member_did='did:plc:bob'
), 'missing member is marked removed without losing when they were last confirmed');
select pg_temp.assert_true((
  select role='admin' and removed_at is null and last_confirmed_at='2026-08-17T09:00:00Z'
  from public.organization_memberships
  where organization_did='did:plc:forest' and member_did='did:plc:carol'
), 'new member and role are stored');
select pg_temp.assert_true((
  select bool_and(roster_synced_at='2026-08-17T09:00:00Z')
  from public.organization_memberships
  where organization_did='did:plc:forest'
), 'active and removed rows share the latest complete roster timestamp');

select pg_temp.assert_true(not public.organization_memberships_replace_roster(
  'did:plc:forest',
  '[{"memberDid":"did:plc:alice","role":"member"},{"memberDid":"did:plc:bob","role":"admin"}]'::jsonb,
  '2026-08-17T08:30:00Z'
), 'stale concurrent snapshot is ignored');
select pg_temp.assert_true((
  select role='owner'
  from public.organization_memberships
  where organization_did='did:plc:forest' and member_did='did:plc:alice'
), 'stale snapshot cannot overwrite a newer role');
select pg_temp.assert_true((
  select removed_at is not null
  from public.organization_memberships
  where organization_did='did:plc:forest' and member_did='did:plc:bob'
), 'stale snapshot cannot reactivate a removed member');

select pg_temp.assert_true(public.organization_memberships_replace_roster(
  'did:plc:forest',
  '[{"memberDid":"did:plc:alice","role":"owner"},{"memberDid":"did:plc:bob","role":"admin"}]'::jsonb,
  '2026-08-17T10:00:00Z'
), 'later snapshot can restore a member');
select pg_temp.assert_true((
  select role='admin' and removed_at is null and last_confirmed_at='2026-08-17T10:00:00Z'
  from public.organization_memberships
  where organization_did='did:plc:forest' and member_did='did:plc:bob'
), 'restored member becomes active with the current role');

select pg_temp.assert_raises(
  $$select public.organization_memberships_replace_roster('did:plc:forest','[]'::jsonb,'2026-08-17T11:00:00Z')$$,
  'at least one member', 'empty roster cannot remove everyone'
);
select pg_temp.assert_raises(
  $$select public.organization_memberships_replace_roster('did:plc:forest','{}'::jsonb,'2026-08-17T11:00:00Z')$$,
  'JSON array', 'non-array roster input has an actionable error'
);
select pg_temp.assert_raises(
  $$select public.organization_memberships_replace_roster('did:plc:forest','[{"memberDid":"did:plc:alice","role":"owner"},{"memberDid":"did:plc:alice","role":"admin"}]'::jsonb,'2026-08-17T11:00:00Z')$$,
  'duplicate member DID', 'duplicate roster members are rejected'
);
select pg_temp.assert_raises(
  $$select public.organization_memberships_replace_roster('did:plc:forest','[{"memberDid":"did:plc:alice","role":"superadmin"}]'::jsonb,'2026-08-17T11:00:00Z')$$,
  'invalid member', 'unknown roles are rejected'
);
select pg_temp.assert_raises(
  $$select public.organization_memberships_replace_roster('did:plc:forest','[{"memberDid":"did:plc:alice","role":"member"}]'::jsonb,'2026-08-17T11:00:00Z')$$,
  'exactly one owner', 'ownerless snapshots are rejected as incomplete'
);
select pg_temp.assert_raises(
  $$select public.organization_memberships_replace_roster('did:plc:forest','[{"memberDid":"did:plc:alice","role":"owner"}]'::jsonb,clock_timestamp() + interval '1 hour')$$,
  'future', 'a caller clock cannot poison freshness with a future snapshot'
);
