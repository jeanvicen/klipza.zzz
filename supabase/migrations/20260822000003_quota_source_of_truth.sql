-- Klipza.IA — fonte de verdade e consistência final de quotas por conta
-- Não contém chaves, tokens de acesso ou dados pessoais.
-- Deve ser aplicada depois de 20260821000012_account_attachment_quota.sql.

begin;

-- O snapshot continua compatível com versões antigas, mas quota não pode mais
-- ser alterada pelo payload do cliente nem usada como fonte de verdade.
create or replace function public.sync_app_user_state(p_patch jsonb)
returns public.app_user_state
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.app_user_state;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'app_user_state_patch_invalid';
  end if;

  p_patch := p_patch - 'quota';

  insert into public.app_user_state (
    user_id, app_initialized, chats, artifacts, quota, settings, active_chat_id, studio_files, studio_initialized
  ) values (
    v_user_id,
    case when jsonb_typeof(p_patch->'app_initialized') = 'boolean' then (p_patch->>'app_initialized')::boolean else false end,
    case when jsonb_typeof(p_patch->'chats') = 'object' then p_patch->'chats' else '{}'::jsonb end,
    case when jsonb_typeof(p_patch->'artifacts') = 'object' then p_patch->'artifacts' else '{}'::jsonb end,
    '{}'::jsonb,
    case when jsonb_typeof(p_patch->'settings') = 'object' then p_patch->'settings' else '{}'::jsonb end,
    nullif(p_patch->>'active_chat_id', ''),
    case when jsonb_typeof(p_patch->'studio_files') = 'object' then p_patch->'studio_files' else '{}'::jsonb end,
    case when jsonb_typeof(p_patch->'studio_initialized') = 'boolean' then (p_patch->>'studio_initialized')::boolean else false end
  )
  on conflict (user_id) do update set
    app_initialized = case when p_patch ? 'app_initialized' and jsonb_typeof(p_patch->'app_initialized') = 'boolean' then (p_patch->>'app_initialized')::boolean else public.app_user_state.app_initialized end,
    chats = case when p_patch ? 'chats' and jsonb_typeof(p_patch->'chats') = 'object' then p_patch->'chats' else public.app_user_state.chats end,
    artifacts = case when p_patch ? 'artifacts' and jsonb_typeof(p_patch->'artifacts') = 'object' then p_patch->'artifacts' else public.app_user_state.artifacts end,
    quota = public.app_user_state.quota,
    settings = case when p_patch ? 'settings' and jsonb_typeof(p_patch->'settings') = 'object' then p_patch->'settings' else public.app_user_state.settings end,
    active_chat_id = case when p_patch ? 'active_chat_id' then nullif(p_patch->>'active_chat_id', '') else public.app_user_state.active_chat_id end,
    studio_files = case when p_patch ? 'studio_files' and jsonb_typeof(p_patch->'studio_files') = 'object' then p_patch->'studio_files' else public.app_user_state.studio_files end,
    studio_initialized = case when p_patch ? 'studio_initialized' and jsonb_typeof(p_patch->'studio_initialized') = 'boolean' then (p_patch->>'studio_initialized')::boolean else public.app_user_state.studio_initialized end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.sync_app_user_state(jsonb) from public, anon;
grant execute on function public.sync_app_user_state(jsonb) to authenticated;

-- Mantém a função interna para rotinas de serviço, mas revalida a chave depois
-- do lock da linha: duas requisições concorrentes nunca debitam duas vezes.
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
  v_event_key text := trim(p_event_key);
begin
  if p_user_id is null then raise exception 'wallet_user_invalid'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100 then raise exception 'wallet_amount_invalid'; end if;
  if p_event_key is null or length(v_event_key) < 8 or length(v_event_key) > 180 then raise exception 'wallet_event_invalid'; end if;

  select * into v_existing from public.wallet_ledger where event_key = v_event_key limit 1;
  if found then
    if v_existing.user_id <> p_user_id then raise exception 'wallet_event_key_conflict'; end if;
    return jsonb_build_object('consumed', true, 'already_processed', true, 'token_balance', v_existing.balance_after);
  end if;

  select token_balance into v_balance from public.profiles where id = p_user_id for update;
  if v_balance is null then raise exception 'wallet_profile_not_found'; end if;

  select * into v_existing from public.wallet_ledger where event_key = v_event_key limit 1;
  if found then
    if v_existing.user_id <> p_user_id then raise exception 'wallet_event_key_conflict'; end if;
    return jsonb_build_object('consumed', true, 'already_processed', true, 'token_balance', v_existing.balance_after);
  end if;

  if v_balance < p_amount then
    return jsonb_build_object('consumed', false, 'already_processed', false, 'token_balance', v_balance);
  end if;

  v_new_balance := v_balance - p_amount;
  insert into public.wallet_ledger(user_id, entry_type, token_amount, balance_after, event_key, description)
  values(p_user_id, 'usage_debit', -p_amount, v_new_balance, v_event_key, 'Uso de tokens no chat');
  update public.profiles
  set token_balance = v_new_balance,
      last_activity_at = now(),
      inactivity_warning_level = 0,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('consumed', true, 'already_processed', false, 'token_balance', v_new_balance);
end;
$$;

revoke all on function public.consume_wallet_tokens(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.consume_wallet_tokens(uuid, bigint, text) to service_role;

-- Wrapper público para o próprio usuário; nunca recebe user_id do cliente.
create or replace function public.consume_user_tokens(p_amount bigint, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  return public.consume_wallet_tokens(v_user_id, p_amount, p_event_key);
end;
$$;

create or replace function public.refund_user_tokens(p_amount bigint, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_original public.wallet_ledger%rowtype;
  v_existing public.wallet_ledger%rowtype;
  v_balance bigint;
  v_refund bigint;
  v_new_balance bigint;
  v_event_key text := trim(p_event_key);
  v_refund_key text := 'refund:' || trim(p_event_key);
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100 then raise exception 'wallet_amount_invalid'; end if;
  if p_event_key is null or length(v_event_key) < 8 or length(v_event_key) > 180 then raise exception 'wallet_event_invalid'; end if;

  select * into v_original
  from public.wallet_ledger
  where user_id = v_user_id and event_key = v_event_key and entry_type = 'usage_debit'
  limit 1;
  if not found then
    return jsonb_build_object('refunded', false, 'already_processed', false);
  end if;

  select * into v_existing from public.wallet_ledger where event_key = v_refund_key limit 1;
  if found then
    if v_existing.user_id <> v_user_id then raise exception 'wallet_refund_key_conflict'; end if;
    return jsonb_build_object('refunded', true, 'already_processed', true, 'token_balance', v_existing.balance_after);
  end if;

  select token_balance into v_balance from public.profiles where id = v_user_id for update;
  if v_balance is null then raise exception 'wallet_profile_not_found'; end if;

  select * into v_existing from public.wallet_ledger where event_key = v_refund_key limit 1;
  if found then
    if v_existing.user_id <> v_user_id then raise exception 'wallet_refund_key_conflict'; end if;
    return jsonb_build_object('refunded', true, 'already_processed', true, 'token_balance', v_existing.balance_after);
  end if;

  v_refund := least(p_amount, abs(v_original.token_amount));
  if v_refund <= 0 then
    return jsonb_build_object('refunded', false, 'already_processed', false, 'token_balance', v_balance);
  end if;
  v_new_balance := v_balance + v_refund;

  insert into public.wallet_ledger(user_id, entry_type, token_amount, balance_after, event_key, description, metadata)
  values(v_user_id, 'refund_debit', v_refund, v_new_balance, v_refund_key, 'Estorno de tokens por falha ao iniciar a resposta', jsonb_build_object('original_event_key', v_event_key));
  update public.profiles
  set token_balance = v_new_balance,
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object('refunded', true, 'already_processed', false, 'token_balance', v_new_balance);
end;
$$;

revoke all on function public.consume_user_tokens(bigint, text) from public, anon;
revoke all on function public.refund_user_tokens(bigint, text) from public, anon;
grant execute on function public.consume_user_tokens(bigint, text) to authenticated;
grant execute on function public.refund_user_tokens(bigint, text) to authenticated;

-- Cobrança única por mensagem de IA. Energia é usada primeiro; tokens entram
-- somente quando a energia da conta não cobre o custo. A chave é idempotente.
create or replace function public.consume_ai_usage_for_user(
  p_user_id uuid,
  p_energy_amount integer,
  p_token_amount bigint,
  p_event_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing_energy public.user_energy_ledger%rowtype;
  v_existing_tokens public.wallet_ledger%rowtype;
  v_event_key text := trim(coalesce(p_event_key, ''));
  v_energy_key text := 'ai:energy:' || v_event_key;
  v_token_key text := 'ai:tokens:' || v_event_key;
  v_source text := null;
  v_new_energy integer;
  v_new_tokens bigint;
begin
  if p_user_id is null then raise exception 'ai_user_invalid'; end if;
  if p_energy_amount is null or p_energy_amount <= 0 or p_energy_amount > 100 then raise exception 'ai_energy_amount_invalid'; end if;
  if p_token_amount is null or p_token_amount <= 0 or p_token_amount > 100 then raise exception 'ai_token_amount_invalid'; end if;
  if length(v_event_key) < 8 or length(v_event_key) > 160 then raise exception 'ai_event_invalid'; end if;

  select * into v_existing_energy from public.user_energy_ledger where user_id = p_user_id and event_key = v_energy_key limit 1;
  if found then
    return jsonb_build_object('consumed', true, 'already_processed', true, 'source', 'energy', 'energy', v_existing_energy.balance_after, 'token_balance', (select token_balance from public.profiles where id = p_user_id));
  end if;
  select * into v_existing_tokens from public.wallet_ledger where user_id = p_user_id and event_key = v_token_key limit 1;
  if found then
    return jsonb_build_object('consumed', true, 'already_processed', true, 'source', 'tokens', 'energy', (select energy_balance from public.profiles where id = p_user_id), 'token_balance', v_existing_tokens.balance_after);
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'ai_profile_not_found'; end if;

  -- Revalida a idempotência depois do lock da conta.
  select * into v_existing_energy from public.user_energy_ledger where user_id = p_user_id and event_key = v_energy_key limit 1;
  if found then
    return jsonb_build_object('consumed', true, 'already_processed', true, 'source', 'energy', 'energy', v_existing_energy.balance_after, 'token_balance', coalesce(v_profile.token_balance, 0));
  end if;
  select * into v_existing_tokens from public.wallet_ledger where user_id = p_user_id and event_key = v_token_key limit 1;
  if found then
    return jsonb_build_object('consumed', true, 'already_processed', true, 'source', 'tokens', 'energy', v_profile.energy_balance, 'token_balance', v_existing_tokens.balance_after);
  end if;

  if v_profile.energy_reset_at is null or v_profile.energy_reset_at <= now() then
    update public.profiles
       set energy_balance = 100,
           energy_reset_at = now() + interval '24 hours',
           updated_at = now()
     where id = p_user_id
     returning * into v_profile;
  end if;

  if coalesce(v_profile.energy_balance, 0) >= p_energy_amount then
    v_new_energy := v_profile.energy_balance - p_energy_amount;
    update public.profiles
       set energy_balance = v_new_energy,
           last_activity_at = now(),
           inactivity_warning_level = 0,
           updated_at = now()
     where id = p_user_id;
    insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description, metadata)
    values(p_user_id, 'usage_debit', -p_energy_amount, v_new_energy, v_energy_key, 'Uso de energia em mensagem de IA', jsonb_build_object('ai_event_key', v_event_key, 'cost', p_energy_amount));
    v_source := 'energy';
    return jsonb_build_object('consumed', true, 'already_processed', false, 'source', v_source, 'energy', v_new_energy, 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0));
  end if;

  if coalesce(v_profile.token_balance, 0) < p_token_amount then
    return jsonb_build_object('consumed', false, 'already_processed', false, 'source', null, 'energy', coalesce(v_profile.energy_balance, 0), 'reset_at', v_profile.energy_reset_at, 'token_balance', coalesce(v_profile.token_balance, 0));
  end if;

  v_new_tokens := v_profile.token_balance - p_token_amount;
  update public.profiles
     set token_balance = v_new_tokens,
         last_activity_at = now(),
         inactivity_warning_level = 0,
         updated_at = now()
   where id = p_user_id;
  insert into public.wallet_ledger(user_id, entry_type, token_amount, balance_after, event_key, description, metadata)
  values(p_user_id, 'usage_debit', -p_token_amount, v_new_tokens, v_token_key, 'Uso de tokens em mensagem de IA', jsonb_build_object('ai_event_key', v_event_key, 'cost', p_token_amount));
  v_source := 'tokens';
  return jsonb_build_object('consumed', true, 'already_processed', false, 'source', v_source, 'energy', v_profile.energy_balance, 'reset_at', v_profile.energy_reset_at, 'token_balance', v_new_tokens);
end;
$$;

create or replace function public.refund_ai_usage_for_user(
  p_user_id uuid,
  p_energy_amount integer,
  p_token_amount bigint,
  p_event_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_original_energy public.user_energy_ledger%rowtype;
  v_original_tokens public.wallet_ledger%rowtype;
  v_existing_energy public.user_energy_ledger%rowtype;
  v_existing_tokens public.wallet_ledger%rowtype;
  v_event_key text := trim(coalesce(p_event_key, ''));
  v_energy_key text := 'ai:energy:' || v_event_key;
  v_token_key text := 'ai:tokens:' || v_event_key;
  v_refund_key text;
  v_refund_amount integer;
  v_new_energy integer;
  v_new_tokens bigint;
begin
  if p_user_id is null then raise exception 'ai_user_invalid'; end if;
  if p_energy_amount is null or p_energy_amount <= 0 or p_energy_amount > 100 then raise exception 'ai_energy_amount_invalid'; end if;
  if p_token_amount is null or p_token_amount <= 0 or p_token_amount > 100 then raise exception 'ai_token_amount_invalid'; end if;
  if length(v_event_key) < 8 or length(v_event_key) > 160 then raise exception 'ai_event_invalid'; end if;

  select * into v_original_energy from public.user_energy_ledger where user_id = p_user_id and event_key = v_energy_key and entry_type = 'usage_debit' limit 1;
  if found then
    v_refund_key := 'refund:' || v_energy_key;
    select * into v_existing_energy from public.user_energy_ledger where user_id = p_user_id and event_key = v_refund_key limit 1;
    if found then return jsonb_build_object('refunded', true, 'already_processed', true, 'source', 'energy', 'energy', v_existing_energy.balance_after); end if;
    select * into v_profile from public.profiles where id = p_user_id for update;
    if not found then raise exception 'ai_profile_not_found'; end if;
    select * into v_existing_energy from public.user_energy_ledger where user_id = p_user_id and event_key = v_refund_key limit 1;
    if found then return jsonb_build_object('refunded', true, 'already_processed', true, 'source', 'energy', 'energy', v_existing_energy.balance_after); end if;
    v_refund_amount := least(p_energy_amount, greatest(0, 100 - coalesce(v_profile.energy_balance, 0)));
    if v_refund_amount <= 0 then return jsonb_build_object('refunded', false, 'already_processed', false, 'source', 'energy', 'energy', coalesce(v_profile.energy_balance, 0)); end if;
    v_new_energy := coalesce(v_profile.energy_balance, 0) + v_refund_amount;
    update public.profiles set energy_balance = v_new_energy, updated_at = now() where id = p_user_id;
    insert into public.user_energy_ledger(user_id, entry_type, energy_amount, balance_after, event_key, description, metadata)
    values(p_user_id, 'refund', v_refund_amount, v_new_energy, v_refund_key, 'Estorno de energia por falha em mensagem de IA', jsonb_build_object('original_event_key', v_event_key))
    on conflict(event_key) do nothing;
    return jsonb_build_object('refunded', true, 'already_processed', false, 'source', 'energy', 'energy', v_new_energy);
  end if;

  select * into v_original_tokens from public.wallet_ledger where user_id = p_user_id and event_key = v_token_key and entry_type = 'usage_debit' limit 1;
  if found then
    v_refund_key := 'refund:' || v_token_key;
    select * into v_existing_tokens from public.wallet_ledger where user_id = p_user_id and event_key = v_refund_key limit 1;
    if found then return jsonb_build_object('refunded', true, 'already_processed', true, 'source', 'tokens', 'token_balance', v_existing_tokens.balance_after); end if;
    select * into v_profile from public.profiles where id = p_user_id for update;
    if not found then raise exception 'ai_profile_not_found'; end if;
    select * into v_existing_tokens from public.wallet_ledger where user_id = p_user_id and event_key = v_refund_key limit 1;
    if found then return jsonb_build_object('refunded', true, 'already_processed', true, 'source', 'tokens', 'token_balance', v_existing_tokens.balance_after); end if;
    v_refund_amount := null;
    v_new_tokens := coalesce(v_profile.token_balance, 0) + least(p_token_amount, abs(v_original_tokens.token_amount));
    update public.profiles set token_balance = v_new_tokens, updated_at = now() where id = p_user_id;
    insert into public.wallet_ledger(user_id, entry_type, token_amount, balance_after, event_key, description, metadata)
    values(p_user_id, 'refund_debit', least(p_token_amount, abs(v_original_tokens.token_amount)), v_new_tokens, v_refund_key, 'Estorno de tokens por falha em mensagem de IA', jsonb_build_object('original_event_key', v_event_key))
    on conflict(event_key) do nothing;
    return jsonb_build_object('refunded', true, 'already_processed', false, 'source', 'tokens', 'token_balance', v_new_tokens);
  end if;

  return jsonb_build_object('refunded', false, 'already_processed', false);
end;
$$;

alter table public.user_attachment_ledger drop constraint if exists user_attachment_ledger_entry_type_check;
alter table public.user_attachment_ledger add constraint user_attachment_ledger_entry_type_check check (entry_type in ('usage_debit', 'reset', 'refund'));

create or replace function public.refund_user_attachments(p_amount integer, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_original public.user_attachment_ledger%rowtype;
  v_existing public.user_attachment_ledger%rowtype;
  v_used integer;
  v_refund integer;
  v_new_used integer;
  v_event_key text := trim(coalesce(p_event_key, ''));
  v_refund_key text := 'refund:' || v_event_key;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 3 then raise exception 'attachment_amount_invalid'; end if;
  if left(v_event_key, 14) <> 'ai:attachments:' then raise exception 'attachment_refund_event_invalid'; end if;
  select * into v_original from public.user_attachment_ledger where user_id = v_user_id and event_key = v_event_key and entry_type = 'usage_debit' limit 1;
  if not found then return jsonb_build_object('refunded', false, 'already_processed', false); end if;
  select * into v_existing from public.user_attachment_ledger where user_id = v_user_id and event_key = v_refund_key limit 1;
  if found then return jsonb_build_object('refunded', true, 'already_processed', true, 'attachments_used', v_existing.used_after, 'attachments_remaining', greatest(0, 3 - v_existing.used_after)); end if;
  select attachment_used into v_used from public.profiles where id = v_user_id for update;
  if v_used is null then raise exception 'profile_not_found'; end if;
  select * into v_existing from public.user_attachment_ledger where user_id = v_user_id and event_key = v_refund_key limit 1;
  if found then return jsonb_build_object('refunded', true, 'already_processed', true, 'attachments_used', v_existing.used_after, 'attachments_remaining', greatest(0, 3 - v_existing.used_after)); end if;
  v_refund := least(p_amount, greatest(0, v_used));
  if v_refund <= 0 then return jsonb_build_object('refunded', false, 'already_processed', false, 'attachments_used', v_used, 'attachments_remaining', greatest(0, 3 - v_used)); end if;
  v_new_used := greatest(0, v_used - v_refund);
  update public.profiles set attachment_used = v_new_used, updated_at = now() where id = v_user_id;
  insert into public.user_attachment_ledger(user_id, entry_type, attachment_amount, used_after, event_key, description, metadata)
  values(v_user_id, 'refund', v_refund, v_new_used, v_refund_key, 'Estorno de anexos por falha em mensagem de IA', jsonb_build_object('original_event_key', v_event_key))
  on conflict(event_key) do nothing;
  return jsonb_build_object('refunded', true, 'already_processed', false, 'attachments_used', v_new_used, 'attachments_remaining', greatest(0, 3 - v_new_used));
end;
$$;

create or replace function public.refund_user_artifact_energy(p_amount integer, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_event_key is null or left(trim(p_event_key), 9) <> 'artifact:' then raise exception 'artifact_refund_event_invalid'; end if;
  return public.refund_user_energy(p_amount, p_event_key);
end;
$$;

create or replace function public.consume_user_ai_usage(p_energy_amount integer, p_token_amount bigint, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  return public.consume_ai_usage_for_user(v_user_id, p_energy_amount, p_token_amount, p_event_key);
end;
$$;

create or replace function public.refund_user_ai_usage(p_energy_amount integer, p_token_amount bigint, p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  return public.refund_ai_usage_for_user(v_user_id, p_energy_amount, p_token_amount, p_event_key);
end;
$$;

revoke all on function public.refund_user_energy(integer, text) from public, anon, authenticated;
revoke all on function public.refund_user_attachments(integer, text) from public, anon;
revoke all on function public.refund_user_artifact_energy(integer, text) from public, anon;
revoke all on function public.consume_ai_usage_for_user(uuid, integer, bigint, text) from public, anon, authenticated;
revoke all on function public.refund_ai_usage_for_user(uuid, integer, bigint, text) from public, anon, authenticated;
revoke all on function public.consume_user_ai_usage(integer, bigint, text) from public, anon;
revoke all on function public.refund_user_ai_usage(integer, bigint, text) from public, anon;
grant execute on function public.consume_ai_usage_for_user(uuid, integer, bigint, text) to service_role;
grant execute on function public.refund_ai_usage_for_user(uuid, integer, bigint, text) to service_role;
grant execute on function public.refund_user_attachments(integer, text) to authenticated;
grant execute on function public.refund_user_artifact_energy(integer, text) to authenticated;
grant execute on function public.consume_user_ai_usage(integer, bigint, text) to authenticated;
grant execute on function public.refund_user_ai_usage(integer, bigint, text) to authenticated;

commit;
