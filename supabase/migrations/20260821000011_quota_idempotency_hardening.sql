-- Klipza.IA — endurecimento de idempotência e isolamento do quota.
-- Não contém chaves, tokens de acesso ou dados pessoais.

begin;

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
  if p_event_key is null or length(trim(p_event_key)) < 8 or length(trim(p_event_key)) > 180 then raise exception 'energy_event_invalid'; end if;

  select * into v_existing
  from public.user_energy_ledger
  where event_key = trim(p_event_key)
  limit 1;
  if found then
    if v_existing.user_id <> v_user_id then raise exception 'energy_event_key_conflict'; end if;
    return jsonb_build_object('consumed', true, 'already_processed', true, 'energy', v_existing.balance_after, 'reset_at', (select energy_reset_at from public.profiles where id = v_user_id), 'token_balance', coalesce((select token_balance from public.profiles where id = v_user_id), 0));
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
  v_refund_key text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100 then raise exception 'energy_amount_invalid'; end if;
  if p_event_key is null or length(trim(p_event_key)) < 8 or length(trim(p_event_key)) > 180 then raise exception 'energy_event_invalid'; end if;
  v_refund_key := 'refund:' || trim(p_event_key);

  select * into v_original from public.user_energy_ledger
  where user_id = v_user_id and event_key = trim(p_event_key) and entry_type = 'usage_debit'
  limit 1;
  if not found then return jsonb_build_object('refunded', false, 'already_processed', false); end if;

  select * into v_existing from public.user_energy_ledger where event_key = v_refund_key limit 1;
  if found then
    if v_existing.user_id <> v_user_id then raise exception 'energy_refund_key_conflict'; end if;
    return jsonb_build_object('refunded', true, 'already_processed', true, 'energy', v_existing.balance_after);
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;
  v_refund := least(p_amount, 100 - v_profile.energy_balance);
  if v_refund <= 0 then
    return jsonb_build_object('refunded', false, 'already_processed', false, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0));
  end if;
  v_new_balance := v_profile.energy_balance + v_refund;

  update public.profiles
  set energy_balance = v_new_balance, updated_at = now()
  where id = v_user_id;

  insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description, metadata)
  values(v_user_id, 'refund', v_refund, v_new_balance, v_refund_key, 'Estorno de energia por falha ao iniciar a resposta', jsonb_build_object('original_event_key', trim(p_event_key)))
  on conflict(event_key) do nothing;

  return jsonb_build_object('refunded', true, 'already_processed', false, 'energy', v_new_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0));
end;
$$;

create or replace function public.consume_wallet_tokens(
  p_user_id uuid,
  p_amount bigint,
  p_event_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_existing public.wallet_ledger%rowtype;
  v_new_balance bigint;
begin
  if p_user_id is null then raise exception 'wallet_user_invalid'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'wallet_amount_invalid'; end if;
  if p_event_key is null or length(trim(p_event_key)) < 8 or length(trim(p_event_key)) > 180 then raise exception 'wallet_event_invalid'; end if;

  select * into v_existing from public.wallet_ledger where event_key = trim(p_event_key) limit 1;
  if found then
    if v_existing.user_id <> p_user_id then raise exception 'wallet_event_key_conflict'; end if;
    return jsonb_build_object('consumed', true, 'already_processed', true, 'token_balance', v_existing.balance_after);
  end if;

  select token_balance into v_balance from public.profiles where id = p_user_id for update;
  if v_balance is null then raise exception 'wallet_profile_not_found'; end if;
  if v_balance < p_amount then return jsonb_build_object('consumed', false, 'already_processed', false, 'token_balance', v_balance); end if;
  v_new_balance := v_balance - p_amount;
  insert into public.wallet_ledger(user_id, entry_type, token_amount, balance_after, event_key, description)
  values(p_user_id, 'usage_debit', -p_amount, v_new_balance, trim(p_event_key), 'Uso de tokens no chat');
  update public.profiles set token_balance = v_new_balance, last_activity_at = now(), inactivity_warning_level = 0, updated_at = now() where id = p_user_id;
  return jsonb_build_object('consumed', true, 'already_processed', false, 'token_balance', v_new_balance);
end;
$$;

revoke all on function public.consume_user_energy(integer, text) from public, anon;
revoke all on function public.refund_user_energy(integer, text) from public, anon;
revoke all on function public.consume_wallet_tokens(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.consume_user_energy(integer, text) to authenticated;
grant execute on function public.refund_user_energy(integer, text) to authenticated;
grant execute on function public.consume_wallet_tokens(uuid, bigint, text) to service_role;

commit;
