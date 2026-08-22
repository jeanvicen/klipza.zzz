-- Klipza.IA — energia diária e tokens persistentes por conta
-- Sem chaves, tokens de acesso ou dados pessoais neste arquivo.

begin;

alter table public.profiles
  add column if not exists energy_balance integer not null default 100,
  add column if not exists energy_reset_at timestamptz not null default (now() + interval '24 hours');

alter table public.profiles drop constraint if exists profiles_energy_balance_check;
alter table public.profiles add constraint profiles_energy_balance_check check (energy_balance between 0 and 100);

-- Migra o último cache remoto conhecido sem permitir valores fora do intervalo.
update public.profiles p
set energy_balance = greatest(0, least(100, case
      when (s.quota->>'energy') ~ '^[0-9]+$' then (s.quota->>'energy')::integer
      else 100
    end)),
    energy_reset_at = case
      when (s.quota->>'resetAt') ~ '^[0-9]+(\\.[0-9]+)?$'
        and to_timestamp(((s.quota->>'resetAt')::numeric) / 1000) > now()
      then to_timestamp(((s.quota->>'resetAt')::numeric) / 1000)
      else now() + interval '24 hours'
    end
from public.app_user_state s
where s.user_id = p.id;

create table if not exists public.user_energy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null default 'usage_debit' check (entry_type in ('usage_debit', 'reset')),
  energy_amount integer not null check (energy_amount <> 0),
  balance_after integer not null check (balance_after between 0 and 100),
  event_key text unique,
  description text not null default '',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.user_energy_ledger enable row level security;
revoke all on table public.user_energy_ledger from public, anon, authenticated;
grant select on table public.user_energy_ledger to authenticated;
drop policy if exists user_energy_ledger_select_own on public.user_energy_ledger;
create policy user_energy_ledger_select_own on public.user_energy_ledger for select to authenticated using (auth.uid() = user_id);
create index if not exists user_energy_ledger_user_created_idx on public.user_energy_ledger(user_id, created_at desc);

create or replace function public.get_user_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_profile.energy_reset_at is null or v_profile.energy_reset_at <= now() then
    update public.profiles
    set energy_balance = 100,
        energy_reset_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_user_id
    returning * into v_profile;
    insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description)
    values(v_user_id, 'reset', 100, 100, 'reset:' || v_user_id::text || ':' || to_char(v_profile.energy_reset_at, 'YYYYMMDDHH24MISSMS'), 'Reset automático do ciclo de 24 horas')
    on conflict(event_key) do nothing;
  end if;

  return jsonb_build_object(
    'energy', v_profile.energy_balance,
    'reset_at', v_profile.energy_reset_at,
    'token_balance', coalesce(v_profile.token_balance, 0),
    'prime_status', coalesce(v_profile.prime_status, 'inactive')
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
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100 then raise exception 'energy_amount_invalid'; end if;
  if p_event_key is null or length(trim(p_event_key)) < 8 or length(p_event_key) > 180 then raise exception 'energy_event_invalid'; end if;

  select * into v_existing from public.user_energy_ledger where event_key = trim(p_event_key) limit 1;
  if found then
    return jsonb_build_object('consumed', true, 'already_processed', true, 'energy', v_existing.balance_after);
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_profile.energy_reset_at is null or v_profile.energy_reset_at <= now() then
    update public.profiles
    set energy_balance = 100,
        energy_reset_at = now() + interval '24 hours',
        updated_at = now()
    where id = v_user_id
    returning * into v_profile;
  end if;

  if v_profile.energy_balance < p_amount then
    return jsonb_build_object('consumed', false, 'already_processed', false, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0));
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

  return jsonb_build_object('consumed', true, 'already_processed', false, 'energy', v_new_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0));
end;
$$;

revoke all on function public.get_user_quota() from public, anon;
revoke all on function public.consume_user_energy(integer, text) from public, anon;
grant execute on function public.get_user_quota() to authenticated;
grant execute on function public.consume_user_energy(integer, text) to authenticated;

alter table public.user_energy_ledger drop constraint if exists user_energy_ledger_entry_type_check;
alter table public.user_energy_ledger add constraint user_energy_ledger_entry_type_check check (entry_type in ('usage_debit', 'reset', 'refund'));

create or replace function public.refund_user_energy(p_amount integer, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_original public.user_energy_ledger%rowtype;
  v_existing public.user_energy_ledger%rowtype;
  v_refund integer;
  v_new_balance integer;
  v_refund_key text := 'refund:' || trim(p_event_key);
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100 then raise exception 'energy_amount_invalid'; end if;
  if p_event_key is null or length(trim(p_event_key)) < 8 or length(p_event_key) > 180 then raise exception 'energy_event_invalid'; end if;

  select * into v_original from public.user_energy_ledger
  where user_id = v_user_id and event_key = trim(p_event_key) and entry_type = 'usage_debit'
  limit 1;
  if not found then return jsonb_build_object('refunded', false, 'already_processed', false); end if;

  select * into v_existing from public.user_energy_ledger where event_key = v_refund_key limit 1;
  if found then return jsonb_build_object('refunded', true, 'already_processed', true, 'energy', v_existing.balance_after); end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  v_refund := least(p_amount, 100 - v_profile.energy_balance);
  v_new_balance := v_profile.energy_balance + v_refund;

  update public.profiles
  set energy_balance = v_new_balance, updated_at = now()
  where id = v_user_id;

  insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description, metadata)
  values(v_user_id, 'refund', v_refund, v_new_balance, v_refund_key, 'Estorno de energia por falha ao iniciar a resposta', jsonb_build_object('original_event_key', trim(p_event_key)))
  on conflict(event_key) do nothing;

  return jsonb_build_object('refunded', true, 'already_processed', false, 'energy', v_new_balance);
end;
$$;

revoke all on function public.refund_user_energy(integer, text) from public, anon;
grant execute on function public.refund_user_energy(integer, text) to authenticated;

commit;
