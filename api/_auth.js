import { createClient } from '@supabase/supabase-js';

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('sb_publishable_')) throw httpError(503, 'Serviço de conta indisponível.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function bearer(request) {
  const value = request.headers?.authorization || request.headers?.Authorization || '';
  return String(value).replace(/^Bearer\s+/i, '').trim();
}

export async function requireUser(request) {
  const token = bearer(request);
  if (!token) throw httpError(401, 'Não autenticado.');
  const admin = serviceClient();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw httpError(401, 'Sessão inválida.');
  const userKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userClient = createClient(process.env.SUPABASE_URL, userKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  return { client: userClient, admin, user, token };
}

export function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { throw httpError(400, 'Solicitação inválida.'); }
  }
  return request.body;
}

export function json(response, status, body) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(status).json(body);
}

export function cors(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}
