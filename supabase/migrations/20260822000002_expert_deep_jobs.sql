-- Klipza.IA — extensão incremental de deep_jobs para o Modo Especialista
-- Mantém RLS por usuário e não altera o contrato dos jobs de chat.
begin;

alter table public.deep_jobs
drop constraint if exists deep_jobs_mode_check;

alter table public.deep_jobs
add constraint deep_jobs_mode_check
check (mode in ('chat', 'expert'));

alter table public.deep_jobs
drop constraint if exists deep_jobs_status_check;

alter table public.deep_jobs
add constraint deep_jobs_status_check
check (status in ('awaiting_confirmation', 'queued', 'processing', 'awaiting_user', 'completed', 'failed', 'canceled'));

create index if not exists deep_jobs_expert_waiting_idx
  on public.deep_jobs (user_id, updated_at desc)
  where mode = 'expert' and status in ('awaiting_confirmation', 'awaiting_user');

commit;
