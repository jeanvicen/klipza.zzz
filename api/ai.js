import { createClient } from '@supabase/supabase-js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
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

function historyForGroq(history) {
  return history.map((item) => ({ role: item.role, content: item.content }));
}

async function resolveGeminiModel(key) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  try {
    const payload = await requestJSON(GEMINI_CONTENT_URL, {
      headers: { 'x-goog-api-key': key, Accept: 'application/json' }
    });
    const models = Array.isArray(payload?.models) ? payload.models : [];
    const compatible = models.filter((model) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'));
    const preferred = compatible.find((model) => /gemini-2\.5-flash|gemini-2\.0-flash|gemini-1\.5-flash/i.test(model.name || '')) || compatible.find((model) => /flash/i.test(model.name || '')) || compatible[0];
    return String(preferred?.name || '').replace(/^models\//, '') || GEMINI_MODEL;
  } catch {
    return GEMINI_MODEL;
  }
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
  const model = await resolveGeminiModel(key);
  const payload = await requestJSON(`${GEMINI_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`, {
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

async function callGroqVision({ message, history, attachments }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw httpError(503, 'O fallback multimodal ainda não está configurado.');
  const content = [{ type: 'text', text: message || 'Analise os anexos e descreva os pontos mais importantes.' }];
  for (const attachment of attachments) {
    if (attachment.data?.mime_type?.startsWith('image/') && attachment.data?.data) {
      content.push({ type: 'image_url', image_url: { url: `data:${attachment.data.mime_type};base64,${attachment.data.data}` } });
    } else if (attachment.content) {
      content.push({ type: 'text', text: `Conteúdo do arquivo ${attachment.name}:\n${attachment.content}` });
    } else {
      content.push({ type: 'text', text: `O arquivo ${attachment.name} foi anexado, mas este fallback só consegue interpretar imagens e texto diretamente.` });
    }
  }
  const payload = await requestJSON(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...historyForGroq(history), { role: 'user', content }],
      temperature: 0.25,
      max_completion_tokens: 1600,
      stream: false
    })
  });
  const result = text(payload?.choices?.[0]?.message?.content, 24000);
  if (!result) throw httpError(502, 'A análise multimodal veio vazia.');
  return result;
}

async function callGeminiResearch({ message, history, reference }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw httpError(503, 'O assistente de pesquisa ainda não está configurado.');
  const context = researchText(reference);
  const previous = history.slice(-8).map((item) => `${item.role === 'assistant' ? 'Klipza' : 'Pessoa'}: ${item.content}`).join('\n');
  const input = [
    'Use pesquisa atualizada para responder com precisão. Cite as fontes principais em Markdown quando houver referências disponíveis.',
    context ? `Referência selecionada no web.klip:\n${context}` : '',
    previous ? `Contexto recente:\n${previous}` : '',
    `Pergunta atual:\n${message}`
  ].filter(Boolean).join('\n\n');
  const model = await resolveGeminiModel(key);
  const endpoint = `${GEMINI_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`;
  const baseBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1600 }
  };
  try {
    const payload = await requestJSON(endpoint, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...baseBody, tools: [{ googleSearch: {} }] })
    });
    return extractGeminiText(payload);
  } catch (error) {
    if (![400, 404].includes(Number(error?.status))) throw error;
    const fallbackPayload = await requestJSON(endpoint, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...baseBody,
        contents: [{ role: 'user', parts: [{ text: `${input}\n\nUse também as referências públicas já fornecidas pelo web.klip e não invente fontes.` }] }]
      })
    });
    return extractGeminiText(fallbackPayload);
  }
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
        ? await callGeminiVision({ message, history, attachments }).catch(async (geminiError) => {
            try { return await callGroqVision({ message, history, attachments }); }
            catch (groqError) {
              const fallbackError = httpError(502, 'Não foi possível analisar o anexo agora.');
              fallbackError.providerMessage = [geminiError?.providerMessage, groqError?.providerMessage].filter(Boolean).join(' | ');
              throw fallbackError;
            }
          })
        : await callGroq({ message, history });
    json(response, 200, { answer, mode });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 400) console.error('ai_request_failed', error?.message || error, error?.providerMessage || '');
    json(response, status, { error: status === 500 ? 'Não foi possível concluir a resposta agora.' : error.message });
  }
}
