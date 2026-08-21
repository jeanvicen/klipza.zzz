-- Klipza.IA — avaliação de mensagens
-- Permite registrar like/dislike por usuário para melhoria do produto.

begin;

create table if not exists public.message_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  chat_id text,
  feedback_type text not null check (feedback_type in ('like', 'dislike')),
  message_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.message_feedback enable row level security;

revoke all on table public.message_feedback from public, anon;
grant select, insert, update, delete on table public.message_feedback to authenticated;

drop policy if exists message_feedback_select_own on public.message_feedback;
drop policy if exists message_feedback_insert_own on public.message_feedback;
drop policy if exists message_feedback_update_own on public.message_feedback;
drop policy if exists message_feedback_delete_own on public.message_feedback;

create policy message_feedback_select_own on public.message_feedback
  for select to authenticated using (auth.uid() = user_id);
create policy message_feedback_insert_own on public.message_feedback
  for insert to authenticated with check (auth.uid() = user_id);
create policy message_feedback_update_own on public.message_feedback
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy message_feedback_delete_own on public.message_feedback
  for delete to authenticated using (auth.uid() = user_id);

create index if not exists message_feedback_created_idx
  on public.message_feedback (created_at desc);

commit;
