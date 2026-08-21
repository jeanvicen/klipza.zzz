-- Klipza.IA: memória automática com retenção profissional por conta.
-- Nenhum campo deste arquivo contém chaves de API ou dados de usuários.

begin;

alter table public.user_memory_settings
  alter column memory_enabled set default true,
  alter column capture_mode set default 'automatic',
  alter column max_memories set default 500;

update public.user_memory_settings
set memory_enabled = true,
    capture_mode = 'automatic',
    max_memories = 500,
    updated_at = now();

create or replace function public.enforce_user_memory_defaults()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.memory_enabled := true;
  new.capture_mode := 'automatic';
  new.max_memories := 500;
  return new;
end;
$$;

drop trigger if exists enforce_user_memory_defaults_trigger on public.user_memory_settings;
create trigger enforce_user_memory_defaults_trigger
before insert or update on public.user_memory_settings
for each row execute function public.enforce_user_memory_defaults();

revoke all on function public.enforce_user_memory_defaults() from public, anon, authenticated;

commit;

-- A API também normaliza contas antigas; o trigger mantém a regra em RPCs,
-- restaurações, imports e operações administrativas futuras.

begin;

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

  select greatest(20, least(500, coalesce(p_max, max_memories, 500)))
    into v_limit
    from public.user_memory_settings
   where user_id = v_target;
  v_limit := coalesce(v_limit, 500);

  delete from public.user_memories
   where user_id = v_target and expires_at is not null and expires_at <= now();
  get diagnostics v_removed = row_count;

  select count(*) into v_deleted from public.user_memories where user_id = v_target;
  if v_deleted > v_limit then
    with victims as (
      select id
        from public.user_memories
       where user_id = v_target
       order by case retention_class when 'temporary' then 0 when 'standard' then 1 else 2 end,
                priority asc,
                coalesce(last_used_at, updated_at, created_at) asc
       limit greatest(v_deleted - v_limit, 0)
    )
    delete from public.user_memories m using victims v where m.id = v.id;
    get diagnostics v_deleted = row_count;
    v_removed := v_removed + v_deleted;
  end if;
  return v_removed;
end;
$$;

revoke all on function public.prune_user_memories(uuid, integer) from public, anon;
grant execute on function public.prune_user_memories(uuid, integer) to authenticated;

commit;
