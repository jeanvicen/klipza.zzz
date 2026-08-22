-- Klipza.IA — cota do Modo Especialista
-- A conta é sempre derivada de auth.uid(); nenhum segredo ou dado de usuário é versionado.
begin;

create table if not exists public.expert_mode_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null check (char_length(event_key) between 8 and 180),
  used_at timestamptz not null default now(),
  unique (user_id, event_key)
);

alter table public.expert_mode_usage enable row level security;
revoke all on table public.expert_mode_usage from public, anon;
grant select on table public.expert_mode_usage to authenticated;

drop policy if exists expert_mode_usage_select_own on public.expert_mode_usage;
drop policy if exists expert_mode_usage_insert_own on public.expert_mode_usage;
create policy expert_mode_usage_select_own on public.expert_mode_usage
  for select to authenticated using (auth.uid() = user_id);
create policy expert_mode_usage_insert_own on public.expert_mode_usage
  for insert to authenticated with check (auth.uid() = user_id);

create index if not exists expert_mode_usage_user_time_idx
  on public.expert_mode_usage (user_id, used_at desc);

create or replace function public.get_expert_mode_quota()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  window_start timestamptz := now() - interval '48 hours';
  used_count integer := 0;
  oldest_used_at timestamptz;
  next_available_at timestamptz;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Não autenticado.';
  end if;

  delete from public.expert_mode_usage where user_id = current_user_id and used_at <= window_start;

  select count(*)::integer, min(used_at)
    into used_count, oldest_used_at
    from public.expert_mode_usage
   where user_id = current_user_id
     and used_at > window_start;

  if oldest_used_at is not null then
    next_available_at := oldest_used_at + interval '48 hours';
  end if;

  return jsonb_build_object(
    'limit', 3,
    'used', used_count,
    'remaining', greatest(0, 3 - used_count),
    'windowHours', 48,
    'nextAvailableAt', next_available_at
  );
end;
$$;

revoke all on function public.get_expert_mode_quota() from public;
grant execute on function public.get_expert_mode_quota() to authenticated;

create or replace function public.consume_expert_mode(p_event_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  safe_event_key text := left(trim(coalesce(p_event_key, '')), 180);
  window_start timestamptz := now() - interval '48 hours';
  used_count integer := 0;
  oldest_used_at timestamptz;
  next_available_at timestamptz;
  inserted_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Não autenticado.';
  end if;
  if char_length(safe_event_key) < 8 then
    raise exception using errcode = '22023', message = 'Evento inválido.';
  end if;

  -- Serializa apenas a cota da conta atual para impedir duas confirmações simultâneas.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  delete from public.expert_mode_usage where user_id = current_user_id and used_at <= window_start;

  if exists (
    select 1 from public.expert_mode_usage
     where user_id = current_user_id and event_key = safe_event_key
  ) then
    select count(*)::integer, min(used_at)
      into used_count, oldest_used_at
      from public.expert_mode_usage
     where user_id = current_user_id and used_at > window_start;
    if oldest_used_at is not null then next_available_at := oldest_used_at + interval '48 hours'; end if;
    return jsonb_build_object('allowed', true, 'consumed', false, 'alreadyProcessed', true, 'limit', 3, 'used', used_count, 'remaining', greatest(0, 3 - used_count), 'windowHours', 48, 'nextAvailableAt', next_available_at);
  end if;

  select count(*)::integer, min(used_at)
    into used_count, oldest_used_at
    from public.expert_mode_usage
   where user_id = current_user_id
     and used_at > window_start;

  if used_count >= 3 then
    next_available_at := oldest_used_at + interval '48 hours';
    return jsonb_build_object('allowed', false, 'consumed', false, 'alreadyProcessed', false, 'limit', 3, 'used', used_count, 'remaining', 0, 'windowHours', 48, 'nextAvailableAt', next_available_at);
  end if;

  insert into public.expert_mode_usage (user_id, event_key)
  values (current_user_id, safe_event_key)
  returning id into inserted_id;

  used_count := used_count + 1;
  select min(used_at) into oldest_used_at from public.expert_mode_usage where user_id = current_user_id and used_at > window_start;
  if oldest_used_at is not null then next_available_at := oldest_used_at + interval '48 hours'; end if;

  return jsonb_build_object('allowed', true, 'consumed', true, 'alreadyProcessed', false, 'usageId', inserted_id, 'limit', 3, 'used', used_count, 'remaining', greatest(0, 3 - used_count), 'windowHours', 48, 'nextAvailableAt', next_available_at);
end;
$$;

revoke all on function public.consume_expert_mode(text) from public;
grant execute on function public.consume_expert_mode(text) to authenticated;

commit;
