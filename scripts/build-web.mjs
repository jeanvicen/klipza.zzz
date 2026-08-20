import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = resolve(root, 'www');
const vendor = resolve(output, 'vendor');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(vendor, { recursive: true });

await cp(resolve(root, 'index.html'), resolve(output, 'index.html'));
await cp(resolve(root, 'admin.html'), resolve(output, 'admin.html'));
await cp(resolve(root, 'manifest.webmanifest'), resolve(output, 'manifest.webmanifest'));
await cp(resolve(root, 'sw.js'), resolve(output, 'sw.js'));
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });

const capacitorCore = resolve(root, 'node_modules/@capacitor/core/dist/capacitor.js');
const capacitorInAppBrowser = resolve(root, 'node_modules/@capacitor/inappbrowser/dist/plugin.js');
await cp(capacitorCore, resolve(vendor, 'capacitor.js'));
await cp(capacitorInAppBrowser, resolve(vendor, 'capacitor-inappbrowser.js'));
await cp(resolve(root, 'vendor/supabase.js'), resolve(vendor, 'supabase.js'));
console.log(`Klipza web build criado em ${output}`);
