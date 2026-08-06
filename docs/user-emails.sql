-- Private DID-to-email lookup populated from signed-in GainForest sessions.
-- Run in the same Supabase project configured by SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY. Email addresses are never exposed to browsers.
--
-- Temporary backfill lifecycle (review by 2026-11-01):
-- 1. Add a permanent auth-lifecycle sync for new users and email changes.
-- 2. Compare that auth source's active DIDs with this table and confirm recent
--    root-load backfills are no longer finding missing users.
-- 3. Remove scheduleUserEmailSync from app/layout.tsx and delete its helper,
--    tests, and shared upsert utility if nothing else uses them. Keep this table
--    and its data for the permanent sync.

create table if not exists public.user_emails (
  did text primary key,
  email text not null,
  created_at timestamptz not null default now(),

  constraint user_emails_did_format check (did like 'did:%'),
  constraint user_emails_normalized_email check (
    email <> '' and email = lower(trim(email))
  )
);

alter table public.user_emails enable row level security;

-- The app writes with the service-role key on the server. No browser role can
-- read or mutate private email addresses.
revoke all on public.user_emails from public, anon, authenticated, service_role;
grant select, insert, update on public.user_emails to service_role;
