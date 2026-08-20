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
  'assets/icon-512.png',
  'vendor/supabase.js',
  'supabase/migrations/20260820000001_security_lifecycle.sql',
  'supabase/migrations/20260820000002_cron.sql',
  'admin.html',
  'api/admin-users.js'
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
  'webKlipOpenExternal',
  'nativeInAppBrowser',
  'capacitor-inappbrowser.js',
  'WEBKLIP_PAGE_SIZE=18',
  'WEBKLIP_ROTATION_MS=25000',
  'WEBKLIP_CACHE_KEY=\'klipza_webklip_daily_v2\'',
  '/api/webklip?date=',
  '/api/webklip?q=',
  '/api/webklip?check=',
  'Codar com referência',
  'touch_user_activity',
  'data-password-toggle="authPassword"',
  'data-password-toggle="authPasswordConfirm"',
  'authPasswordStrength',
  'authRecoveryPasswordStrength',
  'passwordIsStrong',
  'uppercase:/[A-Z]/',
  'special:/[^A-Za-z0-9\\s]/'
]) {
  if (!html.includes(marker)) throw new Error(`Integração web.klip ausente: ${marker}`);
}

const api = await readFile(resolve(root, 'api/webklip.js'), 'utf8');
const adminApi = await readFile(resolve(root, 'api/admin-users.js'), 'utf8');
for (const marker of ['SUPABASE_SERVICE_ROLE_KEY', 'auth.admin.listUsers', 'auth.admin.deleteUser', 'admin_audit_log', 'is_admin']) {
  if (!adminApi.includes(marker)) throw new Error(`Painel administrativo inseguro ou incompleto: ${marker}`);
}

for (const marker of [
  'news.google.com/rss/search',
  'country',
  '.slice(0, 50)',
  'inspectFramePolicy',
  'frame-ancestors',
  'celebrity',
  'malware',
  'piracy',
  'isPrivateAddress',
  'MAX_FRAME_REDIRECTS',
  'node:dns/promises'
]) {
  if (!api.includes(marker)) throw new Error(`Proteção do endpoint ausente: ${marker}`);
}

console.log('check:html OK — PWA, web.klip, Supabase Auth, ciclo de vida, endpoint seguro e ícones encontrados.');
