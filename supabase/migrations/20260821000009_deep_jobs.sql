-- Klipza.IA — tarefas de Pensamento profundo retomáveis por conta
-- Sem chaves, tokens ou dados de usuários neste arquivo.

begin;

create table if not exists public.deep_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null,
  message_id text not null,
  message text not null,
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  mode text not null default 'chat' check (mode in ('chat')),
  provider text not null default 'auto' check (provider in ('auto', 'groq', 'qwen', 'hermes')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'canceled')),
  complexity text not null default 'standard' check (complexity in ('standard', 'medium', 'high')),
  progress jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  error_message text,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  delivered_at timestamptz,
  unique (user_id, message_id)
);

alter table public.user_notifications
  drop constraint if exists user_notifications_notification_type_check;

alter table public.user_notifications
  add constraint user_notifications_notification_type_check
  check (notification_type in ('inactivity_warning', 'memory_limit', 'ai_response_complete'));

alter table public.deep_jobs enable row level security;
revoke all on table public.deep_jobs from public, anon;
grant select, insert, update on table public.deep_jobs to authenticated;

drop policy if exists deep_jobs_select_own on public.deep_jobs;
drop policy if exists deep_jobs_insert_own on public.deep_jobs;
drop policy if exists deep_jobs_update_own on public.deep_jobs;
create policy deep_jobs_select_own on public.deep_jobs for select to authenticated using (auth.uid() = user_id);
create policy deep_jobs_insert_own on public.deep_jobs for insert to authenticated with check (auth.uid() = user_id);
create policy deep_jobs_update_own on public.deep_jobs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists deep_jobs_user_updated_idx on public.deep_jobs (user_id, updated_at desc);
create index if not exists deep_jobs_queue_idx on public.deep_jobs (status, updated_at asc) where status in ('queued', 'processing');
create index if not exists deep_jobs_completed_idx on public.deep_jobs (user_id, completed_at desc) where status = 'completed';

create or replace function public.touch_deep_job_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists deep_jobs_touch_updated_at on public.deep_jobs;
create trigger deep_jobs_touch_updated_at
before update on public.deep_jobs
for each row execute function public.touch_deep_job_updated_at();

commit;
