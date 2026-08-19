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
  }
}

console.log(`webklip search OK — feed=${feed.payload.items.length}, search=${search.payload.items.length}, status=${search.statusCode}`);
