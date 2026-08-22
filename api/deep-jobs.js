import { requireUser, serviceClient, parseBody, json, cors, httpError } from './_auth.js';
import { processAiRequest } from './ai.js';

const MAX_MESSAGE_LENGTH = 12000;
const MAX_HISTORY_ITEMS = 16;

function text(value, max = MAX_MESSAGE_LENGTH) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function safeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY_ITEMS).map((item) => ({
    role: item?.role === 'ai' || item?.role === 'assistant' ? 'assistant' : 'user',
    content: text(item?.content, 5000)
  })).filter((item) => item.content);
}

function safeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    chatId: row.chat_id,
    messageId: row.message_id,
    status: row.status,
    complexity: row.complexity,
    progress: row.progress || {},
    result: row.status === 'completed' ? (row.result || {}) : {},
    errorMessage: row.status === 'failed' ? row.error_message || 'Não foi possível concluir a resposta.' : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    deliveredAt: row.delivered_at
  };
}

export default async function handler(request, response) {
  cors(response);
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  try {
    const { client, user } = await requireUser(request);
    if (request.method === 'GET') {
      const chatId = text(request.query?.chatId || '', 140);
      let query = client.from('deep_jobs').select('id,chat_id,message_id,status,complexity,progress,result,error_message,created_at,updated_at,started_at,completed_at,delivered_at').eq('user_id', user.id).in('status', ['queued', 'processing', 'completed', 'failed']).is('delivered_at', null).order('created_at', { ascending: false }).limit(25);
      if (chatId) query = query.eq('chat_id', chatId);
      const { data, error } = await query;
      if (error) throw error;
      return json(response, 200, { jobs: (data || []).map(safeJob) });
    }
    if (request.method !== 'POST') return json(response, 405, { error: 'Método não permitido.' });
    const body = parseBody(request);
    const action = body.action || 'create';
    if (action === 'start') {
      const jobId = text(body.jobId, 80);
      if (!jobId) throw httpError(400, 'Tarefa inválida.');
      const { data: queued, error: readError } = await client.from('deep_jobs').select('id,user_id,chat_id,message_id,message,history,provider,complexity,progress,status,attempt_count,started_at,mode').eq('id', jobId).eq('user_id', user.id).eq('status', 'queued').maybeSingle();
      if (readError) throw readError;
      if (!queued) return json(response, 200, { started: false });
      const now = new Date().toISOString();
      const { data: claimed, error: claimError } = await client.from('deep_jobs').update({ status: 'processing', started_at: now, attempt_count: Number(queued.attempt_count || 0) + 1, progress: { ...(queued.progress || {}), phase: 'thinking', pass: 0, label: 'Klipza está respondendo em segundo plano.' } }).eq('id', jobId).eq('user_id', user.id).eq('status', 'queued').select('id,user_id,chat_id,message_id,message,history,provider,complexity,progress,attempt_count,mode').maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json(response, 200, { started: false });
      const admin = serviceClient();
      const onProgress = async (progress) => { await admin.from('deep_jobs').update({ progress: { ...(claimed.progress || {}), ...progress } }).eq('id', jobId).eq('status', 'processing'); };
      try {
        const result = await processAiRequest({ user, client: admin, memoryClient: client, body: { message: claimed.message, history: claimed.history || [], provider: claimed.provider || 'auto', thinkingMode: 'deep' }, onProgress });
        await admin.from('deep_jobs').update({ status: 'completed', progress: { ...(claimed.progress || {}), phase: 'completed', pass: result.thinking?.passes || 2, totalPasses: result.thinking?.passes || 2, label: 'Klipza terminou a resposta.', updates: result.thinking?.updates || [] }, result, completed_at: new Date().toISOString(), error_message: null }).eq('id', jobId).eq('status', 'processing');
        await admin.from('user_notifications').insert({ user_id: user.id, notification_type: 'ai_response_complete', title: 'Klipza terminou a resposta', body: 'Sua resposta do Pensamento profundo está pronta.', metadata: { job_id: jobId, chat_id: claimed.chat_id, message_id: claimed.message_id } });
        return json(response, 200, { started: true, status: 'completed' });
      } catch (error) {
        await admin.from('deep_jobs').update({ status: 'failed', error_message: String(error?.message || 'Falha no processamento.').slice(0, 500), progress: { ...(claimed.progress || {}), phase: 'failed', label: 'Não foi possível concluir esta resposta.' }, completed_at: new Date().toISOString() }).eq('id', jobId).eq('status', 'processing');
        await admin.from('user_notifications').insert({ user_id: user.id, notification_type: 'ai_response_complete', title: 'A resposta não foi concluída', body: 'O Klipza não conseguiu terminar esta resposta. Tente novamente.', metadata: { job_id: jobId, chat_id: claimed.chat_id, message_id: claimed.message_id, failed: true } });
        return json(response, 200, { started: true, status: 'failed' });
      }
    }
    if (action === 'ack') {
      const jobId = text(body.jobId, 80);
      if (!jobId) throw httpError(400, 'Tarefa inválida.');
      const { data, error } = await client.from('deep_jobs').update({ delivered_at: new Date().toISOString() }).eq('id', jobId).eq('user_id', user.id).in('status', ['completed', 'failed', 'canceled']).select('id,chat_id,message_id,status,complexity,progress,result,error_message,created_at,updated_at,started_at,completed_at,delivered_at').maybeSingle();
      if (error) throw error;
      return json(response, 200, { job: safeJob(data) });
    }
    if (action === 'cancel') {
      const jobId = text(body.jobId, 80);
      if (!jobId) throw httpError(400, 'Tarefa inválida.');
      const { data, error } = await client.from('deep_jobs').update({ status: 'canceled', error_message: 'Cancelada pelo usuário.', completed_at: new Date().toISOString() }).eq('id', jobId).eq('user_id', user.id).in('status', ['queued', 'processing']).select('id,chat_id,message_id,status,complexity,progress,result,error_message,created_at,updated_at,started_at,completed_at,delivered_at').maybeSingle();
      if (error) throw error;
      return json(response, 200, { job: safeJob(data) });
    }
    if (action !== 'create') throw httpError(400, 'Ação de tarefa desconhecida.');
    const chatId = text(body.chatId, 140);
    const messageId = text(body.messageId, 140);
    const message = text(body.message);
    if (!chatId || !messageId || !message) throw httpError(400, 'A tarefa precisa de conversa, mensagem e pedido.');
    const history = safeHistory(body.history);
    const complexity = ['standard', 'medium', 'high'].includes(body.complexity) ? body.complexity : 'standard';
    const provider = ['auto', 'groq', 'qwen', 'hermes'].includes(body.provider) ? body.provider : 'auto';
    const initialProgress = {
      phase: 'queued',
      pass: 0,
      totalPasses: complexity === 'high' ? 4 : complexity === 'medium' ? 3 : 2,
      label: 'Klipza está aguardando o início da análise.',
      updates: ['Pedido recebido; vou organizar os requisitos antes de responder.']
    };
    const { data, error } = await client.from('deep_jobs').insert({ user_id: user.id, chat_id: chatId, message_id: messageId, message, history, provider, complexity, progress: initialProgress }).select('id,chat_id,message_id,status,complexity,progress,result,error_message,created_at,updated_at,started_at,completed_at,delivered_at').single();
    if (error) {
      if (error.code === '23505') {
        const existing = await client.from('deep_jobs').select('id,chat_id,message_id,status,complexity,progress,result,error_message,created_at,updated_at,started_at,completed_at,delivered_at').eq('user_id', user.id).eq('message_id', messageId).maybeSingle();
        if (existing.error) throw existing.error;
        return json(response, 200, { job: safeJob(existing.data), existing: true });
      }
      throw error;
    }
    return json(response, 201, { job: safeJob(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    json(response, status, { error: status === 500 ? 'Não foi possível acessar a tarefa agora.' : error.message });
  }
}
