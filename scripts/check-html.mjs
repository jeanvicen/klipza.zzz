import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('Nenhum script inline foi encontrado em index.html');
new Function(match[1]);

for (const file of [
  'manifest.webmanifest',
  'vercel.json',
  'sw.js',
  'assets/klipza-mark.png',
  'assets/icon-192.png',
  'assets/icon-512.png'
]) {
  await access(resolve(root, file));
}

const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (manifest.name !== 'Klipza.IA' || manifest.icons.length < 2 || manifest.display !== 'standalone') {
  throw new Error('Manifesto PWA incompleto');
}

for (const marker of [
  'id="webKlipToggle"',
  'webKlipSearchInput',
  'id="webKlipBack"',
  'webklip-iframe',
  'WEBKLIP_PAGE_SIZE=18',
  'WEBKLIP_ROTATION_MS=25000',
  'WEBKLIP_CACHE_KEY=\'klipza_webklip_daily_v2\'',
  '/api/webklip?date=',
  '/api/webklip?q=',
  'Codar com referência'
]) {
  if (!html.includes(marker)) throw new Error(`Integração web.klip ausente: ${marker}`);
}

const api = await readFile(resolve(root, 'api/webklip.js'), 'utf8');
for (const marker of [
  'news.google.com/rss/search',
  'country',
  '.slice(0, 50)',
  'celebrity',
  'malware',
  'piracy'
]) {
  if (!api.includes(marker)) throw new Error(`Proteção do endpoint ausente: ${marker}`);
}

console.log('check:html OK — PWA, web.klip, endpoint, filtros e ícones encontrados.');
