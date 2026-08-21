import { cors, httpError, json, parseBody, requireUser } from './_auth.js';

const MAX_CONTENT = 1200;
const MAX_KEY = 180;
const MAX_IMPORT = 500;
const ALLOWED_KINDS = new Set(['profile', 'preference', 'instruction', 'project', 'fact', 'temporary']);
const ALLOWED_RETENTION = new Set(['permanent', 'standard', 'temporary']);
const ALLOWED_CAPTURE = new Set(['suggested', 'automatic', 'disabled']);

function clean(value, max) {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function boundedInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

function boundedConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.75;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function listMemories(client, userId) {
  const { data, error } = await client.from('user_memories')
    .select('id,memory_key,content,kind,priority,retention_class,source,confidence,last_used_at,last_confirmed_at,expires_at,created_at,updated_at')
    .eq('user_id', userId).is('archived_at', null)
    .order('priority', { ascending: false }).order('updated_at', { ascending: false }).limit(5000);
  if (error) throw error;
  return data || [];
}

async function listNotifications(client, userId) {
  const { data, error } = await client.from('user_notifications')
    .select('id,notification_type,title,body,metadata,read_at,created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data || [];
}

async function listBackups(client, userId) {
  const { data, error } = await client.from('user_data_backups')
    .select('id,backup_kind,schema_version,checksum,created_at,restored_at,expires_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data || [];
}

async function readSettings(client, userId) {
  const { data, error } = await client.from('user_memory_settings')
    .select('memory_enabled,capture_mode,max_memories,inactivity_notifications,created_at,updated_at')
    .eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data || { memory_enabled: true, capture_mode: 'suggested', max_memories: 200, inactivity_notifications: true };
}

async function upsertMemory(client, userId, body) {
  const key = clean(body?.memoryKey, MAX_KEY).toLowerCase();
  const content = clean(body?.content, MAX_CONTENT);
  if (!key || !content) throw httpError(400, 'Informe o título e o conteúdo da memória.');
  if (String(body?.content || '').length > MAX_CONTENT || String(body?.memoryKey || '').length > MAX_KEY) throw httpError(400, 'A memória excede o tamanho permitido.');
  const { data, error } = await client.rpc('upsert_user_memory', {
    p_memory_key: key,
    p_content: content,
    p_kind: ALLOWED_KINDS.has(body?.kind) ? body.kind : 'fact',
    p_priority: boundedInt(body?.priority, 0, 100, 50),
    p_retention_class: ALLOWED_RETENTION.has(body?.retentionClass) ? body.retentionClass : 'standard',
    p_source: body?.source === 'user' || body?.source === 'import' ? body.source : 'user',
    p_confidence: boundedConfidence(body?.confidence),
    p_expires_at: body?.retentionClass === 'temporary' ? isoOrNull(body?.expiresAt) : null
  });
  if (error) throw error;
  return data;
}

async function importMemories(client, userId, body) {
  const items = Array.isArray(body?.memories) ? body.memories.slice(0, MAX_IMPORT) : [];
  if (!items.length) throw httpError(400, 'Nenhuma memória válida foi enviada.');
  let imported = 0;
  for (const item of items) {
    await upsertMemory(client, userId, { ...item, source: 'import' });
    imported += 1;
  }
  await client.rpc('prune_user_memories', { p_user_id: userId, p_max: null });
  return { imported };
}

async function updateSettings(client, userId, body) {
  const patch = {
    user_id: userId,
    memory_enabled: body?.memoryEnabled !== false,
    capture_mode: ALLOWED_CAPTURE.has(body?.captureMode) ? body.captureMode : 'suggested',
    max_memories: boundedInt(body?.maxMemories, 20, 5000, 200),
    inactivity_notifications: body?.inactivityNotifications !== false,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await client.from('user_memory_settings').upsert(patch, { onConflict: 'user_id' }).select('memory_enabled,capture_mode,max_memories,inactivity_notifications,created_at,updated_at').single();
  if (error) throw error;
  await client.rpc('prune_user_memories', { p_user_id: userId, p_max: patch.max_memories });
  return data;
}

async function createBackup(client, userId, kind) {
  const backupKind = kind === 'snapshot' ? 'snapshot' : 'export';
  const { data: backupId, error: backupError } = await client.rpc('create_user_data_backup', { p_backup_kind: backupKind, p_reason: backupKind === 'export' ? 'user_export' : 'user_snapshot' });
  if (backupError) throw backupError;
  const { data, error } = await client.from('user_data_backups').select('id,backup_kind,schema_version,payload,checksum,created_at,restored_at,expires_at').eq('id', backupId).eq('user_id', userId).single();
  if (error) throw error;
  return data;
}

async function restoreBackup(client, userId, backupId) {
  const id = clean(backupId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw httpError(400, 'Backup inválido.');
  const { data, error } = await client.rpc('restore_user_data_backup', { p_backup_id: id });
  if (error) throw error;
  return { restored: Number(data) || 0 };
}

async function markNotificationRead(client, userId, id) {
  const notificationId = clean(id, 80);
  if (!/^[0-9a-f-]{36}$/i.test(notificationId)) throw httpError(400, 'Notificação inválida.');
  const { error } = await client.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId).eq('user_id', userId);
  if (error) throw error;
  return { marked: true };
}

async function deleteMemory(client, userId, id) {
  const memoryId = clean(id, 80);
  if (!/^[0-9a-f-]{36}$/i.test(memoryId)) throw httpError(400, 'Memória inválida.');
  const { error } = await client.from('user_memories').delete().eq('id', memoryId).eq('user_id', userId);
  if (error) throw error;
  return { deleted: true };
}

export default async function handler(request, response) {
  cors(response);
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  if (!['GET', 'POST'].includes(request.method)) { json(response, 405, { error: 'Método não permitido.' }); return; }
  try {
    const { client, user } = await requireUser(request);
    if (request.method === 'GET') {
      const view = String(request.query?.view || 'all');
      if (view === 'memories') return json(response, 200, { memories: await listMemories(client, user.id), settings: await readSettings(client, user.id) });
      if (view === 'notifications') return json(response, 200, { notifications: await listNotifications(client, user.id) });
      if (view === 'backups') return json(response, 200, { backups: await listBackups(client, user.id) });
      return json(response, 200, { memories: await listMemories(client, user.id), settings: await readSettings(client, user.id), notifications: await listNotifications(client, user.id), backups: await listBackups(client, user.id) });
    }
    const body = parseBody(request);
    const action = String(body?.action || '').trim();
    if (action === 'upsert') return json(response, 200, { memory: await upsertMemory(client, user.id, body) });
    if (action === 'import') return json(response, 200, await importMemories(client, user.id, body));
    if (action === 'settings') return json(response, 200, { settings: await updateSettings(client, user.id, body) });
    if (action === 'backup') return json(response, 200, { backup: await createBackup(client, user.id, body.kind) });
    if (action === 'restore') return json(response, 200, await restoreBackup(client, user.id, body.backupId));
    if (action === 'read_notification') return json(response, 200, await markNotificationRead(client, user.id, body.notificationId));
    if (action === 'delete') return json(response, 200, await deleteMemory(client, user.id, body.memoryId));
    throw httpError(400, 'Ação de memória inválida.');
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('memory_request_failed', error?.message || error);
    json(response, status, { error: status === 500 ? 'Não foi possível concluir a operação de memória.' : error.message });
  }
}
