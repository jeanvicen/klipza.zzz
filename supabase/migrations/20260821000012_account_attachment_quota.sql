-- Klipza.IA — limite diário de anexos por conta.
-- A contagem é do servidor; o cache do navegador não é fonte de verdade.
-- Não contém chaves, tokens de acesso ou dados pessoais.

begin;

alter table public.profiles
  add column if not exists attachment_used integer not null default 0;

alter table public.profiles drop constraint if exists profiles_attachment_used_check;
alter table public.profiles add constraint profiles_attachment_used_check check (attachment_used between 0 and 3);

update public.profiles p
set attachment_used = greatest(0, least(3, case
      when (s.quota->>'attachUsed') ~ '^[0-9]+$' then least(3, greatest(0, ((s.quota->>'attachUsed')::numeric)::integer))
      else 0
    end))
from public.app_user_state s
where s.user_id = p.id;

create table if not exists public.user_attachment_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null default 'usage_debit' check (entry_type in ('usage_debit', 'reset')),
  attachment_amount integer not null check (attachment_amount <> 0),
  used_after integer not null check (used_after between 0 and 3),
  event_key text unique,
  description text not null default '',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.user_attachment_ledger enable row level security;
revoke all on table public.user_attachment_ledger from public, anon, authenticated;
grant select on table public.user_attachment_ledger to authenticated;
drop policy if exists user_attachment_ledger_select_own on public.user_attachment_ledger;
create policy user_attachment_ledger_select_own on public.user_attachment_ledger for select to authenticated using (auth.uid() = user_id);
create index if not exists user_attachment_ledger_user_created_idx on public.user_attachment_ledger(user_id, created_at desc);

create or replace function public.get_user_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_reset_key text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_profile.energy_reset_at is null or v_profile.energy_reset_at <= now() then
    update public.profiles
    set energy_balance = 100,
        attachment_used = 0,
        energy_reset_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_user_id
    returning * into v_profile;
    v_reset_key := 'reset:' || v_user_id::text || ':' || to_char(v_profile.energy_reset_at, 'YYYYMMDDHH24MISSMS');
    insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description)
    values(v_user_id, 'reset', 100, 100, v_reset_key, 'Reset automático do ciclo de 24 horas')
    on conflict(event_key) do nothing;
    insert into public.user_attachment_ledger(user_id, entry_type, attachment_amount, used_after, event_key, description)
    values(v_user_id, 'reset', 3, 0, 'attachment-' || v_reset_key, 'Reset automático do limite de anexos')
    on conflict(event_key) do nothing;
  end if;

  return jsonb_build_object(
    'energy', v_profile.energy_balance,
    'reset_at', v_profile.energy_reset_at,
    'token_balance', coalesce(v_profile.token_balance, 0),
    'prime_status', coalesce(v_profile.prime_status, 'inactive'),
    'attachments_used', v_profile.attachment_used,
    'attachments_remaining', greatest(0, 3 - v_profile.attachment_used)
  );
end;
$$;

create or replace function public.consume_user_energy(p_amount integer, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_new_balance integer;
  v_existing public.user_energy_ledger%rowtype;
  v_reset_key text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100 then raise exception 'energy_amount_invalid'; end if;
  if p_event_key is null or length(trim(p_event_key)) < 8 or length(trim(p_event_key)) > 180 then raise exception 'energy_event_invalid'; end if;

  select * into v_existing from public.user_energy_ledger where event_key = trim(p_event_key) limit 1;
  if found then
    if v_existing.user_id <> v_user_id then raise exception 'energy_event_key_conflict'; end if;
    select * into v_profile from public.profiles where id = v_user_id;
    return jsonb_build_object('consumed', true, 'already_processed', true, 'energy', v_existing.balance_after, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0), 'attachments_used', v_profile.attachment_used, 'attachments_remaining', greatest(0, 3 - v_profile.attachment_used));
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_profile.energy_reset_at is null or v_profile.energy_reset_at <= now() then
    update public.profiles
    set energy_balance = 100,
        attachment_used = 0,
        energy_reset_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_user_id
    returning * into v_profile;
    v_reset_key := 'reset:' || v_user_id::text || ':' || to_char(v_profile.energy_reset_at, 'YYYYMMDDHH24MISSMS');
    insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description)
    values(v_user_id, 'reset', 100, 100, v_reset_key, 'Reset automático do ciclo de 24 horas')
    on conflict(event_key) do nothing;
    insert into public.user_attachment_ledger(user_id, entry_type, attachment_amount, used_after, event_key, description)
    values(v_user_id, 'reset', 3, 0, 'attachment-' || v_reset_key, 'Reset automático do limite de anexos')
    on conflict(event_key) do nothing;
  end if;

  if v_profile.energy_balance < p_amount then
    return jsonb_build_object('consumed', false, 'already_processed', false, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0), 'attachments_used', v_profile.attachment_used, 'attachments_remaining', greatest(0, 3 - v_profile.attachment_used));
  end if;

  v_new_balance := v_profile.energy_balance - p_amount;
  update public.profiles
  set energy_balance = v_new_balance,
      last_activity_at = now(),
      inactivity_warning_level = 0,
      updated_at = now()
  where id = v_user_id;

  insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description)
  values(v_user_id, 'usage_debit', -p_amount, v_new_balance, trim(p_event_key), 'Uso de energia no Klipza.IA');

  return jsonb_build_object('consumed', true, 'already_processed', false, 'energy', v_new_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0), 'attachments_used', v_profile.attachment_used, 'attachments_remaining', greatest(0, 3 - v_profile.attachment_used));
end;
$$;

create or replace function public.consume_user_attachments(p_amount integer, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_existing public.user_attachment_ledger%rowtype;
  v_new_used integer;
  v_reset_key text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 3 then raise exception 'attachment_amount_invalid'; end if;
  if p_event_key is null or length(trim(p_event_key)) < 8 or length(trim(p_event_key)) > 180 then raise exception 'attachment_event_invalid'; end if;

  select * into v_existing from public.user_attachment_ledger where event_key = trim(p_event_key) limit 1;
  if found then
    if v_existing.user_id <> v_user_id then raise exception 'attachment_event_key_conflict'; end if;
    select * into v_profile from public.profiles where id = v_user_id;
    return jsonb_build_object('consumed', true, 'already_processed', true, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0), 'prime_status', coalesce(v_profile.prime_status, 'inactive'), 'attachments_used', v_profile.attachment_used, 'attachments_remaining', greatest(0, 3 - v_profile.attachment_used));
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_profile.energy_reset_at is null or v_profile.energy_reset_at <= now() then
    update public.profiles
    set energy_balance = 100,
        attachment_used = 0,
        energy_reset_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_user_id
    returning * into v_profile;
    v_reset_key := 'reset:' || v_user_id::text || ':' || to_char(v_profile.energy_reset_at, 'YYYYMMDDHH24MISSMS');
    insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description)
    values(v_user_id, 'reset', 100, 100, v_reset_key, 'Reset automático do ciclo de 24 horas')
    on conflict(event_key) do nothing;
    insert into public.user_attachment_ledger(user_id, entry_type, attachment_amount, used_after, event_key, description)
    values(v_user_id, 'reset', 3, 0, 'attachment-' || v_reset_key, 'Reset automático do limite de anexos')
    on conflict(event_key) do nothing;
  end if;

  if v_profile.prime_status = 'active' then
    return jsonb_build_object('consumed', true, 'already_processed', false, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0), 'prime_status', v_profile.prime_status, 'attachments_used', v_profile.attachment_used, 'attachments_remaining', 999999);
  end if;

  if v_profile.attachment_used + p_amount > 3 then
    return jsonb_build_object('consumed', false, 'already_processed', false, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0), 'prime_status', coalesce(v_profile.prime_status, 'inactive'), 'attachments_used', v_profile.attachment_used, 'attachments_remaining', greatest(0, 3 - v_profile.attachment_used));
  end if;

  v_new_used := v_profile.attachment_used + p_amount;
  update public.profiles
  set attachment_used = v_new_used,
      last_activity_at = now(),
      inactivity_warning_level = 0,
      updated_at = now()
  where id = v_user_id;

  insert into public.user_attachment_ledger(user_id, entry_type, attachment_amount, used_after, event_key, description)
  values(v_user_id, 'usage_debit', -p_amount, v_new_used, trim(p_event_key), 'Uso de anexos no Klipza.IA');

  return jsonb_build_object('consumed', true, 'already_processed', false, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0), 'prime_status', coalesce(v_profile.prime_status, 'inactive'), 'attachments_used', v_new_used, 'attachments_remaining', greatest(0, 3 - v_new_used));
end;
$$;

revoke all on function public.get_user_quota() from public, anon;
revoke all on function public.consume_user_energy(integer, text) from public, anon;
revoke all on function public.consume_user_attachments(integer, text) from public, anon;
grant execute on function public.get_user_quota() to authenticated;
grant execute on function public.consume_user_energy(integer, text) to authenticated;
grant execute on function public.consume_user_attachments(integer, text) to authenticated;

commit;
