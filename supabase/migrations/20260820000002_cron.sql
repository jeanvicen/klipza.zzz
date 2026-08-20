-- Klipza.IA — job diário do ciclo de vida
-- Habilite a extensão Supabase Cron no Dashboard antes de aplicar este arquivo.

begin;

do $$
begin
  if to_regnamespace('cron') is null then
    raise exception 'klipza_lifecycle_cron: habilite Supabase Cron/pg_cron no Dashboard antes desta migração';
  end if;

  if not exists (select 1 from cron.job where jobname = 'klipza-account-lifecycle-daily') then
    perform cron.schedule(
      'klipza-account-lifecycle-daily',
      '15 3 * * *',
      $job$select public.process_account_lifecycle(); select public.purge_due_accounts();$job$
    );
  end if;
end $$;

commit;
