-- Klipza.IA — saldo persistente, recursos pagos e Klipza.Prime
-- Pré-requisitos: 20260820000001_security_lifecycle.sql e 20260820000002_cron.sql.
-- Valores de catálogo devem ser preenchidos pelo proprietário antes de ativar cobrança real.

begin;

alter table public.profiles
  add column if not exists token_balance bigint not null default 0,
  add column if not exists prime_status text not null default 'inactive',
  add column if not exists prime_plan_code text,
  add column if not exists prime_subscription_id text,
  add column if not exists prime_current_period_end timestamptz;

alter table public.profiles drop constraint if exists profiles_token_balance_check;
alter table public.profiles add constraint profiles_token_balance_check check (token_balance >= 0);
alter table public.profiles drop constraint if exists profiles_prime_status_check;
alter table public.profiles add constraint profiles_prime_status_check check (prime_status in ('inactive','pending','active','paused','cancelled','expired'));

create table if not exists public.billing_products (
  code text primary key,
  kind text not null check (kind in ('token_pack','prime_subscription')),
  title text not null,
  description text not null default '',
  token_amount bigint not null default 0 check (token_amount >= 0),
  amount_cents integer check (amount_cents is null or amount_cents > 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  interval_months integer check (interval_months is null or interval_months in (1,12)),
  is_active boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.billing_products (code, kind, title, description, token_amount, amount_cents, currency, interval_months, is_active, sort_order)
values
  ('tokens_100', 'token_pack', '100 tokens', 'Pacote de 100 tokens para uso no Klipza.IA.', 100, null, 'BRL', null, false, 10),
  ('tokens_500', 'token_pack', '500 tokens', 'Pacote de 500 tokens para uso no Klipza.IA.', 500, null, 'BRL', null, false, 20),
  ('tokens_1000', 'token_pack', '1.000 tokens', 'Pacote de 1.000 tokens para uso no Klipza.IA.', 1000, null, 'BRL', null, false, 30),
  ('prime_monthly', 'prime_subscription', 'Klipza.Prime Mensal', 'Assinatura mensal do Klipza.Prime.', 0, null, 'BRL', 1, false, 40),
  ('prime_yearly', 'prime_subscription', 'Klipza.Prime Anual', 'Assinatura anual do Klipza.Prime.', 0, null, 'BRL', 12, false, 50)
on conflict (code) do nothing;

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_code text not null references public.billing_products(code),
  kind text not null check (kind in ('token_pack','prime_subscription')),
  title text not null,
  token_amount bigint not null default 0 check (token_amount >= 0),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','expired','refunded','charged_back')),
  provider text not null default 'unconfigured',
  provider_preference_id text,
  provider_payment_id text,
  provider_subscription_id text,
  idempotency_key text not null unique,
  external_reference text not null unique,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists billing_orders_user_created_idx on public.billing_orders(user_id, created_at desc);
create unique index if not exists billing_orders_provider_payment_idx on public.billing_orders(provider_payment_id) where provider_payment_id is not null;
create unique index if not exists billing_orders_provider_subscription_idx on public.billing_orders(provider_subscription_id) where provider_subscription_id is not null;

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  order_id uuid,
  entry_type text not null check (entry_type in ('purchase_credit','usage_debit','refund_debit','manual_adjustment')),
  token_amount bigint not null check (token_amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  event_key text unique,
  description text not null default '',
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists wallet_ledger_user_created_idx on public.wallet_ledger(user_id, created_at desc);

create table if not exists public.prime_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  order_id uuid,
  provider_subscription_id text not null unique,
  plan_code text not null references public.billing_products(code),
  status text not null check (status in ('pending','authorized','active','paused','cancelled','expired','rejected')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists prime_subscriptions_user_idx on public.prime_subscriptions(user_id, updated_at desc);

create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique(provider, provider_event_id)
);

alter table public.billing_products enable row level security;
alter table public.billing_orders enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.prime_subscriptions enable row level security;
alter table public.billing_provider_events enable row level security;

revoke all on table public.billing_products, public.billing_orders, public.wallet_ledger, public.prime_subscriptions, public.billing_provider_events from public, anon, authenticated;
grant select on table public.billing_products, public.billing_orders, public.wallet_ledger, public.prime_subscriptions to authenticated;

drop policy if exists billing_products_read_active on public.billing_products;
create policy billing_products_read_active on public.billing_products for select to authenticated using (is_active = true);
drop policy if exists billing_orders_own_read on public.billing_orders;
create policy billing_orders_own_read on public.billing_orders for select to authenticated using (user_id = auth.uid());
drop policy if exists wallet_ledger_own_read on public.wallet_ledger;
create policy wallet_ledger_own_read on public.wallet_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists prime_subscriptions_own_read on public.prime_subscriptions;
create policy prime_subscriptions_own_read on public.prime_subscriptions for select to authenticated using (user_id = auth.uid());

-- Integridade referencial das novas tabelas.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'billing_orders_user_id_auth_users_fkey') then
    alter table public.billing_orders add constraint billing_orders_user_id_auth_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wallet_ledger_user_id_auth_users_fkey') then
    alter table public.wallet_ledger add constraint wallet_ledger_user_id_auth_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wallet_ledger_order_id_billing_orders_fkey') then
    alter table public.wallet_ledger add constraint wallet_ledger_order_id_billing_orders_fkey foreign key (order_id) references public.billing_orders(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prime_subscriptions_user_id_auth_users_fkey') then
    alter table public.prime_subscriptions add constraint prime_subscriptions_user_id_auth_users_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prime_subscriptions_order_id_billing_orders_fkey') then
    alter table public.prime_subscriptions add constraint prime_subscriptions_order_id_billing_orders_fkey foreign key (order_id) references public.billing_orders(id) on delete set null;
  end if;
end $$;

create or replace function public.apply_billing_approval(
  p_order_id uuid,
  p_provider_payment_id text,
  p_event_key text,
  p_paid_amount_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.billing_orders%rowtype;
  v_balance bigint;
  v_inserted integer := 0;
begin
  select * into v_order from public.billing_orders where id = p_order_id for update;
  if not found then raise exception 'billing_order_not_found'; end if;
  if v_order.amount_cents <> p_paid_amount_cents then raise exception 'billing_amount_mismatch'; end if;
  if v_order.status = 'approved' then
    return jsonb_build_object('approved', true, 'already_processed', true, 'token_balance', (select token_balance from public.profiles where id=v_order.user_id));
  end if;
  if v_order.kind <> 'token_pack' then raise exception 'billing_order_is_not_token_pack'; end if;

  update public.billing_orders
  set status='approved', provider_payment_id=p_provider_payment_id, approved_at=now(), updated_at=now()
  where id=p_order_id;

  select token_balance into v_balance from public.profiles where id=v_order.user_id for update;
  v_balance := coalesce(v_balance,0) + v_order.token_amount;
  insert into public.wallet_ledger(user_id,order_id,entry_type,token_amount,balance_after,event_key,description,metadata)
  values(v_order.user_id,v_order.id,'purchase_credit',v_order.token_amount,v_balance,p_event_key,'Compra confirmada pelo processador configurado',jsonb_build_object('provider_payment_id',p_provider_payment_id))
  on conflict(event_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.profiles set token_balance=v_balance,last_activity_at=now(),inactivity_warning_level=0,updated_at=now() where id=v_order.user_id;
  end if;
  return jsonb_build_object('approved',true,'already_processed',v_inserted = 0,'token_balance',v_balance);
end;
$$;

create or replace function public.consume_wallet_tokens(
  p_user_id uuid,
  p_amount bigint,
  p_event_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_existing public.wallet_ledger%rowtype;
  v_new_balance bigint;
begin
  if p_amount <= 0 then raise exception 'wallet_amount_invalid'; end if;
  select * into v_existing from public.wallet_ledger where event_key=p_event_key limit 1;
  if found then return jsonb_build_object('consumed',true,'already_processed',true,'token_balance',v_existing.balance_after); end if;
  select token_balance into v_balance from public.profiles where id=p_user_id for update;
  if v_balance is null then raise exception 'wallet_profile_not_found'; end if;
  if v_balance < p_amount then return jsonb_build_object('consumed',false,'already_processed',false,'token_balance',v_balance); end if;
  v_new_balance := v_balance - p_amount;
  insert into public.wallet_ledger(user_id,entry_type,token_amount,balance_after,event_key,description)
  values(p_user_id,'usage_debit',-p_amount,v_new_balance,p_event_key,'Uso de tokens no chat');
  update public.profiles set token_balance=v_new_balance,last_activity_at=now(),inactivity_warning_level=0,updated_at=now() where id=p_user_id;
  return jsonb_build_object('consumed',true,'already_processed',false,'token_balance',v_new_balance);
end;
$$;

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
  v_status text := case when p_status in ('authorized','active') then 'active' else 'pending' end;
begin
  select * into v_order from public.billing_orders where id=p_order_id for update;
  if not found then raise exception 'billing_order_not_found'; end if;
  if v_order.kind <> 'prime_subscription' then raise exception 'billing_order_is_not_prime'; end if;
  update public.billing_orders set status=case when v_status='active' then 'approved' else 'pending' end,provider_subscription_id=p_provider_subscription_id,approved_at=case when v_status='active' then coalesce(approved_at,now()) else approved_at end,updated_at=now() where id=p_order_id;
  insert into public.prime_subscriptions(user_id,order_id,provider_subscription_id,plan_code,status,current_period_end,metadata)
  values(v_order.user_id,v_order.id,p_provider_subscription_id,v_order.product_code,v_status,p_current_period_end,jsonb_build_object('event_key',p_event_key))
  on conflict(provider_subscription_id) do update set status=excluded.status,current_period_end=excluded.current_period_end,updated_at=now(),metadata=excluded.metadata;
  update public.profiles set prime_status=v_status,prime_plan_code=v_order.product_code,prime_subscription_id=p_provider_subscription_id,prime_current_period_end=p_current_period_end,last_activity_at=now(),inactivity_warning_level=0,updated_at=now() where id=v_order.user_id;
  return jsonb_build_object('active',v_status='active','status',v_status);
end;
$$;

revoke all on function public.apply_billing_approval(uuid,text,text,integer) from public, anon, authenticated;
revoke all on function public.consume_wallet_tokens(uuid,bigint,text) from public, anon, authenticated;
revoke all on function public.apply_prime_activation(uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_billing_approval(uuid,text,text,integer) to service_role;
grant execute on function public.consume_wallet_tokens(uuid,bigint,text) to service_role;
grant execute on function public.apply_prime_activation(uuid,text,text,text,timestamptz) to service_role;

commit;
