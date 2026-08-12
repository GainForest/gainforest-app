-- Private DID-to-email lookup populated from signed-in GainForest sessions.
-- Run in the same Supabase project configured by SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY. Email addresses are never exposed to browsers.
--
-- Presence also marks that a portable DID has previously used GainForest. On a
-- full authenticated app load, the server checks for the DID before upserting
-- its current email and handle. A missing DID creates the general welcome-email
-- job; an existing DID only refreshes contact data. The lookup and enqueue are
-- intentionally separate application operations, so an enqueue failure after a
-- successful first insert can leave that user without a welcome email.

create table if not exists public.user_emails (
  did text primary key,
  email text not null,
  handle text,
  created_at timestamptz not null default now(),

  constraint user_emails_did_format check (did like 'did:%'),
  constraint user_emails_normalized_email check (
    email <> '' and email = lower(trim(email))
  ),
  constraint user_emails_normalized_handle check (
    handle is null or (handle <> '' and handle = lower(trim(handle)))
  )
);

alter table public.user_emails enable row level security;

-- The app writes with the service-role key on the server. No browser role can
-- read or mutate private email addresses.
revoke all on public.user_emails from public, anon, authenticated, service_role;
grant select, insert, update on public.user_emails to service_role;
