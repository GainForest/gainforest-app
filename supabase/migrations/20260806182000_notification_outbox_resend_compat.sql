-- Expand the applied notification outbox RPC for the Resend-only application.
-- Keep the legacy overload and delivery_mode column until a later contract
-- migration, so old and new application instances can overlap safely.
do $$
begin
  if to_regprocedure(
    'public.notification_outbox_enqueue(text,text,jsonb,text,text,text,text,text,text,text,timestamptz)'
  ) is null then
    raise exception 'legacy 11-argument notification_outbox_enqueue RPC is required before installing the Resend compatibility overload';
  end if;
end $$;

create or replace function public.notification_outbox_enqueue(
  p_event_key text,
  p_event_type text,
  p_payload jsonb,
  p_source_id text,
  p_recipient_did text,
  p_recipient_email text,
  p_template_key text,
  p_locale text,
  p_provider_idempotency_key text,
  p_next_attempt_at timestamptz
)
returns table(outbox_id uuid,status text,duplicate boolean)
language sql
security definer
set search_path=''
as $$
  select *
  from public.notification_outbox_enqueue(
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    'resend'::text,
    $10
  );
$$;

revoke all on function public.notification_outbox_enqueue(
  text,text,jsonb,text,text,text,text,text,text,timestamptz
) from public,anon,authenticated;

grant execute on function public.notification_outbox_enqueue(
  text,text,jsonb,text,text,text,text,text,text,timestamptz
) to service_role;
