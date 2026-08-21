-- Klipza.IA — estado leve por conta
-- Conversas, energia, preferências e workspace do Studio ficam sincronizados por usuário.
-- O saldo real de tokens continua sendo mantido em profiles/wallet_ledger e não é
-- aceito neste payload do cliente.

begin;

create table if not exists public.app_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_initialized boolean not null default false,
  chats jsonb not null default '{}'::jsonb,
  artifacts jsonb not null default '{}'::jsonb,
  quota jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  active_chat_id text,
  studio_files jsonb not null default '{}'::jsonb,
  studio_initialized boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_state_chats_object check (jsonb_typeof(chats) = 'object'),
  constraint app_user_state_artifacts_object check (jsonb_typeof(artifacts) = 'object'),
  constraint app_user_state_quota_object check (jsonb_typeof(quota) = 'object'),
  constraint app_user_state_settings_object check (jsonb_typeof(settings) = 'object'),
  constraint app_user_state_studio_files_object check (jsonb_typeof(studio_files) = 'object')
);

alter table public.app_user_state
  add column if not exists app_initialized boolean not null default false;
alter table public.app_user_state
  add column if not exists studio_initialized boolean not null default false;

alter table public.app_user_state enable row level security;

revoke all on table public.app_user_state from public, anon;
grant select, insert, update, delete on table public.app_user_state to authenticated;

drop policy if exists app_user_state_select_own on public.app_user_state;
drop policy if exists app_user_state_insert_own on public.app_user_state;
drop policy if exists app_user_state_update_own on public.app_user_state;
drop policy if exists app_user_state_delete_own on public.app_user_state;

create policy app_user_state_select_own on public.app_user_state
  for select to authenticated using (auth.uid() = user_id);
create policy app_user_state_insert_own on public.app_user_state
  for insert to authenticated with check (auth.uid() = user_id);
create policy app_user_state_update_own on public.app_user_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy app_user_state_delete_own on public.app_user_state
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists app_user_state_updated_idx
  on public.app_user_state (updated_at desc);

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

  insert into public.app_user_state (
    user_id, app_initialized, chats, artifacts, quota, settings, active_chat_id, studio_files, studio_initialized
  ) values (
    v_user_id,
    case when jsonb_typeof(p_patch->'app_initialized') = 'boolean' then (p_patch->>'app_initialized')::boolean else false end,
    case when jsonb_typeof(p_patch->'chats') = 'object' then p_patch->'chats' else '{}'::jsonb end,
    case when jsonb_typeof(p_patch->'artifacts') = 'object' then p_patch->'artifacts' else '{}'::jsonb end,
    case when jsonb_typeof(p_patch->'quota') = 'object' then p_patch->'quota' else '{}'::jsonb end,
    case when jsonb_typeof(p_patch->'settings') = 'object' then p_patch->'settings' else '{}'::jsonb end,
    nullif(p_patch->>'active_chat_id', ''),
    case when jsonb_typeof(p_patch->'studio_files') = 'object' then p_patch->'studio_files' else '{}'::jsonb end,
    case when jsonb_typeof(p_patch->'studio_initialized') = 'boolean' then (p_patch->>'studio_initialized')::boolean else false end
  )
  on conflict (user_id) do update set
    app_initialized = case when p_patch ? 'app_initialized' and jsonb_typeof(p_patch->'app_initialized') = 'boolean' then (p_patch->>'app_initialized')::boolean else public.app_user_state.app_initialized end,
    chats = case when p_patch ? 'chats' and jsonb_typeof(p_patch->'chats') = 'object' then p_patch->'chats' else public.app_user_state.chats end,
    artifacts = case when p_patch ? 'artifacts' and jsonb_typeof(p_patch->'artifacts') = 'object' then p_patch->'artifacts' else public.app_user_state.artifacts end,
    quota = case when p_patch ? 'quota' and jsonb_typeof(p_patch->'quota') = 'object' then p_patch->'quota' else public.app_user_state.quota end,
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

commit;
