const BLOCKED_TERMS = [
  'celebrity', 'celebrities', 'famous', 'influencer', 'hollywood', 'reality show',
  'gossip', 'entertainment', 'red carpet', 'celebridade', 'famoso', 'famosa',
  'influenciador', 'influenciadora', 'fofoca', 'entretenimento', 'executor',
  'activator', 'activation', 'without subscription', 'no subscription', 'crack',
  'keygen', 'piracy', 'pirated', 'torrent', 'cheat', 'cheats', 'aimbot',
  'stealer', 'malware', 'ransomware', 'phishing', 'credential', 'token grabber',
  'password dump', 'bypass', 'no more refusals', 'auto claim points', 'nsfw', 'porn'
];

const NEWS_TERMS = ['celebrity', 'celebrities', 'gossip', 'entertainment', 'hollywood', 'celebridade', 'famosos', 'fofoca'];

function cleanText(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function hasBlockedTerm(value, terms = BLOCKED_TERMS) {
  const normalized = cleanText(value).toLowerCase();
  return terms.some((term) => normalized.includes(term));
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

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const today = dateKey(request.query?.date);
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const since = yesterday.toISOString().slice(0, 10);
  const gdeltQuery = encodeURIComponent('(technology OR science OR climate OR global OR business) NOT celebrity');
  const githubBase = 'https://api.github.com/search/repositories?sort=stars&order=desc&per_page=20&';
  const sources = {
    news: `https://news.google.com/rss/search?q=${encodeURIComponent('world OR science OR technology OR climate OR business when:1d')}&hl=en-US&gl=US&ceid=US:en`,
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

  response.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  response.status(200).json({ dayKey: today, items, status, count: items.length });
}
