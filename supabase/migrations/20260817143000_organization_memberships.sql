-- Private projection of Certified Group Service organization rosters.
-- CGS remains authoritative. GainForest replaces one complete organization
-- snapshot at a time using the service-role-only RPC below.

create table public.organization_memberships (
  organization_did text not null,
  member_did text not null,
  role text not null,
  last_confirmed_at timestamptz not null,
  removed_at timestamptz,
  roster_synced_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),

  primary key (organization_did, member_did),
  constraint organization_memberships_organization_did_check check (
    length(organization_did) between 5 and 256
    and organization_did like 'did:%'
    and organization_did=trim(organization_did)
  ),
  constraint organization_memberships_member_did_check check (
    length(member_did) between 5 and 256
    and member_did like 'did:%'
    and member_did=trim(member_did)
  ),
  constraint organization_memberships_role_check check (role in ('owner','admin','member')),
  constraint organization_memberships_confirmation_order_check check (
    last_confirmed_at <= roster_synced_at
  ),
  constraint organization_memberships_removal_order_check check (
    removed_at is null or (last_confirmed_at <= removed_at and removed_at <= roster_synced_at)
  )
);

comment on table public.organization_memberships is
  'Private CGS roster projection. Active rows have removed_at=NULL; roster_synced_at marks the latest complete organization snapshot.';
comment on column public.organization_memberships.last_confirmed_at is
  'When this member was most recently present in a complete CGS roster snapshot.';
comment on column public.organization_memberships.roster_synced_at is
  'Timestamp shared by every active and removed row after the latest complete organization snapshot.';

create index organization_memberships_active_member_idx
  on public.organization_memberships (member_did, organization_did)
  where removed_at is null;
create index organization_memberships_active_organization_idx
  on public.organization_memberships (organization_did, role, member_did)
  where removed_at is null;
create index organization_memberships_freshness_idx
  on public.organization_memberships (organization_did, roster_synced_at desc);

alter table public.organization_memberships enable row level security;
revoke all on public.organization_memberships from public, anon, authenticated, service_role;
grant select on public.organization_memberships to service_role;

create function public.organization_memberships_replace_roster(
  p_organization_did text,
  p_members jsonb,
  p_observed_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_latest_sync timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_organization_did is null
    or length(p_organization_did) not between 5 and 256
    or p_organization_did not like 'did:%'
    or p_organization_did <> pg_catalog.btrim(p_organization_did)
  then
    raise exception 'organization membership snapshot requires a normalized organization DID';
  end if;

  if p_observed_at is null then
    raise exception 'organization membership snapshot requires an observation timestamp';
  end if;
  if p_observed_at > v_now + interval '5 minutes' then
    raise exception 'organization membership snapshot timestamp is too far in the future';
  end if;

  if p_members is null or pg_catalog.jsonb_typeof(p_members) <> 'array' then
    raise exception 'organization membership snapshot requires a JSON array of members';
  end if;
  if pg_catalog.jsonb_array_length(p_members) = 0 then
    raise exception 'organization membership snapshot requires at least one member';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_members) as entry(value)
    where pg_catalog.jsonb_typeof(entry.value) <> 'object'
      or pg_catalog.jsonb_typeof(entry.value -> 'memberDid') <> 'string'
      or pg_catalog.jsonb_typeof(entry.value -> 'role') <> 'string'
      or length(entry.value ->> 'memberDid') not between 5 and 256
      or entry.value ->> 'memberDid' not like 'did:%'
      or entry.value ->> 'memberDid' <> pg_catalog.btrim(entry.value ->> 'memberDid')
      or entry.value ->> 'role' not in ('owner','admin','member')
  ) then
    raise exception 'organization membership snapshot contains an invalid member DID or role';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct entry.value ->> 'memberDid')
    from pg_catalog.jsonb_array_elements(p_members) as entry(value)
  ) then
    raise exception 'organization membership snapshot contains a duplicate member DID';
  end if;

  if (
    select pg_catalog.count(*) filter (where entry.value ->> 'role' = 'owner') <> 1
    from pg_catalog.jsonb_array_elements(p_members) as entry(value)
  ) then
    raise exception 'organization membership snapshot must contain exactly one owner';
  end if;

  -- Serialize replacements for one organization. A hash collision only causes
  -- harmless extra serialization between two unrelated organizations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_did, 0));

  select pg_catalog.max(roster_synced_at)
    into v_latest_sync
    from public.organization_memberships
    where organization_did=p_organization_did;
  if v_latest_sync is not null and v_latest_sync >= p_observed_at then
    return false;
  end if;

  insert into public.organization_memberships (
    organization_did,
    member_did,
    role,
    last_confirmed_at,
    removed_at,
    roster_synced_at,
    created_at,
    updated_at
  )
  select
    p_organization_did,
    entry.value ->> 'memberDid',
    entry.value ->> 'role',
    p_observed_at,
    null,
    p_observed_at,
    v_now,
    v_now
  from pg_catalog.jsonb_array_elements(p_members) as entry(value)
  on conflict (organization_did,member_did) do update set
    role=excluded.role,
    last_confirmed_at=excluded.last_confirmed_at,
    removed_at=null,
    roster_synced_at=excluded.roster_synced_at,
    updated_at=v_now;

  update public.organization_memberships existing
  set
    removed_at=pg_catalog.coalesce(existing.removed_at,p_observed_at),
    roster_synced_at=p_observed_at,
    updated_at=v_now
  where existing.organization_did=p_organization_did
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_members) as entry(value)
      where entry.value ->> 'memberDid'=existing.member_did
    );

  return true;
end
$$;

comment on function public.organization_memberships_replace_roster(text,jsonb,timestamptz) is
  'Atomically applies a complete CGS roster and ignores snapshots older than the latest applied snapshot.';

revoke all on function public.organization_memberships_replace_roster(text,jsonb,timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.organization_memberships_replace_roster(text,jsonb,timestamptz)
  to service_role;
