import { requireUser, parseBody, json, cors, httpError } from './_auth.js';

function text(value, max = 180) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeQuota(value) {
  const row = value && typeof value === 'object' ? value : {};
  const primeStatus = text(row.prime_status ?? row.primeStatus, 40) || 'inactive';
  const attachmentsUsed = Math.max(0, Math.min(3, Number(row.attachments_used ?? row.attachmentsUsed) || 0));
  return {
    energy: Math.max(0, Math.min(100, Number(row.energy) || 0)),
    resetAt: row.reset_at || row.resetAt || new Date(Date.now() + 86400000).toISOString(),
    tokenBalance: Math.max(0, Number(row.token_balance ?? row.tokenBalance) || 0),
    primeStatus,
    attachmentsUsed,
    attachmentsRemaining: primeStatus === 'active' ? 999999 : Math.max(0, 3 - attachmentsUsed)
  };
}

export default async function handler(request, response) {
  cors(response);
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  try {
    const { client, admin, user } = await requireUser(request);
    if (request.method === 'GET') {
      const { data, error } = await client.rpc('get_user_quota');
      if (error) throw error;
      return json(response, 200, { quota: normalizeQuota(data) });
    }
    if (request.method !== 'POST') return json(response, 405, { error: 'Método não permitido.' });
    const body = parseBody(request);
    const action = text(body.action, 40);
    const eventKey = text(body.eventKey, 180);
    if (action === 'consume_artifact' || action === 'refund_artifact') {
      if (eventKey.length < 8) throw httpError(400, 'Consumo inválido.');
      const rpcName = action === 'consume_artifact' ? 'consume_user_energy' : 'refund_user_energy';
      const { data, error } = await client.rpc(rpcName, { p_amount: 15, p_event_key: `artifact:${eventKey}` });
      if (error) throw error;
      return json(response, 200, { result: normalizeQuota(data), consumed: data?.consumed === true, refunded: data?.refunded === true, alreadyProcessed: data?.already_processed === true, artifactCharged: action === 'consume_artifact', artifactRefunded: action === 'refund_artifact' });
    }
    const amount = Number(body.amount);
    const maxAmount = action === 'consume_attachments' ? 3 : 100;
    if (!Number.isInteger(amount) || amount <= 0 || amount > maxAmount || eventKey.length < 8) throw httpError(400, 'Consumo inválido.');
    if (action === 'consume_tokens') {
      const { data, error } = await admin.rpc('consume_wallet_tokens', { p_user_id: user.id, p_amount: amount, p_event_key: eventKey });
      if (error) throw error;
      const quota = await client.rpc('get_user_quota');
      if (quota.error) throw quota.error;
      return json(response, 200, { result: normalizeQuota({ ...(quota.data || {}), token_balance: data?.token_balance }), consumed: data?.consumed === true, alreadyProcessed: data?.already_processed === true });
    }
    if (action === 'consume_attachments') {
      const { data, error } = await client.rpc('consume_user_attachments', { p_amount: amount, p_event_key: eventKey });
      if (error) throw error;
      const quota = await client.rpc('get_user_quota');
      if (quota.error) throw quota.error;
      return json(response, 200, { result: normalizeQuota(quota.data), consumed: data?.consumed === true, alreadyProcessed: data?.already_processed === true });
    }
    if (action === 'refund') {
      const { data, error } = await client.rpc('refund_user_energy', { p_amount: amount, p_event_key: eventKey });
      if (error) throw error;
      const quota = await client.rpc('get_user_quota');
      if (quota.error) throw quota.error;
      return json(response, 200, { result: normalizeQuota(quota.data), refunded: data?.refunded === true, alreadyProcessed: data?.already_processed === true });
    }
    if (action !== 'consume') throw httpError(400, 'Ação de quota desconhecida.');
    const { data, error } = await client.rpc('consume_user_energy', { p_amount: amount, p_event_key: eventKey });
    if (error) throw error;
    return json(response, 200, { result: normalizeQuota(data), consumed: data?.consumed === true, alreadyProcessed: data?.already_processed === true });
  } catch (error) {
    const status = Number(error?.status) || 500;
    json(response, status, { error: status === 500 ? 'Não foi possível atualizar sua energia agora.' : error.message });
  }
}
