import handler from '../api/webklip.js';

const response = {
  statusCode: 200,
  headers: {},
  body: null,
  setHeader(name, value) { this.headers[name] = value; },
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; }
};

await handler({ method: 'GET', query: { date: new Date().toISOString().slice(0, 10) } }, response);
if (response.statusCode !== 200 || !response.body || !Array.isArray(response.body.items)) {
  throw new Error(`Endpoint inválido: status ${response.statusCode}`);
}
if (response.body.items.length > 50) throw new Error('Endpoint retornou mais de 50 itens');
const serialized = JSON.stringify(response.body.items).toLowerCase();
for (const term of ['celebrity', 'executor', 'activator', 'malware', 'piracy', 'cheat']) {
  if (serialized.includes(term)) throw new Error(`Termo bloqueado encontrado: ${term}`);
}
console.log(JSON.stringify({ status: response.statusCode, count: response.body.count, sources: response.body.status }, null, 2));
