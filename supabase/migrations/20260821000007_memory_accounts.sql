-- Klipza.IA — memória inteligente, retenção, notificações e backups por conta
-- Nenhum campo deste arquivo contém chaves de API ou dados de usuários.

begin;

create table if not exists public.user_memory_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  memory_enabled boolean not null default true,
  capture_mode text not null default 'suggested' check (capture_mode in ('suggested', 'automatic', 'disabled')),
  max_memories integer not null default 200 check (max_memories between 20 and 5000),
  inactivity_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null,
  content text not null,
  kind text not null default 'fact' check (kind in ('profile', 'preference', 'instruction', 'project', 'fact', 'temporary')),
  priority smallint not null default 50 check (priority between 0 and 100),
  retention_class text not null default 'standard' check (retention_class in ('permanent', 'standard', 'temporary')),
  source text not null default 'chat' check (source in ('chat', 'user', 'import', 'system')),
  confidence numeric(4,3) not null default 0.750 check (confidence between 0 and 1),
  content_hash text not null,
  last_used_at timestamptz,
  last_confirmed_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, memory_key),
  unique (user_id, content_hash)
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('inactivity_warning', 'memory_limit')),
  source_event_id uuid unique references public.account_lifecycle_events(id) on delete set null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_data_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_kind text not null default 'snapshot' check (backup_kind in ('snapshot', 'export')),
  schema_version integer not null default 1,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  checksum text not null,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  expires_at timestamptz
);

alter table public.user_memory_settings enable row level security;
alter table public.user_memories enable row level security;
alter table public.user_notifications enable row level security;
alter table public.user_data_backups enable row level security;

revoke all on table public.user_memory_settings, public.user_memories, public.user_notifications, public.user_data_backups from public, anon;
grant select, insert, update, delete on table public.user_memory_settings to authenticated;
grant select, insert, update, delete on table public.user_memories to authenticated;
grant select, update on table public.user_notifications to authenticated;
grant select, insert on table public.user_data_backups to authenticated;

drop policy if exists user_memory_settings_select_own on public.user_memory_settings;
drop policy if exists user_memory_settings_insert_own on public.user_memory_settings;
drop policy if exists user_memory_settings_update_own on public.user_memory_settings;
drop policy if exists user_memory_settings_delete_own on public.user_memory_settings;
create policy user_memory_settings_select_own on public.user_memory_settings for select to authenticated using (auth.uid() = user_id);
create policy user_memory_settings_insert_own on public.user_memory_settings for insert to authenticated with check (auth.uid() = user_id);
create policy user_memory_settings_update_own on public.user_memory_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_memory_settings_delete_own on public.user_memory_settings for delete to authenticated using (auth.uid() = user_id);

drop policy if exists user_memories_select_own on public.user_memories;
drop policy if exists user_memories_insert_own on public.user_memories;
drop policy if exists user_memories_update_own on public.user_memories;
drop policy if exists user_memories_delete_own on public.user_memories;
create policy user_memories_select_own on public.user_memories for select to authenticated using (auth.uid() = user_id);
create policy user_memories_insert_own on public.user_memories for insert to authenticated with check (auth.uid() = user_id);
create policy user_memories_update_own on public.user_memories for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_memories_delete_own on public.user_memories for delete to authenticated using (auth.uid() = user_id);

drop policy if exists user_notifications_select_own on public.user_notifications;
drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_select_own on public.user_notifications for select to authenticated using (auth.uid() = user_id);
create policy user_notifications_update_own on public.user_notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists user_data_backups_select_own on public.user_data_backups;
drop policy if exists user_data_backups_insert_own on public.user_data_backups;
create policy user_data_backups_select_own on public.user_data_backups for select to authenticated using (auth.uid() = user_id);
create policy user_data_backups_insert_own on public.user_data_backups for insert to authenticated with check (auth.uid() = user_id);

create index if not exists user_memories_user_priority_idx
  on public.user_memories (user_id, priority desc, updated_at desc);
create index if not exists user_memories_user_retention_idx
  on public.user_memories (user_id, retention_class, last_used_at, updated_at);
create index if not exists user_memories_expiry_idx
  on public.user_memories (expires_at)
  where expires_at is not null;
create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id, created_at desc)
  where read_at is null;
create index if not exists user_data_backups_user_created_idx
  on public.user_data_backups (user_id, created_at desc);

create or replace function public.upsert_user_memory(
  p_memory_key text,
  p_content text,
  p_kind text default 'fact',
  p_priority smallint default 50,
  p_retention_class text default 'standard',
  p_source text default 'chat',
  p_confidence numeric default 0.750,
  p_expires_at timestamptz default null
)
returns public.user_memories
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := lower(regexp_replace(trim(coalesce(p_memory_key, '')), '\\s+', ' ', 'g'));
  v_content text := regexp_replace(trim(coalesce(p_content, '')), '\\s+', ' ', 'g');
  v_hash text;
  v_kind text := case when p_kind in ('profile', 'preference', 'instruction', 'project', 'fact', 'temporary') then p_kind else 'fact' end;
  v_retention text := case when p_retention_class in ('permanent', 'standard', 'temporary') then p_retention_class else 'standard' end;
  v_source text := case when p_source in ('chat', 'user', 'import', 'system') then p_source else 'chat' end;
  v_priority smallint := greatest(0, least(100, coalesce(p_priority, 50))::smallint);
  v_confidence numeric(4,3) := greatest(0, least(1, coalesce(p_confidence, 0.750)))::numeric(4,3);
  v_existing public.user_memories;
  v_result public.user_memories;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if v_key = '' or length(v_key) > 180 then raise exception 'memory_key_invalid'; end if;
  if v_content = '' or length(v_content) > 1200 then raise exception 'memory_content_invalid'; end if;
  v_hash := md5(v_content);

  select * into v_existing
  from public.user_memories
  where user_id = v_user_id and (content_hash = v_hash or memory_key = v_key)
  order by (content_hash = v_hash) desc, updated_at desc
  limit 1;

  if found then
    update public.user_memories
    set memory_key = v_key,
        content = v_content,
        kind = v_kind,
        priority = greatest(priority, v_priority),
        retention_class = case when retention_class = 'permanent' or v_retention = 'permanent' then 'permanent' else v_retention end,
        source = v_source,
        confidence = greatest(confidence, v_confidence),
        last_confirmed_at = case when v_source in ('user', 'import') then now() else last_confirmed_at end,
        expires_at = case when v_retention = 'temporary' then p_expires_at else null end,
        archived_at = null,
        updated_at = now()
    where id = v_existing.id
    returning * into v_result;
    return v_result;
  end if;

  insert into public.user_memories (user_id, memory_key, content, kind, priority, retention_class, source, confidence, content_hash, last_confirmed_at, expires_at)
  values (v_user_id, v_key, v_content, v_kind, v_priority, v_retention, v_source, v_confidence, v_hash, case when v_source in ('user', 'import') then now() else null end, case when v_retention = 'temporary' then p_expires_at else null end)
  returning * into v_result;
  return v_result;
end;
$$;

create or replace function public.prune_user_memories(p_user_id uuid default auth.uid(), p_max integer default null)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_target uuid := coalesce(p_user_id, v_caller);
  v_limit integer;
  v_removed integer := 0;
  v_deleted integer := 0;
begin
  if v_target is null then raise exception 'not_authenticated'; end if;
  if v_caller is null and coalesce(v_role, '') <> 'service_role' then raise exception 'not_authenticated'; end if;
  if v_caller is not null and v_target is distinct from v_caller and coalesce(v_role, '') <> 'service_role' then raise exception 'not_authorized'; end if;
  select coalesce(p_max, max_memories) into v_limit from public.user_memory_settings where user_id = v_target;
  v_limit := greatest(20, least(5000, coalesce(v_limit, 200)));

  delete from public.user_memories
  where user_id = v_target and (expires_at is not null and expires_at <= now());
  get diagnostics v_removed = row_count;

  select count(*) into v_deleted from public.user_memories where user_id = v_target;
  if v_deleted > v_limit then
    with victims as (
      select id
      from public.user_memories
      where user_id = v_target and retention_class = 'temporary'
      order by priority asc, coalesce(last_used_at, updated_at, created_at) asc
      limit greatest(v_deleted - v_limit, 0)
    )
    delete from public.user_memories m using victims v where m.id = v.id;
    get diagnostics v_deleted = row_count;
    v_removed := v_removed + v_deleted;
  end if;
  return v_removed;
end;
$$;

create or replace function public.create_user_data_backup(p_backup_kind text default 'snapshot', p_reason text default 'manual')
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_payload jsonb;
  v_id uuid;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_backup_kind not in ('snapshot', 'export') then raise exception 'backup_kind_invalid'; end if;
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'reason', left(coalesce(p_reason, 'manual'), 120),
    'exported_at', now(),
    'memories', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.priority desc, m.updated_at desc) from public.user_memories m where m.user_id = v_user_id and m.archived_at is null), '[]'::jsonb),
    'memory_settings', coalesce((select to_jsonb(s) - 'user_id' from public.user_memory_settings s where s.user_id = v_user_id), '{}'::jsonb),
    'app_user_state', coalesce((select to_jsonb(a) - 'user_id' from public.app_user_state a where a.user_id = v_user_id), '{}'::jsonb)
  );
  insert into public.user_data_backups (user_id, backup_kind, payload, checksum, expires_at)
  values (v_user_id, p_backup_kind, v_payload, md5(v_payload::text), case when p_backup_kind = 'export' then null else now() + interval '24 months' end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.restore_user_data_backup(p_backup_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_backup public.user_data_backups;
  v_memory jsonb;
  v_count integer := 0;
  v_settings jsonb;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  select * into v_backup from public.user_data_backups where id = p_backup_id and user_id = v_user_id;
  if not found then raise exception 'backup_not_found'; end if;
  if v_backup.checksum <> md5(v_backup.payload::text) then raise exception 'backup_checksum_invalid'; end if;
  for v_memory in select * from jsonb_array_elements(coalesce(v_backup.payload->'memories', '[]'::jsonb)) loop
    perform public.upsert_user_memory(
      v_memory->>'memory_key', v_memory->>'content', v_memory->>'kind',
      greatest(0, least(100, coalesce((v_memory->>'priority')::smallint, 50))),
      v_memory->>'retention_class', v_memory->>'source',
      greatest(0, least(1, coalesce((v_memory->>'confidence')::numeric, 0.750))),
      nullif(v_memory->>'expires_at', '')::timestamptz
    );
    v_count := v_count + 1;
  end loop;
  v_settings := v_backup.payload->'memory_settings';
  if jsonb_typeof(v_settings) = 'object' then
    insert into public.user_memory_settings (user_id, memory_enabled, capture_mode, max_memories, inactivity_notifications)
    values (
      v_user_id,
      coalesce((v_settings->>'memory_enabled')::boolean, true),
      case when v_settings->>'capture_mode' in ('suggested', 'automatic', 'disabled') then v_settings->>'capture_mode' else 'suggested' end,
      greatest(20, least(5000, coalesce((v_settings->>'max_memories')::integer, 200))),
      coalesce((v_settings->>'inactivity_notifications')::boolean, true)
    )
    on conflict (user_id) do update set memory_enabled = excluded.memory_enabled, capture_mode = excluded.capture_mode, max_memories = excluded.max_memories, inactivity_notifications = excluded.inactivity_notifications, updated_at = now();
  end if;
  update public.user_data_backups set restored_at = now() where id = v_backup.id;
  perform public.prune_user_memories(v_user_id, null);
  return v_count;
end;
$$;

create or replace function public.process_memory_retention()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user record;
  v_removed integer;
  v_total integer := 0;
begin
  insert into public.user_memory_settings (user_id)
  select p.id from public.profiles p
  on conflict (user_id) do nothing;

  for v_user in select user_id, max_memories from public.user_memory_settings where memory_enabled loop
    v_removed := public.prune_user_memories(v_user.user_id, v_user.max_memories);
    if v_removed > 0 then
      v_total := v_total + v_removed;
      insert into public.user_notifications (user_id, notification_type, title, body, metadata)
      values (v_user.user_id, 'memory_limit', 'Memória organizada', 'Memórias temporárias antigas foram removidas para manter sua conta leve.', jsonb_build_object('removed', v_removed));
    end if;
  end loop;
  return v_total;
end;
$$;

create or replace function public.process_inactivity_notifications()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count integer := 0;
begin
  insert into public.user_notifications (user_id, notification_type, source_event_id, title, body, metadata)
  select e.user_id, 'inactivity_warning', e.id,
    'Sua conta está há algum tempo sem atividade',
    case e.event_type when 'warning_90d' then 'Faltam aproximadamente 90 dias para a revisão de inatividade da conta.' when 'warning_30d' then 'Faltam aproximadamente 30 dias para a revisão de inatividade da conta.' else 'Faltam aproximadamente 7 dias para a revisão de inatividade da conta.' end,
    e.metadata
  from public.account_lifecycle_events e
  join public.user_memory_settings s on s.user_id = e.user_id and s.inactivity_notifications
  where e.event_type like 'warning_%' and e.sent_at is null
  on conflict (source_event_id) do nothing;
  get diagnostics v_count = row_count;
  update public.account_lifecycle_events e set sent_at = now() where e.sent_at is null and e.event_type like 'warning_%' and exists (select 1 from public.user_notifications n where n.source_event_id = e.id);
  return v_count;
end;
$$;

revoke all on function public.upsert_user_memory(text, text, text, smallint, text, text, numeric, timestamptz) from public, anon;
revoke all on function public.prune_user_memories(uuid, integer) from public, anon;
revoke all on function public.create_user_data_backup(text, text) from public, anon;
revoke all on function public.restore_user_data_backup(uuid) from public, anon;
revoke all on function public.process_memory_retention() from public, anon, authenticated;
revoke all on function public.process_inactivity_notifications() from public, anon, authenticated;
grant execute on function public.upsert_user_memory(text, text, text, smallint, text, text, numeric, timestamptz) to authenticated;
grant execute on function public.prune_user_memories(uuid, integer) to authenticated;
grant execute on function public.create_user_data_backup(text, text) to authenticated;
grant execute on function public.restore_user_data_backup(uuid) to authenticated;
grant execute on function public.process_memory_retention() to service_role;
grant execute on function public.process_inactivity_notifications() to service_role;

-- Atualiza o cron existente em vez de criar uma rotina paralela.
do $$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is not null then
    select jobid into v_job_id from cron.job where jobname = 'klipza-account-lifecycle-daily' limit 1;
    if v_job_id is not null then
      perform cron.alter_job(v_job_id, command := 'select public.process_account_lifecycle(); select public.process_memory_retention(); select public.process_inactivity_notifications(); select public.purge_due_accounts();');
    end if;
  end if;
end $$;

commit;
