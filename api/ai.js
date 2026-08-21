import { createClient } from '@supabase/supabase-js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_MESSAGE_LENGTH = 12000;
const MAX_HISTORY_ITEMS = 16;
const MAX_ATTACHMENT_DATA = 3600000;

const SYSTEM_PROMPT = [
  'Você é o Klipza.IA, um assistente útil, claro e profissional.',
  'Responda em português do Brasil, salvo quando a pessoa pedir outro idioma.',
  'Use Markdown simples quando isso melhorar a leitura.',
  'Não invente fatos, fontes, resultados de pesquisa ou capacidades.',
  'Quando não tiver certeza, explique a limitação e sugira uma forma segura de verificar.',
  'Não peça senhas, códigos de segurança ou dados completos de cartão.'
].join(' ');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function bearer(request) {
  const value = request.headers?.authorization || request.headers?.Authorization || '';
  return String(value).replace(/^Bearer\s+/i, '').trim();
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('sb_publishable_')) throw httpError(503, 'Serviço de conta indisponível.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requireUser(request) {
  const token = bearer(request);
  if (!token) throw httpError(401, 'Não autenticado.');
  const client = serviceClient();
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw httpError(401, 'Sessão inválida.');
  return user;
}

function parseBody(request) {
  if (!request.body) return {};
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { throw httpError(400, 'Solicitação inválida.'); }
  }
  return request.body;
}

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

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
  if (!match || match[2].length > MAX_ATTACHMENT_DATA) return null;
  return { mime_type: match[1], data: match[2] };
}

function safeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).map((item) => ({
    name: text(item?.name, 180) || 'arquivo',
    type: text(item?.type, 120) || 'application/octet-stream',
    data: parseDataUrl(item?.aiData || item?.data),
    content: text(item?.aiText, 18000)
  })).filter((item) => item.data || item.content);
}

function researchText(value) {
  if (!value || typeof value !== 'object') return '';
  return [
    `Título: ${text(value.title, 500)}`,
    `Categoria: ${text(value.category, 120)}`,
    `Resumo: ${text(value.summary, 2500)}`,
    `Origem: ${text(value.source, 500)}`,
    `Referência: ${text(value.url, 1000)}`
  ].filter((line) => !line.endsWith(': ')).join('\n');
}

async function requestJSON(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = httpError(response.status >= 500 ? 502 : response.status, 'O serviço de inteligência artificial não respondeu.');
    error.providerMessage = payload?.error?.message || payload?.error?.status || '';
    throw error;
  }
  return payload;
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const result = parts.map((part) => part?.text || '').filter(Boolean).join('\n').trim();
  if (!result) throw httpError(502, 'A resposta não trouxe texto.');
  return result;
}

function extractInteractionText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const texts = steps.flatMap((step) => {
    const blocks = Array.isArray(step?.content) ? step.content : [];
    return blocks.filter((block) => block?.type === 'text' && block.text).map((block) => block.text);
  });
  const result = texts.join('\n').trim();
  if (!result) throw httpError(502, 'A pesquisa não trouxe uma resposta.');
  return result;
}

function historyForGroq(history) {
  return history.map((item) => ({ role: item.role, content: item.content }));
}

async function callGroq({ message, history }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw httpError(503, 'O assistente de texto ainda não está configurado.');
  const payload = await requestJSON(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...historyForGroq(history), { role: 'user', content: message }],
      temperature: 0.35,
      max_completion_tokens: 1400,
      stream: false
    })
  });
  const result = text(payload?.choices?.[0]?.message?.content, 24000);
  if (!result) throw httpError(502, 'A resposta de texto veio vazia.');
  return result;
}

function geminiContents(history, parts) {
  const previous = history.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.content }]
  }));
  return [...previous, { role: 'user', parts }];
}

async function callGeminiVision({ message, history, attachments }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw httpError(503, 'O assistente multimodal ainda não está configurado.');
  const parts = [{ text: message || 'Analise os anexos e explique o que é importante.' }];
  for (const attachment of attachments) {
    if (attachment.content) parts.push({ text: `Conteúdo do arquivo ${attachment.name}:\n${attachment.content}` });
    if (attachment.data) parts.push({ inline_data: attachment.data });
  }
  const payload = await requestJSON(`${GEMINI_CONTENT_URL}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: geminiContents(history, parts),
      generationConfig: { temperature: 0.25, maxOutputTokens: 1600 }
    })
  });
  return extractGeminiText(payload);
}

async function callGeminiResearch({ message, history, reference }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw httpError(503, 'O assistente de pesquisa ainda não está configurado.');
  const context = researchText(reference);
  const previous = history.slice(-8).map((item) => `${item.role === 'assistant' ? 'Klipza' : 'Pessoa'}: ${item.content}`).join('\n');
  const input = [
    SYSTEM_PROMPT,
    'Responda à pesquisa abaixo usando busca atualizada. Cite as fontes principais em Markdown quando a busca retornar referências.',
    context ? `Referência selecionada no web.klip:\n${context}` : '',
    previous ? `Contexto recente:\n${previous}` : '',
    `Pergunta atual:\n${message}`
  ].filter(Boolean).join('\n\n');
  const payload = await requestJSON(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: GEMINI_MODEL, input, tools: [{ type: 'google_search' }] })
  });
  return extractInteractionText(payload);
}

function json(response, status, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(status).json(body);
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (request.method === 'OPTIONS') { response.status(204).end(); return; }
  if (request.method !== 'POST') { json(response, 405, { error: 'Método não permitido.' }); return; }
  try {
    await requireUser(request);
    const body = parseBody(request);
    const message = text(body.message);
    const history = safeHistory(body.history);
    const attachments = safeAttachments(body.attachments);
    const mode = body.mode === 'research' ? 'research' : attachments.length ? 'attachments' : 'chat';
    if (!message && !attachments.length) throw httpError(400, 'Envie uma mensagem ou um anexo.');
    const answer = mode === 'research'
      ? await callGeminiResearch({ message: message || 'Analise a referência selecionada.', history, reference: body.researchContext })
      : mode === 'attachments'
        ? await callGeminiVision({ message, history, attachments })
        : await callGroq({ message, history });
    json(response, 200, { answer, mode });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('ai_request_failed', error?.message || error);
    json(response, status, { error: status === 500 ? 'Não foi possível concluir a resposta agora.' : error.message });
  }
}
