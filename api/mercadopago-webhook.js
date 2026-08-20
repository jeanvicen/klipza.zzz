import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MP_API = 'https://api.mercadopago.com';

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('sb_publishable_')) throw new Error('billing_service_not_configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function header(request, name) { return request.headers?.[name] || request.headers?.[name.toLowerCase()] || request.headers?.[name.toUpperCase()] || ''; }
function responseJson(response, status, body) { response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.status(status).json(body); }
function accessToken() { const token = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''; if (!token || token.includes('<ENV_ACCESS_TOKEN>')) throw new Error('mp_access_token_not_configured'); return token; }
function webhookSecret() { const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || ''; if (!secret) throw new Error('mp_webhook_secret_not_configured'); return secret; }

function timingSafeHexEqual(actual, expected) {
  const a = Buffer.from(String(actual || ''), 'hex');
  const b = Buffer.from(String(expected || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySignature(request, dataId) {
  const signature = String(header(request, 'x-signature') || '');
  const requestId = String(header(request, 'x-request-id') || '');
  const values = Object.fromEntries(signature.split(',').map(part => part.trim().split('=').map(value => value.trim())).filter(pair => pair.length === 2));
  const ts = values.ts;
  const v1 = values.v1;
  if (!ts || !v1 || !dataId || !requestId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const digest = crypto.createHmac('sha256', webhookSecret()).update(manifest).digest('hex');
  return timingSafeHexEqual(v1, digest);
}

async function mpGet(path) {
  const result = await fetch(`${MP_API}${path}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken()}` } });
  const text = await result.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!result.ok) throw new Error(`Mercado Pago consult failed ${result.status}`);
  return data;
}

function statusFromPayment(value) {
  return ({ approved: 'approved', pending: 'pending', in_process: 'pending', in_mediation: 'pending', rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'charged_back' })[value] || 'pending';
}

async function processPayment(db, payload, query) {
  const paymentId = String(payload?.data?.id || query.get('data.id') || query.get('id') || '').trim();
  if (!/^\d+$/.test(paymentId)) return { ignored: true, reason: 'missing_payment_id' };
  const payment = await mpGet(`/v1/payments/${encodeURIComponent(paymentId)}`);
  const externalReference = String(payment?.external_reference || payment?.metadata?.external_reference || '').trim();
  let order = null;
  if (externalReference) {
    const { data } = await db.from('billing_orders').select('id,status,kind,external_reference,provider_subscription_id').eq('external_reference', externalReference).maybeSingle();
    order = data;
  }
  if (!order && payment?.metadata?.order_id) {
    const { data } = await db.from('billing_orders').select('id,status,kind,external_reference,provider_subscription_id').eq('id', String(payment.metadata.order_id)).maybeSingle();
    order = data;
  }
  if (!order && payment?.preapproval_id) {
    const { data } = await db.from('billing_orders').select('id,status,kind,external_reference,provider_subscription_id').eq('provider_subscription_id', String(payment.preapproval_id)).maybeSingle();
    order = data;
  }
  if (!order) return { ignored: true, reason: 'order_not_found', paymentId };
  const paymentStatus = statusFromPayment(payment.status);
  if (paymentStatus === 'approved' && order.kind === 'token_pack') {
    const { error } = await db.rpc('apply_billing_approval', { p_order_id: order.id, p_provider_payment_id: paymentId, p_event_key: `mp_payment:${paymentId}:approved`, p_paid_amount_cents: Math.round(Number(payment.transaction_amount || 0) * 100) });
    if (error) throw error;
  } else if (paymentStatus === 'approved' && order.kind === 'prime_subscription') {
    const subscriptionId = String(payment?.preapproval_id || payment?.metadata?.preapproval_id || order.provider_subscription_id || '').trim();
    if (!subscriptionId) return { ignored: true, reason: 'prime_subscription_id_missing', paymentId, orderId: order.id };
    const { error } = await db.rpc('apply_prime_activation', { p_order_id: order.id, p_provider_subscription_id: subscriptionId, p_event_key: `mp_payment:${paymentId}`, p_status: 'active', p_current_period_end: null });
    if (error) throw error;
  } else {
    const { error } = await db.from('billing_orders').update({ status: paymentStatus, provider_payment_id: paymentId, updated_at: new Date().toISOString(), metadata: { provider_status: payment.status, status_detail: payment.status_detail || null } }).eq('id', order.id).neq('status', 'approved');
    if (error) throw error;
  }
  return { processed: true, paymentId, status: payment.status, orderId: order.id };
}

async function processSubscription(db, payload, query, providerEventId) {
  const subscriptionId = String(payload?.data?.id || query.get('data.id') || query.get('id') || '').trim();
  if (!subscriptionId) return { ignored: true, reason: 'missing_subscription_id' };
  const subscription = await mpGet(`/preapproval/${encodeURIComponent(subscriptionId)}`);
  const reference = String(subscription?.external_reference || subscription?.metadata?.external_reference || '').trim();
  let order = null;
  if (reference) {
    const { data } = await db.from('billing_orders').select('id,kind,external_reference').eq('external_reference', reference).maybeSingle();
    order = data;
  }
  if (!order && subscription?.metadata?.order_id) {
    const { data } = await db.from('billing_orders').select('id,kind,external_reference').eq('id', String(subscription.metadata.order_id)).maybeSingle();
    order = data;
  }
  if (!order) {
    const { data } = await db.from('billing_orders').select('id,kind,external_reference').eq('provider_subscription_id', subscriptionId).maybeSingle();
    order = data;
  }
  if (!order || order.kind !== 'prime_subscription') return { ignored: true, reason: 'prime_order_not_found', subscriptionId };
  const status = String(subscription.status || 'pending');
  const periodEnd = subscription?.next_payment_date || subscription?.auto_recurring?.end_date || null;
  const { error } = await db.rpc('apply_prime_activation', { p_order_id: order.id, p_provider_subscription_id: subscriptionId, p_event_key: `mp_subscription:${subscriptionId}:${providerEventId}`, p_status: status, p_current_period_end: periodEnd });
  if (error) throw error;
  return { processed: true, subscriptionId, status, orderId: order.id };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return responseJson(response, 405, { error: 'Método não permitido.' }); }
  try {
    const payload = request.body || {};
    const query = new URL(request.url, `https://${request.headers?.host || 'localhost'}`).searchParams;
    const dataId = String(payload?.data?.id || query.get('data.id') || query.get('id') || '').trim();
    if (!verifySignature(request, dataId)) return responseJson(response, 401, { error: 'Assinatura inválida.' });
    const eventType = String(payload?.type || payload?.topic || query.get('type') || query.get('topic') || '').trim();
    const providerEventId = String(payload?.id || `${eventType}:${dataId}:${payload?.action || 'event'}`).slice(0, 200);
    const db = client();
    const { data: inserted, error: insertError } = await db.from('billing_provider_events').insert({ provider: 'mercadopago', provider_event_id: providerEventId, event_type: eventType || 'unknown', payload }).select('id').maybeSingle();
    if (insertError && insertError.code !== '23505') throw insertError;
    if (!inserted && insertError?.code === '23505') return responseJson(response, 200, { received: true, duplicate: true });
    let result = { ignored: true, reason: 'unsupported_event' };
    if (eventType === 'payment') result = await processPayment(db, payload, query);
    else if (eventType === 'subscription_preapproval' || eventType === 'preapproval') result = await processSubscription(db, payload, query, providerEventId);
    const { error: updateError } = await db.from('billing_provider_events').update({ status: result.ignored ? 'ignored' : 'processed', processed_at: new Date().toISOString() }).eq('provider_event_id', providerEventId).eq('provider', 'mercadopago');
    if (updateError) throw updateError;
    return responseJson(response, 200, { received: true, ...result });
  } catch (error) {
    console.error('mercadopago webhook', { message: error?.message });
    const status = error?.message === 'mp_webhook_secret_not_configured' || error?.message === 'mp_access_token_not_configured' || error?.message === 'billing_service_not_configured' ? 503 : 500;
    return responseJson(response, status, { error: status === 503 ? 'Webhook de pagamentos ainda não configurado.' : 'Não foi possível processar a notificação.' });
  }
}
