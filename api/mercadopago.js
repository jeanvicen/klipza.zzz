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

function paymentStatus(value) {
  return ({
    approved: 'approved',
    pending: 'pending',
    in_process: 'pending',
    in_mediation: 'pending',
    rejected: 'rejected',
    cancelled: 'cancelled',
    refunded: 'refunded',
    charged_back: 'charged_back'
  })[value] || 'pending';
}

function idempotencyKey(request) {
  const headerValue = request.headers?.['x-idempotency-key'] || request.headers?.['X-Idempotency-Key'];
  const value = String(headerValue || '').trim();
  if (!UUID_RE.test(value)) {
    throw Object.assign(new Error('Envie um X-Idempotency-Key UUID para evitar pagamentos duplicados.'), { status: 400 });
  }
  return value;
}

function paymentMethodId(body) {
  const value = String(body?.paymentMethodId || body?.payment_method_id || '').trim();
  if (!/^[a-z0-9_-]{2,40}$/i.test(value)) {
    throw Object.assign(new Error('Meio de pagamento inválido.'), { status: 400 });
  }
  return value;
}

function payerDTO(user, body) {
  const payer = body?.payer && typeof body.payer === 'object' ? body.payer : {};
  const email = String(payer.email || user.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('O comprador precisa ter um e-mail válido.'), { status: 400 });
  }
  const result = { email };
  for (const field of ['first_name', 'last_name']) {
    const value = String(payer[field] || '').trim().slice(0, 80);
    if (value) result[field] = value;
  }
  if (payer.identification && typeof payer.identification === 'object') {
    const type = String(payer.identification.type || '').trim().slice(0, 20);
    const number = String(payer.identification.number || '').replace(/\D/g, '').slice(0, 20);
    if (type && number) result.identification = { type, number };
  }
  return result;
}

function directPaymentBody(body, user, product, order, request) {
  const method = paymentMethodId(body);
  const payer = payerDTO(user, body);
  const payload = {
    transaction_amount: amountNumber(product.amountCents),
    description: product.title,
    payment_method_id: method,
    payer,
    external_reference: order.external_reference,
    notification_url: `${publicOrigin(request)}/api/mercadopago-webhook`,
    metadata: { order_id: order.id, user_id: user.id, product_code: product.code }
  };

  if (method === 'pix') return payload;
  if (method === 'bolbradesco') {
    if (!payer.identification?.number) throw Object.assign(new Error('Informe o documento do comprador para gerar o boleto.'), { status: 400 });
    return payload;
  }

  const token = String(body?.token || body?.cardToken || '').trim();
  if (!token || token.length > 500) {
    throw Object.assign(new Error('Token de cartão inválido. Gere o token no frontend com o SDK do Mercado Pago.'), { status: 400 });
  }
  const installments = Number(body?.installments || 1);
  if (!Number.isInteger(installments) || installments < 1 || installments > 24) {
    throw Object.assign(new Error('Parcelas inválidas. Use um número inteiro entre 1 e 24.'), { status: 400 });
  }
  payload.token = token;
  payload.installments = installments;
  const issuerId = String(body?.issuerId || body?.issuer_id || '').trim();
  if (issuerId) {
    if (!/^\d{1,20}$/.test(issuerId)) throw Object.assign(new Error('Emissor do cartão inválido.'), { status: 400 });
    payload.issuer_id = Number(issuerId);
  }
  return payload;
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

async function createOrder(client, user, product, requestedIdempotencyKey = '') {
  const idempotencyKey = requestedIdempotencyKey || randomKey();
  const values = {
    user_id: user.id,
    product_code: product.code,
    kind: product.kind,
    title: product.title,
    token_amount: product.tokenAmount,
    amount_cents: product.amountCents,
    currency: product.currency,
    idempotency_key: idempotencyKey,
    external_reference: `klipza_${crypto.randomUUID()}`
  };
  const select = 'id,external_reference,idempotency_key,product_code,kind,title,token_amount,amount_cents,currency,status,provider_payment_id';
  const { data, error } = await client.from('billing_orders').insert(values).select(select).single();
  if (!error) return data;
  if (error.code !== '23505') throw error;

  const { data: existing, error: lookupError } = await client
    .from('billing_orders')
    .select(select)
    .eq('user_id', user.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw error;
  if (existing.product_code !== product.code || Number(existing.amount_cents) !== Number(product.amountCents)) {
    throw Object.assign(new Error('A chave de idempotência já foi usada em outro pedido.'), { status: 409 });
  }
  return existing;
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

function paymentResponseDTO(payment, order, product) {
  const transactionData = payment?.point_of_interaction?.transaction_data || {};
  return {
    orderId: order.id,
    paymentId: String(payment?.id || order.provider_payment_id || ''),
    status: paymentStatus(payment?.status || order.status),
    providerStatus: payment?.status || null,
    statusDetail: payment?.status_detail || null,
    paymentMethodId: payment?.payment_method_id || null,
    transactionAmount: Number(payment?.transaction_amount || amountNumber(product.amountCents)),
    currency: product.currency,
    qrCode: transactionData.qr_code || null,
    qrCodeBase64: transactionData.qr_code_base64 || null,
    ticketUrl: payment?.transaction_details?.external_resource_url || null,
    product: productDTO(product)
  };
}

async function createDirectPayment(client, user, body, request) {
  const productCode = cleanCode(body?.productCode);
  if (!productCode) throw Object.assign(new Error('Informe o produto do pagamento.'), { status: 400 });
  const { data: row, error } = await client
    .from('billing_products')
    .select('code,kind,title,description,token_amount,amount_cents,currency,interval_months,sort_order')
    .eq('code', productCode)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  if (!row || !row.amount_cents || Number(row.amount_cents) <= 0) {
    throw Object.assign(new Error('Este produto ainda não está configurado para pagamento direto.'), { status: 503 });
  }
  const product = productDTO(row);
  if (product.kind !== 'token_pack') {
    throw Object.assign(new Error('Assinaturas devem ser criadas pelo fluxo de assinatura do Klipza.Prime.'), { status: 400 });
  }

  const key = idempotencyKey(request);
  const order = await createOrder(client, user, product, key);
  if (order.provider_payment_id) return paymentResponseDTO({ id: order.provider_payment_id, status: order.status }, order, product);

  const payload = directPaymentBody(body, user, product, order, request);
  const payment = await mpFetch('/v1/payments', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': key },
    body: JSON.stringify(payload)
  });
  const { error: updateError } = await client.from('billing_orders').update({
    provider_payment_id: String(payment?.id || ''),
    metadata: {
      payment_method_id: payment?.payment_method_id || payload.payment_method_id,
      provider_status: payment?.status || null,
      status_detail: payment?.status_detail || null,
      direct_payment: true
    },
    updated_at: new Date().toISOString()
  }).eq('id', order.id);
  if (updateError) throw updateError;
  return paymentResponseDTO(payment, { ...order, provider_payment_id: String(payment?.id || '') }, product);
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
    if (request.body?.action === 'create_payment') return json(response, 201, await createDirectPayment(client, user, request.body, request));
    return json(response, 200, await createCheckout(client, user, request.body || {}, request));
  } catch (error) {
    const status = Number(error?.status) || (error?.message === 'billing_service_not_configured' ? 503 : 500);
    console.error('mercadopago endpoint', { status, message: error?.message, provider: error?.provider ? 'provider_error' : undefined });
    return json(response, status, { error: status >= 500 ? (error?.message || 'Serviço de compras indisponível.') : error.message });
  }
}

export { directPaymentBody, idempotencyKey, paymentResponseDTO, paymentStatus };
