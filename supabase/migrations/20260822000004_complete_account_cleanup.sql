-- Klipza.IA — limpeza completa de conta após exclusão definitiva
-- Executar depois das migrações de ciclo de vida, memória, quotas, jobs e Expert.

begin;

create or replace function public.purge_account_completely(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted integer := 0;
begin
  if p_user_id is null then
    raise exception 'account_cleanup_missing_user';
  end if;
  -- Esta rotina só pode ser chamada pelo worker com credencial de serviço.
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'account_cleanup_internal_only';
  end if;

  -- Apaga primeiro os dados filhos e os registros que podem conter conteúdo,
  -- mesmo que alguma instalação antiga ainda não tenha todas as FKs em cascata.
  delete from public.user_notifications where user_id = p_user_id;
  delete from public.user_memory_settings where user_id = p_user_id;
  delete from public.user_memories where user_id = p_user_id;
  delete from public.user_data_backups where user_id = p_user_id;
  delete from public.message_feedback where user_id = p_user_id;
  delete from public.deep_jobs where user_id = p_user_id;
  delete from public.expert_mode_usage where user_id = p_user_id;
  delete from public.user_attachment_ledger where user_id = p_user_id;
  delete from public.user_energy_ledger where user_id = p_user_id;
  delete from public.wallet_ledger where user_id = p_user_id;
  delete from public.prime_subscriptions where user_id = p_user_id;
  delete from public.billing_orders where user_id = p_user_id;
  delete from public.app_user_state where user_id = p_user_id;
  delete from public.conversations where user_id = p_user_id;
  delete from public.artifacts where user_id = p_user_id;
  delete from public.purchases where user_id = p_user_id;
  delete from public.account_lifecycle_events where user_id = p_user_id;
  delete from public.account_deletions where user_id = p_user_id;

  -- O banco não apaga automaticamente objetos do Storage por FK. Quando o
  -- Storage existir, remove objetos cujo proprietário ou caminho identifica a conta.
  if to_regclass('storage.objects') is not null then
    execute 'delete from storage.objects where owner_id::text = $1 or name like $2'
      using p_user_id::text, p_user_id::text || '/%';
  end if;

  -- A remoção de auth.users aciona as FKs restantes com ON DELETE CASCADE.
  delete from auth.users where id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
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
    if public.purge_account_completely(account_id) then
      deleted_count := deleted_count + 1;
    end if;
  end loop;
  return deleted_count;
end;
$$;

revoke all on function public.purge_account_completely(uuid) from public, anon, authenticated;
revoke all on function public.purge_due_accounts() from public, anon, authenticated;
grant execute on function public.purge_account_completely(uuid) to service_role;
grant execute on function public.purge_due_accounts() to service_role;

-- Atualiza o cron existente, quando o pg_cron já estiver habilitado.
do $$
declare
  v_job_id bigint;
begin
  if to_regnamespace('cron') is not null then
    select jobid into v_job_id
    from cron.job
    where jobname = 'klipza-account-lifecycle-daily'
    limit 1;
    if v_job_id is not null then
      perform cron.alter_job(v_job_id, command := 'select public.process_account_lifecycle(); select public.process_memory_retention(); select public.process_inactivity_notifications(); select public.purge_due_accounts();');
    end if;
  end if;
end $$;

commit;
