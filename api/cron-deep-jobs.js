import { serviceClient, json, cors } from './_auth.js';
import { processAiRequest } from './ai.js';

function cronAuthorized(request) {
  const configured = String(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '').trim();
  const header = String(request.headers?.authorization || request.headers?.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  const userAgent = String(request.headers?.['user-agent'] || request.headers?.['User-Agent'] || '');
  if (configured) return header === configured;
  return /vercel-cron\/1\.0/i.test(userAgent);
}

function trimProgress(update, fallback = {}) {
  return {
    phase: String(update?.phase || fallback.phase || 'thinking').slice(0, 40),
    pass: Math.max(0, Math.min(8, Number(update?.pass ?? fallback.pass) || 0)),
    totalPasses: Math.max(1, Math.min(8, Number(update?.totalPasses ?? fallback.totalPasses) || 2)),
    label: String(update?.label || fallback.label || 'Klipza está analisando o pedido.').slice(0, 260),
    updates: (Array.isArray(update?.updates) ? update.updates : Array.isArray(fallback.updates) ? fallback.updates : []).map(item => String(item || '').slice(0, 260)).filter(Boolean).slice(0, 10)
  };
}

async function processOne(admin, job) {
  const now = new Date().toISOString();
  const claimed = await admin.from('deep_jobs').update({ status: 'processing', started_at: job.started_at || now, attempt_count: Number(job.attempt_count || 0) + 1, progress: trimProgress({ phase: 'thinking', pass: 0, totalPasses: job.progress?.totalPasses || 2, label: 'Klipza está respondendo em segundo plano.', updates: ['A tarefa foi retomada com segurança.'] }, job.progress) }).eq('id', job.id).eq('status', 'queued').select('id,user_id,chat_id,message_id,message,history,provider,complexity,attempt_count,progress').maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return { id: job.id, skipped: true };
  const running = claimed.data;
  const updateProgress = async (progress) => {
    const next = trimProgress(progress, running.progress);
    await admin.from('deep_jobs').update({ progress: next }).eq('id', running.id).eq('status', 'processing');
  };
  try {
    const result = await processAiRequest({
      user: { id: running.user_id },
      client: admin,
      body: { message: running.message, history: Array.isArray(running.history) ? running.history : [], mode: running.mode || 'chat', provider: running.provider || 'auto', thinkingMode: 'deep' },
      onProgress: updateProgress
    });
    await admin.from('deep_jobs').update({ status: 'completed', progress: trimProgress({ phase: 'completed', pass: result.thinking?.passes || running.progress?.totalPasses || 2, totalPasses: result.thinking?.passes || running.progress?.totalPasses || 2, label: 'Klipza terminou a resposta.', updates: result.thinking?.updates || [] }, running.progress), result, completed_at: new Date().toISOString(), error_message: null }).eq('id', running.id).eq('status', 'processing');
    await admin.from('user_notifications').insert({ user_id: running.user_id, notification_type: 'ai_response_complete', title: 'Klipza terminou a resposta', body: 'Sua resposta do Pensamento profundo está pronta.', metadata: { job_id: running.id, chat_id: running.chat_id, message_id: running.message_id } });
    return { id: running.id, status: 'completed' };
  } catch (error) {
    const attempt = Number(running.attempt_count || 1);
    const retry = attempt < 3;
    await admin.from('deep_jobs').update({ status: retry ? 'queued' : 'failed', error_message: String(error?.message || 'Falha no processamento.').slice(0, 500), progress: trimProgress({ phase: retry ? 'retrying' : 'failed', pass: running.progress?.pass || 0, totalPasses: running.progress?.totalPasses || 2, label: retry ? 'A análise será retomada automaticamente.' : 'Não foi possível concluir esta resposta.', updates: running.progress?.updates || [] }, running.progress), completed_at: retry ? null : new Date().toISOString() }).eq('id', running.id).eq('status', 'processing');
    if (!retry) await admin.from('user_notifications').insert({ user_id: running.user_id, notification_type: 'ai_response_complete', title: 'A resposta não foi concluída', body: 'O Klipza não conseguiu terminar esta resposta. Tente novamente.', metadata: { job_id: running.id, chat_id: running.chat_id, message_id: running.message_id, failed: true } });
    return { id: running.id, status: retry ? 'queued' : 'failed' };
  }
}

export default async function handler(request, response) {
  cors(response);
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  if (request.method !== 'GET') return json(response, 405, { error: 'Método não permitido.' });
  if (!cronAuthorized(request)) return json(response, 401, { error: 'Cron não autorizado.' });
  try {
    const admin = serviceClient();
    const { data: jobs, error } = await admin.from('deep_jobs').select('id,user_id,chat_id,message_id,message,history,provider,complexity,attempt_count,progress,started_at,mode').in('status', ['queued']).order('created_at', { ascending: true }).limit(2);
    if (error) throw error;
    const results = [];
    for (const job of jobs || []) results.push(await processOne(admin, job));
    return json(response, 200, { processed: results.length, results });
  } catch (error) {
    return json(response, 500, { error: 'Não foi possível processar as tarefas profundas agora.' });
  }
}
