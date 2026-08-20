import assert from 'node:assert/strict';
import handler from '../api/webklip.js';

async function invoke(check) {
  let statusCode = 200;
  let payload;
  const response = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await handler({ method: 'GET', query: { check } }, response);
  return { statusCode, payload };
}

const google = await invoke('https://www.google.com/');
assert.equal(google.statusCode, 200);
assert.equal(typeof google.payload.embeddable, 'boolean');
assert.equal(google.payload.embeddable, false);

const example = await invoke('https://example.com/');
assert.equal(example.statusCode, 200);
assert.equal(typeof example.payload.embeddable, 'boolean');

console.log(`frame check OK — google=${google.payload.embeddable}, example=${example.payload.embeddable}`);
