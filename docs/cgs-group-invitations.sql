-- CGS group email invitations for the Certs app.
-- Run in the same Supabase project used by gainforest-atproto-auth.
-- This is safe to re-run: it creates the table, then adds any missing columns
-- for databases where an older/partial table already exists.

create table if not exists public.cgs_group_invitations (
  id uuid primary key default gen_random_uuid()
);

alter table public.cgs_group_invitations
  add column if not exists repo text,
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists status text default 'pending',
  add column if not exists inviter_did text,
  add column if not exists inviter_handle text,
  add column if not exists inviter_email text,
  add column if not exists group_name text,
  add column if not exists group_handle text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_did text,
  add column if not exists accepted_by_email text,
  add column if not exists email_sent_at timestamptz,
  add column if not exists last_email_error text;

-- Backfill defaults before tightening nullability.
update public.cgs_group_invitations set status = 'pending' where status is null;
update public.cgs_group_invitations set created_at = now() where created_at is null;
update public.cgs_group_invitations set updated_at = now() where updated_at is null;

-- Required columns for new rows. If any existing partial rows are missing these
-- values, fill or delete them before running these statements.
alter table public.cgs_group_invitations
  alter column repo set not null,
  alter column email set not null,
  alter column role set not null,
  alter column status set not null,
  alter column inviter_did set not null,
  alter column created_at set not null,
  alter column updated_at set not null,
  alter column expires_at set not null;

alter table public.cgs_group_invitations
  drop constraint if exists cgs_group_invitations_role_check,
  add constraint cgs_group_invitations_role_check check (role in ('member', 'admin'));

alter table public.cgs_group_invitations
  drop constraint if exists cgs_group_invitations_status_check,
  add constraint cgs_group_invitations_status_check check (status in ('pending', 'accepted', 'canceled', 'expired'));

create index if not exists cgs_group_invitations_email_status_idx
  on public.cgs_group_invitations (email, status, expires_at desc);

create index if not exists cgs_group_invitations_repo_status_idx
  on public.cgs_group_invitations (repo, status, created_at desc);

create unique index if not exists cgs_group_invitations_pending_email_repo_idx
  on public.cgs_group_invitations (repo, email)
  where status = 'pending';

create or replace function public.set_cgs_group_invitations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cgs_group_invitations_updated_at on public.cgs_group_invitations;
create trigger set_cgs_group_invitations_updated_at
before update on public.cgs_group_invitations
for each row execute function public.set_cgs_group_invitations_updated_at();

alter table public.cgs_group_invitations enable row level security;

-- The app uses the service-role key server-side. Keep browser/API clients out of
-- this table unless/until dedicated policies are designed.
