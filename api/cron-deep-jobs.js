import { serviceClient, json, cors } from './_auth.js';
import { processClaimedJob } from './deep-jobs.js';

function cronAuthorized(request) {
  const configured = String(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '').trim();
  const header = String(request.headers?.authorization || request.headers?.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  const userAgent = String(request.headers?.['user-agent'] || request.headers?.['User-Agent'] || '');
  if (configured) return header === configured;
  return /vercel-cron\/1\.0/i.test(userAgent);
}

function text(value, max = 300) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function safeProgress(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    ...raw,
    phase: text(raw.phase, 40) || 'thinking',
    pass: Math.max(0, Math.min(15, Number(raw.pass) || 0)),
    totalPasses: Math.max(1, Math.min(15, Number(raw.totalPasses) || 2)),
    label: text(raw.label, 300) || 'Klipza está analisando o pedido.',
    updates: (Array.isArray(raw.updates) ? raw.updates : []).map((item) => text(item, 300)).filter(Boolean).slice(-12)
  };
}

const SELECT = 'id,user_id,chat_id,message_id,message,history,provider,complexity,progress,status,attempt_count,started_at,mode,result,error_message,created_at,updated_at,completed_at,delivered_at';

async function processOne(admin, job) {
  const now = new Date().toISOString();
  const claimed = await admin.from('deep_jobs').update({
    status: 'processing',
    started_at: job.started_at || now,
    attempt_count: Number(job.attempt_count || 0) + 1,
    progress: safeProgress({ ...(job.progress || {}), phase: job.mode === 'expert' ? 'expert_step' : 'thinking', label: job.mode === 'expert' ? 'Retomando a próxima etapa do Modo Especialista.' : 'Klipza está respondendo em segundo plano.' })
  }).eq('id', job.id).eq('status', 'queued').select(SELECT).maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return { id: job.id, skipped: true };
  return processClaimedJob({ admin, running: claimed.data });
}

export default async function handler(request, response) {
  cors(response);
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  if (request.method !== 'GET') return json(response, 405, { error: 'Método não permitido.' });
  if (!cronAuthorized(request)) return json(response, 401, { error: 'Cron não autorizado.' });
  try {
    const admin = serviceClient();
    const { data: jobs, error } = await admin.from('deep_jobs').select(SELECT).in('status', ['queued']).order('created_at', { ascending: true }).limit(2);
    if (error) throw error;
    const results = [];
    for (const job of jobs || []) results.push(await processOne(admin, job));
    return json(response, 200, { processed: results.length, results });
  } catch (error) {
    return json(response, 500, { error: 'Não foi possível processar as tarefas profundas agora.' });
  }
}
