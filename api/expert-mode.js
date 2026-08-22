import { requireUser, parseBody, json, cors, httpError } from './_auth.js';

function text(value, max = 180) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function normalizeQuota(value) {
  const row = value && typeof value === 'object' ? value : {};
  const used = Math.max(0, Math.min(3, Number(row.used) || 0));
  const remaining = Math.max(0, Math.min(3, Number(row.remaining ?? 3 - used) || 0));
  return {
    limit: 3,
    used,
    remaining,
    windowHours: 48,
    nextAvailableAt: row.nextAvailableAt || row.next_available_at || null
  };
}

export default async function handler(request, response) {
  cors(response);
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  try {
    const { client } = await requireUser(request);
    if (request.method === 'GET') {
      const { data, error } = await client.rpc('get_expert_mode_quota');
      if (error) throw error;
      return json(response, 200, { quota: normalizeQuota(data) });
    }
    if (request.method !== 'POST') return json(response, 405, { error: 'Método não permitido.' });
    const body = parseBody(request);
    if (text(body.action, 40) !== 'consume') throw httpError(400, 'Ação Especialista inválida.');
    const eventKey = text(body.eventKey, 180);
    if (eventKey.length < 8) throw httpError(400, 'Evento Especialista inválido.');
    const { data, error } = await client.rpc('consume_expert_mode', { p_event_key: eventKey });
    if (error) throw error;
    return json(response, 200, { quota: normalizeQuota(data), allowed: data?.allowed === true, consumed: data?.consumed === true, alreadyProcessed: data?.alreadyProcessed === true });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(response, status, { error: status === 500 ? 'Não foi possível verificar o Modo Especialista agora.' : error.message });
  }
}
