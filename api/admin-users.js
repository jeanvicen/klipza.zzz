import { createClient } from '@supabase/supabase-js';

const ALLOWED_ACTIONS = new Set(['block', 'unblock', 'restrict', 'unrestrict', 'delete', 'reset_password', 'cancel_deletion']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('sb_publishable_')) throw new Error('admin_service_not_configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function bearer(request) {
  const value = request.headers?.authorization || request.headers?.Authorization || '';
  return String(value).replace(/^Bearer\s+/i, '').trim();
}

async function requireAdmin(request) {
  const client = serviceClient();
  const token = bearer(request);
  if (!token) return { client, error: { status: 401, message: 'Não autenticado.' } };
  const { data: { user }, error: userError } = await client.auth.getUser(token);
  if (userError || !user) return { client, error: { status: 401, message: 'Sessão inválida.' } };
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('is_admin,status')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile?.is_admin || profile.status === 'blocked') {
    return { client, error: { status: 403, message: 'Acesso administrativo não autorizado.' } };
  }
  return { client, admin: user };
}

function json(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(status).json(body);
}

function cleanReason(value) {
  return String(value || '').trim().slice(0, 500) || null;
}

async function audit(client, adminId, targetId, action, reason, metadata = {}) {
  const { error } = await client.from('admin_audit_log').insert({
    admin_id: adminId,
    target_user_id: targetId,
    action,
    reason,
    metadata
  });
  if (error) throw error;
}

async function listUsers(client, request) {
  const page = Math.max(1, Number(request.query?.page || 1));
  const perPage = Math.min(100, Math.max(1, Number(request.query?.perPage || 50)));
  const { data, error } = await client.auth.admin.listUsers({ page, perPage });
  if (error) throw error;
  const users = data.users || [];
  const ids = users.map((user) => user.id);
  const { data: profiles, error: profileError } = ids.length
    ? await client.from('profiles').select('id,display_name,status,restricted,restriction_reason,last_activity_at,deletion_scheduled_for,is_admin').in('id', ids)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const byId = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return users.map((user) => ({
    id: user.id,
    email: user.email || null,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at || null,
    confirmed_at: user.confirmed_at || null,
    profile: byId.get(user.id) || null
  }));
}

async function performAction(client, admin, body) {
  const action = String(body?.action || '').trim();
  const targetId = String(body?.userId || '').trim();
  const reason = cleanReason(body?.reason);
  if (!ALLOWED_ACTIONS.has(action)) throw Object.assign(new Error('Ação administrativa inválida.'), { status: 400 });
  if (!UUID_RE.test(targetId)) throw Object.assign(new Error('Usuário inválido.'), { status: 400 });
  if (targetId === admin.id && ['block', 'delete', 'reset_password'].includes(action)) {
    throw Object.assign(new Error('Não é permitido executar esta ação na própria conta.'), { status: 400 });
  }
  if (['block', 'restrict', 'delete', 'reset_password'].includes(action) && !reason) {
    throw Object.assign(new Error('Informe o motivo da ação.'), { status: 400 });
  }

  if (action === 'delete') {
    await audit(client, admin.id, targetId, action, reason, { source: 'admin_panel' });
    const { error } = await client.auth.admin.deleteUser(targetId, false);
    if (error) throw error;
    return { action, deleted: true };
  }

  if (action === 'reset_password') {
    const password = String(body?.newPassword || '');
    if (password.length < 12) throw Object.assign(new Error('A senha temporária precisa ter pelo menos 12 caracteres.'), { status: 400 });
    const { error } = await client.auth.admin.updateUserById(targetId, { password });
    if (error) throw error;
    await audit(client, admin.id, targetId, action, reason, { source: 'admin_panel', password_changed: true });
    return { action, passwordChanged: true };
  }

  const profilePatch = {
    block: { status: 'blocked', blocked_reason: reason },
    unblock: { status: 'active', blocked_reason: null },
    restrict: { restricted: true, restriction_reason: reason },
    unrestrict: { restricted: false, restriction_reason: null },
    cancel_deletion: { status: 'active', deletion_requested_at: null, deletion_scheduled_for: null }
  }[action];
  if (action === 'cancel_deletion') {
    const { error } = await client.from('account_deletions').update({ status: 'cancelled', processed_at: new Date().toISOString() }).eq('user_id', targetId).eq('status', 'pending');
    if (error) throw error;
  }
  const { error: profileError } = await client.from('profiles').update(profilePatch).eq('id', targetId);
  if (profileError) throw profileError;
  await audit(client, admin.id, targetId, action, reason, { source: 'admin_panel' });
  return { action, updated: true };
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.setHeader('Allow', 'GET, POST, OPTIONS');
    response.status(204).end();
    return;
  }
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST, OPTIONS');
    json(response, 405, { error: 'Método não permitido.' });
    return;
  }
  try {
    const { client, admin, error } = await requireAdmin(request);
    if (error) return json(response, error.status, { error: error.message });
    if (request.method === 'GET') return json(response, 200, { users: await listUsers(client, request) });
    return json(response, 200, await performAction(client, admin, request.body || {}));
  } catch (error) {
    const status = Number(error?.status) || (error?.message === 'admin_service_not_configured' ? 503 : 500);
    json(response, status, { error: status === 500 ? 'Não foi possível concluir a operação administrativa.' : error.message });
  }
}
