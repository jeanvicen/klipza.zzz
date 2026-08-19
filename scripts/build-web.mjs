import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const output = resolve(root, 'www');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(resolve(root, 'index.html'), resolve(output, 'index.html'));
await cp(resolve(root, 'manifest.webmanifest'), resolve(output, 'manifest.webmanifest'));
await cp(resolve(root, 'sw.js'), resolve(output, 'sw.js'));
await cp(resolve(root, 'assets'), resolve(output, 'assets'), { recursive: true });
console.log(`Klipza web build criado em ${output}`);
