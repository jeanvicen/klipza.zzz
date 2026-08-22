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

function safeList(value, limit, max) {
  return Array.isArray(value) ? value.map((item) => text(item, max)).filter(Boolean).slice(0, limit) : [];
}

function safePlan(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((step, index) => ({
    id: index + 1,
    title: text(step?.title, 160),
    detail: text(step?.detail, 440),
    checks: safeList(step?.checks, 4, 220),
    status: ['pending', 'running', 'done', 'blocked'].includes(step?.status) ? step.status : 'pending'
  })).filter((step) => step.title && step.detail).slice(0, 15);
  return {
    enabled: true,
    complexity: ['standard', 'medium', 'high'].includes(raw.complexity) ? raw.complexity : 'standard',
    title: text(raw.title, 160) || 'Plano de execução Especialista',
    objective: text(raw.objective, 420),
    summary: text(raw.summary, 520),
    steps
  };
}

function safeProgress(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const progress = {
    phase: text(raw.phase, 40) || 'thinking',
    pass: Math.max(0, Math.min(15, Number(raw.pass) || 0)),
    totalPasses: Math.max(1, Math.min(15, Number(raw.totalPasses) || 2)),
    label: text(raw.label, 300) || 'Klipza está analisando o pedido.',
    updates: safeList(raw.updates, 12, 300)
  };
  if (raw.plan && typeof raw.plan === 'object') progress.plan = safePlan(raw.plan);
  if (raw.expertState && typeof raw.expertState === 'object') {
    progress.expertState = {
      stepIndex: Math.max(0, Math.min(14, Number(raw.expertState.stepIndex) || 0)),
      completedSteps: Array.isArray(raw.expertState.completedSteps) ? raw.expertState.completedSteps.slice(-15).map((step) => ({
        id: Number(step?.id) || 0,
        title: text(step?.title, 160),
        narration: text(step?.narration, 520),
        verification: text(step?.verification, 520),
        correction: text(step?.correction, 520),
        result: text(step?.result, 700)
      })).filter((step) => step.title) : [],
      updates: safeList(raw.expertState.updates, 12, 300)
    };
  }
  if (raw.currentStep && typeof raw.currentStep === 'object') progress.currentStep = {
    id: Number(raw.currentStep.id) || 0,
    title: text(raw.currentStep.title, 160),
    detail: text(raw.currentStep.detail, 440),
    checks: safeList(raw.currentStep.checks, 4, 220)
  };
  if (raw.question) progress.question = text(raw.question, 700);
  if (raw.options) progress.options = safeList(raw.options, 4, 180);
  if (raw.resumeAnswer) progress.resumeAnswer = text(raw.resumeAnswer, 1200);
  return progress;
}

function safeJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    chatId: row.chat_id,
    messageId: row.message_id,
    message: text(row.message),
    mode: row.mode === 'expert' ? 'expert' : 'chat',
    status: row.status,
    complexity: row.complexity,
    progress: safeProgress(row.progress),
    result: row.status === 'completed' ? (row.result || {}) : {},
    errorMessage: row.status === 'failed' ? row.error_message || 'Não foi possível concluir a resposta.' : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    deliveredAt: row.delivered_at
  };
}

function jobSelect() {
  return 'id,user_id,chat_id,message_id,message,history,provider,complexity,progress,status,attempt_count,started_at,mode,result,error_message,created_at,updated_at,completed_at,delivered_at';
}

function normalizeExpertQuota(value) {
  const row = value && typeof value === 'object' ? value : {};
  const used = Math.max(0, Math.min(3, Number(row.used) || 0));
  const remaining = Math.max(0, Math.min(3, Number(row.remaining ?? 3 - used) || 0));
  return { limit: 3, used, remaining, windowHours: 48, nextAvailableAt: row.nextAvailableAt || row.next_available_at || null };
}

export async function processClaimedJob({ admin, running, resumeAnswer = '' }) {
  const initialProgress = safeProgress(running.progress);
  const isExpert = running.mode === 'expert';
  const updateProgress = async (progress) => {
    const next = safeProgress({ ...initialProgress, ...progress });
    await admin.from('deep_jobs').update({ progress: next }).eq('id', running.id).eq('status', 'processing');
  };
  try {
    const result = await processAiRequest({
      user: { id: running.user_id },
      client: admin,
      memoryClient: admin,
      body: {
        message: running.message,
        history: Array.isArray(running.history) ? running.history : [],
        mode: isExpert ? 'expert_step' : 'chat',
        provider: running.provider || 'auto',
        thinkingMode: isExpert ? 'deep' : 'deep',
        expertPlan: isExpert ? initialProgress.plan : undefined,
        expertState: isExpert ? (initialProgress.expertState || { stepIndex: 0, completedSteps: [], updates: [] }) : undefined,
        resumeAnswer: isExpert ? text(resumeAnswer || initialProgress.resumeAnswer, 1200) : undefined
      },
      onProgress: isExpert ? async (progress) => updateProgress(progress) : async (progress) => updateProgress(progress)
    });

    if (isExpert) {
      const step = result.expertStep || {};
      const plan = safePlan(step.plan || initialProgress.plan);
      const previousIndex = Math.max(0, Math.min(plan.steps.length - 1, Number(initialProgress.expertState?.stepIndex) || 0));
      const requestedIndex = Math.max(0, Math.min(plan.steps.length - 1, Number(step.stepIndex) || 0));
      const normalizedStatus = step.status === 'continue' && previousIndex >= plan.steps.length - 1 ? 'complete' : (step.status || 'complete');
      const stepIndex = normalizedStatus === 'continue' ? Math.max(previousIndex + 1, requestedIndex) : requestedIndex;
      const expertState = {
        stepIndex,
        completedSteps: Array.isArray(step.completedSteps) ? step.completedSteps : (initialProgress.expertState?.completedSteps || []),
        updates: Array.isArray(step.updates) ? step.updates : (initialProgress.expertState?.updates || [])
      };
      const nextProgress = safeProgress({
        ...initialProgress,
        phase: normalizedStatus === 'question' ? 'awaiting_user' : normalizedStatus === 'complete' ? 'completed' : 'expert_step',
        pass: stepIndex + 1,
        totalPasses: plan.steps.length,
        label: normalizedStatus === 'question' ? 'O Modo Especialista precisa de uma decisão sua para continuar.' : normalizedStatus === 'complete' ? 'Modo Especialista concluído.' : `Executando a etapa ${stepIndex + 1} de ${plan.steps.length}.`,
        updates: step.updates || [],
        plan,
        expertState,
        currentStep: plan.steps[stepIndex],
        question: normalizedStatus === 'question' ? step.question : '',
        options: normalizedStatus === 'question' ? step.options : [],
        resumeAnswer: ''
      });
      if (normalizedStatus === 'question') {
        await admin.from('deep_jobs').update({ status: 'awaiting_user', progress: nextProgress, error_message: null }).eq('id', running.id).eq('status', 'processing');
        return { id: running.id, status: 'awaiting_user' };
      }
      if (normalizedStatus !== 'complete') {
        await admin.from('deep_jobs').update({ status: 'queued', progress: nextProgress, result: {}, error_message: null, completed_at: null }).eq('id', running.id).eq('status', 'processing');
        return { id: running.id, status: 'queued' };
      }
      const expertResult = {
        answer: text(step.answer, 16000) || `Concluí o plano Especialista. ${plan.summary}`,
        mode: 'expert',
        provider: result.provider || 'fallback',
        thinkingMode: 'deep',
        expert: { plan, completedSteps: expertState.completedSteps, updates: expertState.updates, summary: plan.summary }
      };
      await admin.from('deep_jobs').update({ status: 'completed', progress: nextProgress, result: expertResult, completed_at: new Date().toISOString(), error_message: null }).eq('id', running.id).eq('status', 'processing');
      await admin.from('user_notifications').insert({ user_id: running.user_id, notification_type: 'ai_response_complete', title: 'Modo Especialista concluído', body: 'O plano Especialista foi concluído e está pronto na conversa.', metadata: { job_id: running.id, chat_id: running.chat_id, message_id: running.message_id, mode: 'expert' } });
      return { id: running.id, status: 'completed' };
    }

    await admin.from('deep_jobs').update({ status: 'completed', progress: safeProgress({ ...initialProgress, phase: 'completed', pass: result.thinking?.passes || initialProgress.totalPasses || 2, totalPasses: result.thinking?.passes || initialProgress.totalPasses || 2, label: 'Klipza terminou a resposta.', updates: result.thinking?.updates || [] }), result, completed_at: new Date().toISOString(), error_message: null }).eq('id', running.id).eq('status', 'processing');
    await admin.from('user_notifications').insert({ user_id: running.user_id, notification_type: 'ai_response_complete', title: 'Klipza terminou a resposta', body: 'Sua resposta do Pensamento profundo está pronta.', metadata: { job_id: running.id, chat_id: running.chat_id, message_id: running.message_id } });
    return { id: running.id, status: 'completed' };
  } catch (error) {
    const attempt = Number(running.attempt_count || 1);
    const retry = attempt < 3;
    await admin.from('deep_jobs').update({ status: retry ? 'queued' : 'failed', error_message: text(error?.message || 'Falha no processamento.', 500), progress: safeProgress({ ...initialProgress, phase: retry ? 'retrying' : 'failed', label: retry ? 'A etapa será retomada automaticamente.' : 'Não foi possível concluir esta tarefa.', updates: [...(initialProgress.updates || []), text(error?.message || 'A execução encontrou um erro observável.', 280)].filter(Boolean).slice(-10) }), completed_at: retry ? null : new Date().toISOString() }).eq('id', running.id).eq('status', 'processing');
    if (!retry) await admin.from('user_notifications').insert({ user_id: running.user_id, notification_type: 'ai_response_complete', title: isExpert ? 'O Modo Especialista não foi concluído' : 'A resposta não foi concluída', body: isExpert ? 'O plano Especialista encontrou um erro. Você pode tentar novamente.' : 'O Klipza não conseguiu terminar esta resposta. Tente novamente.', metadata: { job_id: running.id, chat_id: running.chat_id, message_id: running.message_id, failed: true, mode: running.mode || 'chat' } });
    return { id: running.id, status: retry ? 'queued' : 'failed' };
  }
}

export default async function handler(request, response) {
  cors(response);
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  try {
    const { client, user } = await requireUser(request);
    if (request.method === 'GET') {
      const chatId = text(request.query?.chatId || '', 140);
      let query = client.from('deep_jobs').select(jobSelect()).eq('user_id', user.id).in('status', ['awaiting_confirmation', 'queued', 'processing', 'awaiting_user', 'completed', 'failed']).is('delivered_at', null).order('created_at', { ascending: false }).limit(25);
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
      const { data: candidate, error: readError } = await client.from('deep_jobs').select(jobSelect()).eq('id', jobId).eq('user_id', user.id).in('status', ['awaiting_confirmation', 'queued']).maybeSingle();
      if (readError) throw readError;
      if (!candidate) return json(response, 200, { started: false });
      let quota = null;
      if (candidate.mode === 'expert') {
        const eventKey = text(body.eventKey, 180);
        if (eventKey.length < 8) throw httpError(400, 'Evento Especialista inválido.');
        const { data: quotaResult, error: quotaError } = await client.rpc('consume_expert_mode', { p_event_key: eventKey });
        if (quotaError) throw quotaError;
        quota = normalizeExpertQuota(quotaResult);
        if (quotaResult?.allowed !== true && quotaResult?.alreadyProcessed !== true) return json(response, 200, { started: false, allowed: false, consumed: false, quota });
      }
      const nextProgress = safeProgress({ ...candidate.progress, phase: candidate.mode === 'expert' ? 'expert_step' : 'thinking', label: candidate.mode === 'expert' ? 'Plano confirmado; iniciando a próxima etapa.' : 'Klipza está respondendo em segundo plano.' });
      const { data: claimed, error: claimError } = await client.from('deep_jobs').update({ status: 'processing', started_at: candidate.started_at || new Date().toISOString(), attempt_count: Number(candidate.attempt_count || 0) + 1, progress: nextProgress }).eq('id', jobId).eq('user_id', user.id).eq('status', candidate.status).select(jobSelect()).maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json(response, 200, { started: false, allowed: quota ? true : undefined, consumed: quota ? true : undefined, quota });
      const admin = serviceClient();
      const result = await processClaimedJob({ admin, running: claimed });
      return json(response, 200, { started: true, allowed: quota ? true : undefined, consumed: quota ? true : undefined, quota, status: result.status });
    }
    if (action === 'resume') {
      const jobId = text(body.jobId, 80);
      const answer = text(body.answer, 1200);
      if (!jobId || !answer) throw httpError(400, 'Responda à decisão para continuar.');
      const { data: waiting, error: readError } = await client.from('deep_jobs').select(jobSelect()).eq('id', jobId).eq('user_id', user.id).eq('mode', 'expert').eq('status', 'awaiting_user').maybeSingle();
      if (readError) throw readError;
      if (!waiting) return json(response, 200, { resumed: false });
      const progress = safeProgress({ ...waiting.progress, phase: 'expert_step', label: 'Decisão recebida; retomando o plano a partir da etapa pausada.', question: '', options: [], resumeAnswer: answer });
      const { data: claimed, error: claimError } = await client.from('deep_jobs').update({ status: 'processing', progress, error_message: null, attempt_count: Number(waiting.attempt_count || 0) + 1 }).eq('id', jobId).eq('user_id', user.id).eq('status', 'awaiting_user').select(jobSelect()).maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) return json(response, 200, { resumed: false });
      const admin = serviceClient();
      const result = await processClaimedJob({ admin, running: claimed, resumeAnswer: answer });
      return json(response, 200, { resumed: true, status: result.status });
    }
    if (action === 'ack') {
      const jobId = text(body.jobId, 80);
      if (!jobId) throw httpError(400, 'Tarefa inválida.');
      const { data, error } = await client.from('deep_jobs').update({ delivered_at: new Date().toISOString() }).eq('id', jobId).eq('user_id', user.id).in('status', ['completed', 'failed', 'canceled']).select(jobSelect()).maybeSingle();
      if (error) throw error;
      return json(response, 200, { job: safeJob(data) });
    }
    if (action === 'cancel') {
      const jobId = text(body.jobId, 80);
      if (!jobId) throw httpError(400, 'Tarefa inválida.');
      const { data, error } = await client.from('deep_jobs').update({ status: 'canceled', error_message: 'Cancelada pelo usuário.', completed_at: new Date().toISOString() }).eq('id', jobId).eq('user_id', user.id).in('status', ['awaiting_confirmation', 'queued', 'processing', 'awaiting_user']).select(jobSelect()).maybeSingle();
      if (error) throw error;
      return json(response, 200, { job: safeJob(data) });
    }
    if (action !== 'create') throw httpError(400, 'Ação de tarefa desconhecida.');
    const chatId = text(body.chatId, 140);
    const messageId = text(body.messageId, 140);
    const message = text(body.message);
    if (!chatId || !messageId || !message) throw httpError(400, 'A tarefa precisa de conversa, mensagem e pedido.');
    const history = safeHistory(body.history);
    const mode = body.mode === 'expert' ? 'expert' : 'chat';
    const complexity = ['standard', 'medium', 'high'].includes(body.complexity) ? body.complexity : 'standard';
    const provider = ['auto', 'groq', 'qwen', 'hermes'].includes(body.provider) ? body.provider : 'auto';
    if (mode === 'expert') {
      const sameMessage = await client.from('deep_jobs').select(jobSelect()).eq('user_id', user.id).eq('message_id', messageId).maybeSingle();
      if (sameMessage.error) throw sameMessage.error;
      if (sameMessage.data) return json(response, 200, { job: safeJob(sameMessage.data), existing: true });
      const activeExpert = await client.from('deep_jobs').select('id').eq('user_id', user.id).eq('mode', 'expert').in('status', ['awaiting_confirmation', 'queued', 'processing', 'awaiting_user']).limit(1);
      if (activeExpert.error) throw activeExpert.error;
      if (activeExpert.data?.length) throw httpError(409, 'Já existe um plano Especialista em andamento nesta conta.');
    }
    const initialProgress = mode === 'expert' ? safeProgress({ phase: 'plan_confirmed', pass: 0, totalPasses: Math.min(15, Math.max(3, Array.isArray(body.plan?.steps) ? body.plan.steps.length : 4)), label: 'Plano confirmado; a primeira etapa será iniciada agora.', updates: ['Plano confirmado pelo usuário; vou começar pela etapa mais importante.'], plan: body.plan, expertState: { stepIndex: 0, completedSteps: [], updates: [] }, currentStep: body.plan?.steps?.[0] }) : safeProgress({ phase: 'queued', pass: 0, totalPasses: complexity === 'high' ? 4 : complexity === 'medium' ? 3 : 2, label: 'Klipza está aguardando o início da análise.', updates: ['Pedido recebido; vou organizar os requisitos antes de responder.'] });
    const insert = { user_id: user.id, chat_id: chatId, message_id: messageId, message, history, provider, complexity, mode, status: mode === 'expert' ? 'awaiting_confirmation' : 'queued', progress: initialProgress };
    const { data, error } = await client.from('deep_jobs').insert(insert).select(jobSelect()).single();
    if (error) {
      if (error.code === '23505') {
        const existing = await client.from('deep_jobs').select(jobSelect()).eq('user_id', user.id).eq('message_id', messageId).maybeSingle();
        if (existing.error) throw existing.error;
        return json(response, 200, { job: safeJob(existing.data), existing: true });
      }
      throw error;
    }
    return json(response, 201, { job: safeJob(data) });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(response, status, { error: status === 500 ? 'Não foi possível acessar a tarefa agora.' : error.message });
  }
}
