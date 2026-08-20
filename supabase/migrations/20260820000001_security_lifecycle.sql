-- Klipza.IA — segurança, integridade referencial e ciclo de vida de contas
-- Esta migração é deliberadamente versionada no GitHub.
-- Pré-requisito operacional: habilitar Supabase Cron no Dashboard e aplicar
-- supabase/migrations/20260820000002_cron.sql depois desta migração.

begin;

-- 1. Privilégio mínimo: RLS continua sendo a segunda barreira, mas os grants
-- também não devem permitir operações que a aplicação não usa.
revoke all on table public.profiles, public.conversations, public.artifacts,
  public.purchases, public.account_deletions from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, country, language) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.conversations, public.artifacts to authenticated;
grant select on table public.purchases, public.account_deletions to authenticated;

-- 2. Registro explícito de atividade e do estágio de aviso.
alter table public.profiles
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists inactivity_warning_level smallint not null default 0,
  add column if not exists is_admin boolean not null default false,
  add column if not exists restricted boolean not null default false,
  add column if not exists restriction_reason text;

update public.profiles
set last_activity_at = greatest(
  coalesce(last_activity_at, created_at),
  coalesce(updated_at, created_at),
  created_at
)
where last_activity_at is null or last_activity_at < created_at;

alter table public.profiles
  drop constraint if exists profiles_inactivity_warning_level_check;
alter table public.profiles
  add constraint profiles_inactivity_warning_level_check
  check (inactivity_warning_level between 0 and 3);

create index if not exists profiles_last_activity_idx
  on public.profiles (status, last_activity_at);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  target_user_id uuid,
  action text not null check (action in ('block', 'unblock', 'restrict', 'unrestrict', 'delete', 'reset_password', 'cancel_deletion')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;

-- 3. Eventos internos de ciclo de vida. Não ficam expostos ao cliente.
create table if not exists public.account_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null check (event_type in ('warning_90d', 'warning_30d', 'warning_7d', 'deletion_queued')),
  occurred_at timestamptz not null default now(),
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, event_type)
);

alter table public.account_lifecycle_events enable row level security;
revoke all on table public.account_lifecycle_events from public, anon, authenticated;

-- 4. Integridade: apagar auth.users deve apagar os dados próprios associados.
-- A migração falha de propósito se encontrar órfãos, evitando apagar ou
-- adivinhar dados existentes durante a instalação.
do $$
begin
  if exists (select 1 from public.profiles p left join auth.users u on u.id = p.id where u.id is null)
    or exists (select 1 from public.conversations c left join auth.users u on u.id = c.user_id where u.id is null)
    or exists (select 1 from public.artifacts a left join auth.users u on u.id = a.user_id where u.id is null)
    or exists (select 1 from public.purchases p left join auth.users u on u.id = p.user_id where u.id is null)
    or exists (select 1 from public.account_deletions d left join auth.users u on u.id = d.user_id where u.id is null)
  then
    raise exception 'klipza_security_lifecycle: orphan rows found; clean them explicitly before applying foreign keys';
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_id_auth_users_fkey') then
    alter table public.profiles add constraint profiles_id_auth_users_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversations_user_id_auth_users_fkey') then
    alter table public.conversations add constraint conversations_user_id_auth_users_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'artifacts_user_id_auth_users_fkey') then
    alter table public.artifacts add constraint artifacts_user_id_auth_users_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchases_user_id_auth_users_fkey') then
    alter table public.purchases add constraint purchases_user_id_auth_users_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'account_deletions_user_id_auth_users_fkey') then
    alter table public.account_deletions add constraint account_deletions_user_id_auth_users_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'account_lifecycle_events_user_id_auth_users_fkey') then
    alter table public.account_lifecycle_events add constraint account_lifecycle_events_user_id_auth_users_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_audit_log_admin_id_auth_users_fkey') then
    alter table public.admin_audit_log add constraint admin_audit_log_admin_id_auth_users_fkey
      foreign key (admin_id) references auth.users(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'admin_audit_log_target_id_auth_users_fkey') then
    alter table public.admin_audit_log add constraint admin_audit_log_target_id_auth_users_fkey
      foreign key (target_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- 5. Função segura chamada pelo cliente apenas para marcar atividade própria.
create or replace function public.touch_user_activity()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles
  set last_activity_at = now(),
      inactivity_warning_level = 0,
      updated_at = now()
  where id = auth.uid() and status = 'active';

  delete from public.account_lifecycle_events
  where user_id = auth.uid() and event_type like 'warning_%';
end;
$$;

revoke all on function public.touch_user_activity() from public, anon;
grant execute on function public.touch_user_activity() to authenticated;

-- 6. Processamento determinístico diário: 90, 30 e 7 dias antes de 24 meses,
-- depois enfileira a exclusão para purge_due_accounts.
create or replace function public.process_account_lifecycle()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  queued integer := 0;
begin
  insert into public.account_lifecycle_events (user_id, event_type, metadata)
  select p.id, 'warning_90d', jsonb_build_object('months_until_deletion', 3)
  from public.profiles p
  where p.status = 'active'
    and p.last_activity_at <= now() - interval '24 months' + interval '90 days'
    and p.last_activity_at > now() - interval '24 months'
    and p.inactivity_warning_level < 1
  on conflict (user_id, event_type) do nothing;
  update public.profiles
  set inactivity_warning_level = greatest(inactivity_warning_level, 1), updated_at = now()
  where status = 'active'
    and last_activity_at <= now() - interval '24 months' + interval '90 days'
    and last_activity_at > now() - interval '24 months';

  insert into public.account_lifecycle_events (user_id, event_type, metadata)
  select p.id, 'warning_30d', jsonb_build_object('days_until_deletion', 30)
  from public.profiles p
  where p.status = 'active'
    and p.last_activity_at <= now() - interval '24 months' + interval '30 days'
    and p.last_activity_at > now() - interval '24 months'
    and p.inactivity_warning_level < 2
  on conflict (user_id, event_type) do nothing;
  update public.profiles
  set inactivity_warning_level = greatest(inactivity_warning_level, 2), updated_at = now()
  where status = 'active'
    and last_activity_at <= now() - interval '24 months' + interval '30 days'
    and last_activity_at > now() - interval '24 months';

  insert into public.account_lifecycle_events (user_id, event_type, metadata)
  select p.id, 'warning_7d', jsonb_build_object('days_until_deletion', 7)
  from public.profiles p
  where p.status = 'active'
    and p.last_activity_at <= now() - interval '24 months' + interval '7 days'
    and p.last_activity_at > now() - interval '24 months'
    and p.inactivity_warning_level < 3
  on conflict (user_id, event_type) do nothing;
  update public.profiles
  set inactivity_warning_level = greatest(inactivity_warning_level, 3), updated_at = now()
  where status = 'active'
    and last_activity_at <= now() - interval '24 months' + interval '7 days'
    and last_activity_at > now() - interval '24 months';

  insert into public.account_lifecycle_events (user_id, event_type, metadata)
  select p.id, 'deletion_queued', jsonb_build_object('policy', '24_months_inactive')
  from public.profiles p
  where p.status = 'active'
    and p.last_activity_at <= now() - interval '24 months'
  on conflict (user_id, event_type) do nothing;

  update public.profiles
  set status = 'pending_deletion',
      deletion_requested_at = coalesce(deletion_requested_at, now()),
      deletion_scheduled_for = now(),
      updated_at = now()
  where status = 'active'
    and last_activity_at <= now() - interval '24 months';

  insert into public.account_deletions (user_id, requested_at, scheduled_for, status, reason)
  select p.id, coalesce(p.deletion_requested_at, now()), now(), 'pending', 'inatividade por 24 meses'
  from public.profiles p
  where p.status = 'pending_deletion'
    and p.deletion_scheduled_for <= now()
    and not exists (
      select 1 from public.account_deletions d
      where d.user_id = p.id and d.status = 'pending'
    )
  on conflict (user_id) do update
    set scheduled_for = excluded.scheduled_for,
        status = 'pending',
        reason = excluded.reason,
        processed_at = null;

  get diagnostics queued = row_count;
  return queued;
end;
$$;

create or replace function public.purge_due_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_count integer := 0;
  account_id uuid;
begin
  for account_id in
    select user_id
    from public.account_deletions
    where status = 'pending' and scheduled_for <= now()
    for update skip locked
  loop
    delete from auth.users where id = account_id;
    deleted_count := deleted_count + 1;
  end loop;
  return deleted_count;
end;
$$;

-- 7. Funções administrativas não são RPCs públicas.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.process_account_lifecycle() from public, anon, authenticated;
revoke all on function public.purge_due_accounts() from public, anon, authenticated;
grant execute on function public.process_account_lifecycle() to service_role;
grant execute on function public.purge_due_accounts() to service_role;

revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

commit;
