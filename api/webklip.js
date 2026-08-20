import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_TERMS = [
  'celebrity', 'celebrities', 'famous', 'influencer', 'hollywood', 'reality show',
  'gossip', 'entertainment', 'red carpet', 'celebridade', 'famoso', 'famosa',
  'influenciador', 'influenciadora', 'fofoca', 'entretenimento', 'executor',
  'activator', 'activation', 'without subscription', 'no subscription', 'crack',
  'keygen', 'piracy', 'pirated', 'torrent', 'cheat', 'cheats', 'aimbot',
  'stealer', 'malware', 'ransomware', 'phishing', 'credential', 'token grabber',
  'password dump', 'bypass', 'no more refusals', 'auto claim points', 'nsfw', 'porn'
];

const NEWS_TERMS = [
  'celebrity', 'celebrities', 'gossip', 'entertainment', 'hollywood', 'celebridade', 'famosos', 'fofoca',
  'reality show', 'trailer', 'actor', 'actress', 'singer', 'album', 'film', 'movie', 'music', 'television',
  'netflix', 'oscar', 'grammy', 'red carpet', 'award season', 'showbiz', 'celebrity drama', 'star-studded', 'filme', 'filmes', 'movie', 'movies', 'cinema', 'streaming', 'trailer', 'omelete', 'ingresso.com', 'futebol', 'football', 'soccer', 'copa do mundo', 'jogador', 'jogadora', 'convocado', 'convocada', 'convocados', 'convocadas', 'sport club', 'campeonato'
];

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

const SEARCH_STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'e', 'ou', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'sem', 'sobre', 'como', 'que', 'qual', 'quais', 'onde', 'quando', 'porque', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'of', 'for', 'to', 'with', 'without', 'what', 'which', 'where', 'when', 'why', 'how'
]);

function normalizeSearchText(value) {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchTokens(value) {
  return [...new Set(normalizeSearchText(value).split(' ').filter((token) => token.length >= 2 && !SEARCH_STOP_WORDS.has(token)))];
}

function searchRelevance(value, query) {
  const haystack = normalizeSearchText(value);
  const phrase = normalizeSearchText(query);
  const tokens = searchTokens(query);
  if (!tokens.length) return -1;
  const matched = tokens.filter((token) => haystack.includes(token));
  const required = tokens.length === 1 ? 1 : Math.max(1, Math.ceil(tokens.length * 0.6));
  if (matched.length < required) return -1;
  return matched.length / tokens.length + (phrase && haystack.includes(phrase) ? 1 : 0);
}

function hasBlockedTerm(value, terms = BLOCKED_TERMS) {
  const normalized = cleanText(value).toLowerCase();
  return terms.some((term) => {
    const escaped = String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\s+/g, '\\s+');
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(normalized);
  });
}

function idFor(prefix, value) {
  return `${prefix}_${Buffer.from(String(value)).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 18)}`;
}

async function getJSON(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/xml, text/xml', ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

const MAX_FRAME_REDIRECTS = 3;
const FRAME_REQUEST_HEADERS = { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'KlipzaWebKlip/1.0 (+https://klipza-zzz.vercel.app/)' };

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7));
  if (isIP(value) === 4) {
    const octets = value.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51) ||
      (a === 203 && b === 0) || a >= 224;
  }
  if (isIP(value) === 6) {
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
      value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb');
  }
  return true;
}

async function validateFrameTarget(value) {
  const target = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('URL não permitida');
  if (target.port && !['80', '443'].includes(target.port)) throw new Error('Porta não permitida');
  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Destino interno não permitido');
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error('Destino interno não permitido');
  return target;
}

async function fetchFrameHeaders(value, method, signal) {
  let target = await validateFrameTarget(value);
  for (let redirects = 0; redirects <= MAX_FRAME_REDIRECTS; redirects += 1) {
    const response = await fetch(target, { method, redirect: 'manual', signal, headers: FRAME_REQUEST_HEADERS });
    if (response.status < 300 || response.status >= 400) return { response, target };
    const location = response.headers.get('location');
    if (!location || redirects === MAX_FRAME_REDIRECTS) throw new Error('Redirecionamento não permitido');
    target = await validateFrameTarget(new URL(location, target).toString());
  }
  throw new Error('Redirecionamento não permitido');
}

async function inspectFramePolicy(value) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    let result;
    try {
      result = await fetchFrameHeaders(value, 'HEAD', controller.signal);
    } catch {
      result = await fetchFrameHeaders(value, 'GET', controller.signal);
    }
    const { response, target } = result;
    const xFrame = (response.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
    const frameAncestors = csp.match(/frame-ancestors\s+([^;]+)/i)?.[1] || '';
    const blockedByXFrame = Boolean(xFrame && (xFrame.includes('deny') || xFrame.includes('sameorigin') || xFrame.includes('allow-from')));
    const allowedByCsp = frameAncestors.includes('*') || frameAncestors.includes('https://klipza-zzz.vercel.app') || frameAncestors.includes('http://localhost') || frameAncestors.includes('http://127.0.0.1');
    const blockedByCsp = Boolean(frameAncestors && !allowedByCsp);
    response.body?.cancel?.();
    return {
      url: response.url || target.toString(),
      status: response.status,
      embeddable: !blockedByXFrame && !blockedByCsp,
      reason: blockedByXFrame ? 'x-frame-options' : blockedByCsp ? 'content-security-policy' : null
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeXml(value) {
  return cleanText(value)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function rssTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function mapGoogleNews(xml) {
  const blocks = [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  return blocks
    .map((block, index) => ({
      title: rssTag(block, 'title'),
      url: rssTag(block, 'link'),
      source: rssTag(block, 'source'),
      date: rssTag(block, 'pubDate'),
      description: rssTag(block, 'description'),
      index
    }))
    .filter((article) => article.title && !hasBlockedTerm(`${article.title} ${article.source}`, NEWS_TERMS))
    .map((article) => ({
      id: idFor('news', article.url || article.title + article.index),
      category: 'news',
      title: article.title,
      summary: `Notícia publicada por ${article.source || 'fonte pública'}. Abra para ler a fonte original e continuar a pesquisa no chat.`,
      source: article.source || 'Google News RSS',
      url: article.url,
      date: Number.isNaN(Date.parse(article.date)) ? new Date().toISOString() : new Date(article.date).toISOString()
    }));
}

function mapRepositories(data, category) {
  const repositories = Array.isArray(data?.items) ? data.items : [];
  return repositories
    .filter((repo) => repo?.name && repo?.html_url && !hasBlockedTerm(`${repo.full_name} ${repo.description}`))
    .map((repo) => ({
      id: idFor(category, repo.html_url),
      category,
      title: repo.full_name || repo.name,
      summary: cleanText(repo.description) || 'Projeto público sem descrição informada.',
      source: `GitHub · ${repo.language || 'open source'}`,
      url: repo.html_url,
      date: repo.created_at || repo.updated_at || new Date().toISOString(),
      meta: `${repo.stargazers_count || 0} estrelas · ${repo.language || 'código aberto'}`
    }));
}

function dateKey(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const LOCALES = {
  BR: { language: 'pt-BR', hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt', query: 'mundo OR ciência OR tecnologia OR clima OR negócios when:1d' },
  PT: { language: 'pt-PT', hl: 'pt-PT', gl: 'PT', ceid: 'PT:pt', query: 'mundo OR ciência OR tecnologia OR clima OR negócios when:1d' },
  US: { language: 'en-US', hl: 'en-US', gl: 'US', ceid: 'US:en', query: 'world OR science OR technology OR climate OR business when:1d' },
  GB: { language: 'en-GB', hl: 'en-GB', gl: 'GB', ceid: 'GB:en', query: 'world OR science OR technology OR climate OR business when:1d' },
  ES: { language: 'es-ES', hl: 'es-ES', gl: 'ES', ceid: 'ES:es', query: 'mundo OR ciencia OR tecnología OR clima OR negocios when:1d' },
  MX: { language: 'es-MX', hl: 'es-419', gl: 'MX', ceid: 'MX:es', query: 'mundo OR ciencia OR tecnología OR clima OR negocios when:1d' },
  FR: { language: 'fr-FR', hl: 'fr-FR', gl: 'FR', ceid: 'FR:fr', query: 'monde OR science OR technologie OR climat OR économie when:1d' },
  DE: { language: 'de-DE', hl: 'de-DE', gl: 'DE', ceid: 'DE:de', query: 'welt OR wissenschaft OR technologie OR klima OR wirtschaft when:1d' },
  JP: { language: 'ja-JP', hl: 'ja', gl: 'JP', ceid: 'JP:ja', query: '世界 OR 科学 OR テクノロジー OR 気候 when:1d' },
  IN: { language: 'en-IN', hl: 'en-IN', gl: 'IN', ceid: 'IN:en', query: 'world OR science OR technology OR climate OR business when:1d' }
};

function resolveLocale(country, language) {
  const code = String(country || '').toUpperCase();
  if (LOCALES[code]) return LOCALES[code];
  const lang = String(language || '').toLowerCase();
  return Object.values(LOCALES).find((locale) => locale.language.toLowerCase() === lang) || LOCALES.BR;
}

function decodeSearchHtml(value) {
  return decodeXml(String(value || '').replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))));
}

function safeSearchUrl(value) {
  const raw = decodeSearchHtml(value).trim();
  if (!raw) return '';
  const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
  try {
    const parsed = new URL(absolute);
    const redirected = parsed.searchParams.get('uddg');
    const target = redirected ? decodeURIComponent(redirected) : parsed.toString();
    const safe = new URL(target);
    return ['http:', 'https:'].includes(safe.protocol) ? safe.toString() : '';
  } catch {
    return '';
  }
}

function mapDuckDuckGoResults(html, query) {
  const titles = [...String(html || '').matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets = [...String(html || '').matchAll(/<(?:a|div)[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
  const seen = new Set();
  return titles.map((match, index) => {
    const url = safeSearchUrl(match[1]);
    const title = decodeSearchHtml(match[2]);
    const summary = decodeSearchHtml(snippets[index]?.[1] || '');
    const relevance = searchRelevance(`${title} ${summary}`, query);
    return { url, title, summary: summary || 'Resultado público encontrado na web.', relevance, index };
  }).filter((item) => item.url && item.title && item.relevance >= 0 && !seen.has(item.url) && !hasBlockedTerm(`${item.title} ${item.summary}`)).sort((a, b) => b.relevance - a.relevance).map((item) => {
    seen.add(item.url);
    return { id: idFor('search', item.url), category: 'search', title: item.title, summary: item.summary, source: new URL(item.url).hostname.replace(/^www\\./, ''), url: item.url, date: new Date().toISOString() };
  }).slice(0, 50);
}

function mapNewsSearchResults(xml, query) {
  return mapGoogleNews(xml).map((item) => ({
    ...item,
    id: idFor('search', item.url || item.title),
    category: 'search',
    summary: `${item.summary} Abra a fonte original para continuar a leitura.`,
    relevance: searchRelevance(`${item.title} ${item.summary} ${item.source}`, query)
  })).filter((item) => item.relevance >= 0).sort((a, b) => b.relevance - a.relevance).map(({ relevance, ...item }) => item).slice(0, 50);
}

function mapGitHubSearchResults(data, query) {
  return mapRepositories(data, 'search').map((item) => ({
    ...item,
    relevance: searchRelevance(`${item.title} ${item.summary} ${item.meta}`, query)
  })).filter((item) => item.relevance >= 0).sort((a, b) => b.relevance - a.relevance).map(({ relevance, ...item }) => item).slice(0, 50);
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const checkUrl = cleanText(request.query?.check || '').slice(0, 2048);
  if (checkUrl) {
    try {
      const result = await inspectFramePolicy(checkUrl);
      response.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
      response.status(200).json(result);
    } catch (error) {
      response.status(200).json({ url: checkUrl, embeddable: null, reason: 'check-unavailable' });
    }
    return;
  }

  const query = cleanText(request.query?.q || '').slice(0, 180);
  const locale = resolveLocale(request.query?.country, request.query?.language);
  response.setHeader('Cache-Control', query ? 's-maxage=300, stale-while-revalidate=900' : 's-maxage=900, stale-while-revalidate=3600');
  if (query) {
    let results=[];
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${encodeURIComponent(locale.gl.toLowerCase())}`;
      const html = await getText(searchUrl, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'KlipzaWebKlip/1.0 (+https://klipza-zzz.vercel.app/)' } });
      results = mapDuckDuckGoResults(html, query);
    } catch {}
    let fallback = results.length ? 'duckduckgo' : null;
    if (!results.length) {
      try {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}&ceid=${encodeURIComponent(locale.ceid)}`;
        results = mapNewsSearchResults(await getText(rssUrl), query);
        if (results.length) fallback = 'google-news-rss';
      } catch {}
    }
    if (!results.length) {
      try {
        const githubUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=50`;
        results = mapGitHubSearchResults(await getJSON(githubUrl, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'KlipzaWebKlip/1.0' } }), query);
        if (results.length) fallback = 'github';
      } catch {}
    }
    response.status(200).json({ query, country: request.query?.country || 'BR', language: locale.language, items: results, count: results.length, fallback });
    return;
  }

  const today = dateKey(request.query?.date);
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const since = yesterday.toISOString().slice(0, 10);
  const gdeltQuery = encodeURIComponent('(technology OR science OR climate OR global OR business) NOT celebrity NOT entertainment NOT hollywood');
  const githubBase = 'https://api.github.com/search/repositories?sort=stars&order=desc&per_page=20&';
  const sources = {
    news: `https://news.google.com/rss/search?q=${encodeURIComponent(locale.query)}&hl=${encodeURIComponent(locale.hl)}&gl=${encodeURIComponent(locale.gl)}&ceid=${encodeURIComponent(locale.ceid)}`,
    code: `${githubBase}q=created%3A%3E%3D${since}+language%3AJavaScript`,
    games: `${githubBase}q=created%3A%3E%3D${since}+(topic%3Agame+OR+game+in%3Aname%2Cdescription)`,
    design: `${githubBase}q=created%3A%3E%3D${since}+(topic%3Adesign+OR+design+in%3Aname%2Cdescription)`
  };

  const entries = await Promise.allSettled([
    getText(sources.news).then((value) => ['news', value]),
    getJSON(sources.code).then((value) => ['code', value]),
    getJSON(sources.games).then((value) => ['games', value]),
    getJSON(sources.design).then((value) => ['design', value])
  ]);
  const raw = Object.fromEntries(entries.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value));
  const status = Object.fromEntries(Object.entries(sources).map(([key]) => [key, raw[key] ? 'ok' : 'unavailable']));
  const items = [
    ...(raw.news ? mapGoogleNews(raw.news).slice(0, 20) : []),
    ...(raw.games ? mapRepositories(raw.games, 'games').slice(0, 10) : []),
    ...(raw.code ? mapRepositories(raw.code, 'code').slice(0, 10) : []),
    ...(raw.design ? mapRepositories(raw.design, 'design').slice(0, 10) : [])
  ].slice(0, 50);

  response.status(200).json({ dayKey: today, country: request.query?.country || 'BR', language: locale.language, items, status, count: items.length });
}
