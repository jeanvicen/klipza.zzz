import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const MP_API = 'https://api.mercadopago.com';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(status).json(body);
}

function bearer(request) {
  const value = request.headers?.authorization || request.headers?.Authorization || '';
  return String(value).replace(/^Bearer\s+/i, '').trim();
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('sb_publishable_')) throw Object.assign(new Error('billing_service_not_configured'), { status: 503 });
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireUser(request) {
  const client = serviceClient();
  const token = bearer(request);
  if (!token) throw Object.assign(new Error('Não autenticado.'), { status: 401 });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Sessão inválida.'), { status: 401 });
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,display_name,status,restricted,token_balance,prime_status,prime_plan_code,prime_subscription_id,prime_current_period_end')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || ['blocked', 'pending_deletion'].includes(profile.status)) throw Object.assign(new Error('Conta sem permissão para compras.'), { status: 403 });
  return { client, user, profile };
}

function publicOrigin(request) {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = request.headers?.host || process.env.VERCEL_URL || 'klipza-zzz.vercel.app';
  const protocol = String(host).includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function accessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '';
  if (!token || token.includes('<ENV_ACCESS_TOKEN>')) throw Object.assign(new Error('Mercado Pago ainda não foi configurado no ambiente seguro.'), { status: 503 });
  return token;
}

function amountNumber(cents) { return Number((Number(cents) / 100).toFixed(2)); }
function cleanCode(value) { return String(value || '').trim().slice(0, 80); }
function randomKey() { return crypto.randomUUID(); }

async function mpFetch(path, options = {}) {
  const response = await fetch(`${MP_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken()}`,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Mercado Pago respondeu ${response.status}`);
    error.status = response.status >= 500 ? 502 : 400;
    error.provider = data;
    throw error;
  }
  return data;
}

function productDTO(product) {
  return {
    code: product.code,
    kind: product.kind,
    title: product.title,
    description: product.description,
    tokenAmount: Number(product.token_amount || 0),
    amountCents: Number(product.amount_cents || 0),
    currency: product.currency,
    intervalMonths: product.interval_months,
    sortOrder: product.sort_order
  };
}

async function getCatalog(client) {
  const { data, error } = await client.from('billing_products').select('code,kind,title,description,token_amount,amount_cents,currency,interval_months,sort_order').eq('code', 'prime_monthly').eq('is_active', true).not('amount_cents', 'is', null).order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).filter(product => Number(product.amount_cents) > 0).map(productDTO);
}

async function createOrder(client, user, product) {
  const idempotencyKey = randomKey();
  const { data, error } = await client.from('billing_orders').insert({
    user_id: user.id,
    product_code: product.code,
    kind: product.kind,
    title: product.title,
    token_amount: product.tokenAmount,
    amount_cents: product.amountCents,
    currency: product.currency,
    idempotency_key: idempotencyKey,
    external_reference: `klipza_${crypto.randomUUID()}`
  }).select('id,external_reference,idempotency_key,product_code,kind,title,token_amount,amount_cents,currency,status').single();
  if (error) throw error;
  return data;
}

async function createTokenCheckout(client, user, product, order, request) {
  const origin = publicOrigin(request);
  const webhook = `${origin}/api/mercadopago-webhook`;
  const preference = await mpFetch('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{
        id: product.code,
        title: product.title,
        description: product.description,
        quantity: 1,
        currency_id: product.currency,
        unit_price: amountNumber(product.amountCents)
      }],
      payer: { email: user.email },
      external_reference: order.external_reference,
      notification_url: webhook,
      back_urls: {
        success: `${origin}/?payment=success&order=${encodeURIComponent(order.id)}`,
        failure: `${origin}/?payment=failure&order=${encodeURIComponent(order.id)}`,
        pending: `${origin}/?payment=pending&order=${encodeURIComponent(order.id)}`
      },
      auto_return: 'approved',
      metadata: { order_id: order.id, user_id: user.id, product_code: product.code }
    })
  });
  const { error } = await client.from('billing_orders').update({ provider_preference_id: String(preference.id || ''), updated_at: new Date().toISOString() }).eq('id', order.id);
  if (error) throw error;
  return { orderId: order.id, checkoutUrl: preference.init_point || preference.sandbox_init_point || null, sandboxCheckoutUrl: preference.sandbox_init_point || null, product: productDTO(product) };
}

async function createPrimeSubscription(client, user, product, order, request) {
  const origin = publicOrigin(request);
  const interval = 1;
  const subscription = await mpFetch('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: product.title,
      external_reference: order.external_reference,
      payer_email: user.email,
      back_url: `${origin}/?payment=prime&order=${encodeURIComponent(order.id)}`,
      notification_url: `${origin}/api/mercadopago-webhook`,
      auto_recurring: {
        frequency: interval,
        frequency_type: 'months',
        transaction_amount: amountNumber(product.amountCents),
        currency_id: product.currency
      },
      status: 'pending',
      metadata: { order_id: order.id, user_id: user.id, product_code: product.code }
    })
  });
  const { error } = await client.from('billing_orders').update({ provider_subscription_id: String(subscription.id || ''), updated_at: new Date().toISOString() }).eq('id', order.id);
  if (error) throw error;
  return { orderId: order.id, checkoutUrl: subscription.init_point || subscription.sandbox_init_point || subscription.url || null, sandboxCheckoutUrl: subscription.sandbox_init_point || null, product: productDTO(product) };
}

async function createCheckout(client, user, body, request) {
  const productCode = cleanCode(body?.productCode);
  if (!productCode) throw Object.assign(new Error('Escolha o Klipza.Prime.'), { status: 400 });
  if (productCode !== 'prime_monthly') throw Object.assign(new Error('Apenas o Klipza.Prime mensal está disponível.'), { status: 410 });
  const { data: row, error } = await client.from('billing_products').select('code,kind,title,description,token_amount,amount_cents,currency,interval_months,sort_order').eq('code', productCode).eq('is_active', true).maybeSingle();
  if (error) throw error;
  if (!row || !row.amount_cents || Number(row.amount_cents) <= 0) throw Object.assign(new Error('Este produto ainda não está configurado para venda.'), { status: 503 });
  const product = productDTO(row);
  const order = await createOrder(client, user, product);
  try {
    return product.kind === 'prime_subscription'
      ? await createPrimeSubscription(client, user, product, order, request)
      : await createTokenCheckout(client, user, product, order, request);
  } catch (error) {
    await client.from('billing_orders').update({ status: 'cancelled', metadata: { error: 'provider_checkout_creation_failed' }, updated_at: new Date().toISOString() }).eq('id', order.id);
    throw error;
  }
}

async function consumeTokens(client, user, body) {
  const amount = Math.max(1, Math.min(100, Number(body?.amount || 2)));
  const { data, error } = await client.rpc('consume_wallet_tokens', { p_user_id: user.id, p_amount: amount, p_event_key: `chat:${user.id}:${crypto.randomUUID()}` });
  if (error) throw error;
  return { consumed: data?.consumed === true, tokenBalance: Number(data?.token_balance || 0), amount };
}

async function getAccountData(client, user) {
  const [{ data: profile, error: profileError }, { data: orders, error: ordersError }, { data: ledger, error: ledgerError }] = await Promise.all([
    client.from('profiles').select('token_balance,prime_status,prime_plan_code,prime_subscription_id,prime_current_period_end').eq('id', user.id).single(),
    client.from('billing_orders').select('id,product_code,title,kind,token_amount,amount_cents,currency,status,provider_payment_id,provider_subscription_id,approved_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(25),
    client.from('wallet_ledger').select('id,entry_type,token_amount,balance_after,description,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(25)
  ]);
  if (profileError) throw profileError;
  if (ordersError) throw ordersError;
  if (ledgerError) throw ledgerError;
  return { wallet: { tokenBalance: Number(profile.token_balance || 0), primeStatus: profile.prime_status, primePlanCode: profile.prime_plan_code, primeSubscriptionId: profile.prime_subscription_id, primeCurrentPeriodEnd: profile.prime_current_period_end }, orders: orders || [], ledger: ledger || [] };
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') { response.setHeader('Allow', 'GET, POST, OPTIONS'); response.status(204).end(); return; }
  if (!['GET', 'POST'].includes(request.method)) { response.setHeader('Allow', 'GET, POST, OPTIONS'); return json(response, 405, { error: 'Método não permitido.' }); }
  try {
    const { client, user } = await requireUser(request);
    if (request.method === 'GET') {
      const query = new URL(request.url, `https://${request.headers?.host || 'localhost'}`).searchParams;
      if (query.get('catalog') === '1') return json(response, 200, { products: await getCatalog(client) });
      return json(response, 200, await getAccountData(client, user));
    }
    if (request.body?.action === 'consume_tokens') return json(response, 200, await consumeTokens(client, user, request.body));
    return json(response, 200, await createCheckout(client, user, request.body || {}, request));
  } catch (error) {
    const status = Number(error?.status) || (error?.message === 'billing_service_not_configured' ? 503 : 500);
    console.error('mercadopago endpoint', { status, message: error?.message, provider: error?.provider ? 'provider_error' : undefined });
    return json(response, status, { error: status >= 500 ? (error?.message || 'Serviço de compras indisponível.') : error.message });
  }
}
