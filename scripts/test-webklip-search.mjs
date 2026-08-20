import assert from 'node:assert/strict';
import handler from '../api/webklip.js';

async function invoke(query) {
  let statusCode = 200;
  let payload;
  const response = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }
  };
  await handler({ method: 'GET', query }, response);
  return { statusCode, payload };
}

const feed = await invoke({ date: '2026-08-19', country: 'BR', language: 'pt-BR' });
assert.equal(feed.statusCode, 200);
assert.ok(Array.isArray(feed.payload.items));
assert.ok(feed.payload.items.length <= 50);
assert.equal(feed.payload.country, 'BR');
assert.equal(feed.payload.language, 'pt-BR');

const search = await invoke({ q: 'open source javascript', country: 'BR', language: 'pt-BR' });
assert.ok([200, 502].includes(search.statusCode));
assert.ok(Array.isArray(search.payload.items));
assert.ok(search.payload.items.length <= 50);
if (search.statusCode === 200) {
  for (const item of search.payload.items) {
    assert.ok(/^https?:$/.test(new URL(item.url).protocol));
    assert.equal(item.category, 'search');
    const text = `${item.title} ${item.summary} ${item.url}`.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    assert.ok(['open', 'source', 'javascript'].some((token) => text.includes(token)), `Resultado sem relação com a consulta: ${item.title}`);
  }
}

const codeSearch = await invoke({ q: 'python game', country: 'BR', language: 'pt-BR' });
assert.equal(codeSearch.statusCode, 200);
assert.ok(Array.isArray(codeSearch.payload.items));
assert.ok(codeSearch.payload.items.length <= 50);
for (const item of codeSearch.payload.items) {
  const text = `${item.title} ${item.summary}`.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  assert.ok(text.includes('python') || text.includes('game'), `Resultado de código sem correspondência: ${item.title}`);
}

const noMatch = await invoke({ q: 'klipzaqzxv-resultado-impossivel-92741', country: 'BR', language: 'pt-BR' });
assert.equal(noMatch.statusCode, 200);
assert.ok(Array.isArray(noMatch.payload.items));
assert.equal(noMatch.payload.items.length, 0, 'Consulta sem correspondência não deve receber resultados aleatórios');

console.log(`webklip search OK — feed=${feed.payload.items.length}, search=${search.payload.items.length}, code=${codeSearch.payload.items.length}, noMatch=${noMatch.payload.items.length}, status=${search.statusCode}`);
