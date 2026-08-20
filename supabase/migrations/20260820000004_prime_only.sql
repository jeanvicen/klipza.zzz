-- Klipza.IA — somente Klipza.Prime mensal
-- Pré-requisito: 20260820000003_billing.sql aplicada.
-- A ativação de cobrança deve ocorrer somente depois de configurar o Mercado Pago.

begin;

update public.billing_products
set is_active = false, amount_cents = null, updated_at = now()
where kind = 'token_pack';

update public.billing_products
set title = 'Klipza.Prime Mensal',
    description = 'Assinatura mensal com 1.500 tokens por ciclo e anexos/fotos ilimitados.',
    token_amount = 1500,
    amount_cents = 5990,
    currency = 'BRL',
    interval_months = 1,
    is_active = false,
    updated_at = now()
where code = 'prime_monthly';

create or replace function public.apply_prime_activation(
  p_order_id uuid,
  p_provider_subscription_id text,
  p_event_key text,
  p_status text,
  p_current_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.billing_orders%rowtype;
  v_status text := case
    when p_status in ('authorized','active') then 'active'
    when p_status = 'paused' then 'paused'
    when p_status = 'cancelled' then 'cancelled'
    when p_status = 'expired' then 'expired'
    else 'pending'
  end;
  v_grant_tokens boolean := (v_status = 'active' and p_event_key like 'mp_payment:%');
  v_balance bigint;
  v_inserted integer := 0;
begin
  select * into v_order from public.billing_orders where id=p_order_id for update;
  if not found then raise exception 'billing_order_not_found'; end if;
  if v_order.kind <> 'prime_subscription' then raise exception 'billing_order_is_not_prime'; end if;

  update public.billing_orders
  set status=case when v_status='active' then 'approved' when v_status='cancelled' then 'cancelled' when v_status='expired' then 'expired' else 'pending' end,
      provider_subscription_id=coalesce(p_provider_subscription_id,provider_subscription_id),
      approved_at=case when v_status='active' then coalesce(approved_at,now()) else approved_at end,
      updated_at=now()
  where id=p_order_id;

  insert into public.prime_subscriptions(user_id,order_id,provider_subscription_id,plan_code,status,current_period_end,metadata)
  values(v_order.user_id,v_order.id,p_provider_subscription_id,v_order.product_code,v_status,p_current_period_end,jsonb_build_object('event_key',p_event_key))
  on conflict(provider_subscription_id) do update
    set status=excluded.status,
        current_period_end=coalesce(excluded.current_period_end,prime_subscriptions.current_period_end),
        updated_at=now(),
        metadata=excluded.metadata;

  update public.profiles
  set prime_status=v_status,
      prime_plan_code=v_order.product_code,
      prime_subscription_id=coalesce(p_provider_subscription_id,prime_subscription_id),
      prime_current_period_end=coalesce(p_current_period_end,prime_current_period_end),
      last_activity_at=now(),
      inactivity_warning_level=0,
      updated_at=now()
  where id=v_order.user_id;

  if v_grant_tokens then
    select token_balance into v_balance from public.profiles where id=v_order.user_id for update;
    v_balance := coalesce(v_balance,0) + v_order.token_amount;
    insert into public.wallet_ledger(user_id,order_id,entry_type,token_amount,balance_after,event_key,description,metadata)
    values(v_order.user_id,v_order.id,'purchase_credit',v_order.token_amount,v_balance,p_event_key,'1.500 tokens do ciclo Klipza.Prime',jsonb_build_object('provider_subscription_id',p_provider_subscription_id))
    on conflict(event_key) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted > 0 then
      update public.profiles
      set token_balance=v_balance, updated_at=now()
      where id=v_order.user_id;
    end if;
  end if;

  return jsonb_build_object(
    'active',v_status='active',
    'status',v_status,
    'tokens_granted',case when v_inserted > 0 then v_order.token_amount else 0 end,
    'already_processed',v_grant_tokens and v_inserted = 0
  );
end;
$$;

revoke all on function public.apply_prime_activation(uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_prime_activation(uuid,text,text,text,timestamptz) to service_role;

commit;
