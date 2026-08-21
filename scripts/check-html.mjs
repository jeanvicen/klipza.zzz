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
  'supabase/migrations/20260820000003_billing.sql',
  'supabase/migrations/20260820000004_prime_only.sql',
  'admin.html',
  'Studio.html',
  'api/admin-users.js',
  'api/webklip.js',
  'legal/document.css',
  'legal/guia-do-klipza.html',
  'legal/termos-de-uso.html',
  'legal/politica-de-privacidade.html',
  'legal/compras-e-prime.html',
  'legal/retencao-e-inatividade.html',
  'docs/refactor-audit-20260821.md'
]) {
  await access(resolve(root, file));
}

const manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
if (manifest.name !== 'Klipza.IA' || manifest.icons.length < 2 || manifest.display !== 'standalone') {
  throw new Error('Manifesto PWA incompleto');
}

for (const marker of [
  'id="headNew"',
  'class="nav-expand"',
  'id="webKlipSubnav"',
  'data-view="webklip"',
  'id="webKlipSearchInput"',
  'id="webKlipSearchForm"',
  'webKlipOpenExternal',
  'nativeInAppBrowser',
  'capacitor-inappbrowser.js',
  'WEBKLIP_PAGE_SIZE=18',
  '/api/webklip?q=',
  '/api/webklip?check=',
  'Usar no chat',
  'webklip-search-empty',
  'prime-benefit-grid',
  'Abrir Klipza.Prime',
  'touch_user_activity',
  'data-password-toggle="authPassword"',
  'data-password-toggle="authPasswordConfirm"',
  'authPasswordStrength',
  'authRecoveryPasswordStrength',
  'passwordIsStrong',
  'uppercase:/[A-Z]/',
  'special:/[^A-Za-z0-9\\s]/',
  'Em desenvolvimento',
  'Nenhuma cobrança',
  'href="/Studio.html"',
  'Studio Klip'
]) {
  if (!html.includes(marker)) throw new Error(`Integração ou estado esperado ausente: ${marker}`);
}

const api = await readFile(resolve(root, 'api/webklip.js'), 'utf8');
const adminApi = await readFile(resolve(root, 'api/admin-users.js'), 'utf8');
for (const marker of ['SUPABASE_SERVICE_ROLE_KEY', 'auth.admin.listUsers', 'auth.admin.deleteUser', 'admin_audit_log', 'is_admin']) {
  if (!adminApi.includes(marker)) throw new Error(`Painel administrativo inseguro ou incompleto: ${marker}`);
}

for (const marker of [
  'news.google.com/rss/search',
  'country',
  'q=',
  'inspectFramePolicy',
  'frame-ancestors',
  'celebrity',
  'malware',
  'piracy',
  'isPrivateAddress',
  'MAX_FRAME_REDIRECTS',
  'node:dns/promises'
]) {
  if (!api.includes(marker)) throw new Error(`Proteção ou pesquisa do endpoint ausente: ${marker}`);
}

console.log('check:html OK — PWA, web.klip, Studio Klip, Auth, ciclo de vida, recursos pagos em desenvolvimento, documentos, endpoint seguro e ícones encontrados.');
