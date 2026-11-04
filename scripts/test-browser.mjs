#!/usr/bin/env node
// Testes de navegador: sobe a mesa (Vite) numa porta livre, roda cada tests/*.browser.mjs contra ela e desliga.
//   npm run test:browser              todos
//   npm run test:browser -- graveyard só os que têm "graveyard" no nome
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer } from 'vite';

const filter = process.argv[2] ?? '';
const files = readdirSync('tests').filter(f => f.endsWith('.browser.mjs') && f.includes(filter)).sort();
if (!files.length) { console.error(`Nenhum tests/*.browser.mjs com "${filter}"`); process.exit(1); }

const server = await createServer({ server: { port: 5199, strictPort: false, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const failed = [];
// Assíncrono de propósito: o Vite roda neste mesmo processo e precisa responder enquanto o teste usa a mesa.
const run = file => new Promise(resolve => {
  const child = spawn(process.execPath, [`tests/${file}`], { env: { ...process.env, TABLE_TEST_URL: url } });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => { stdout += d; }); child.stderr.on('data', d => { stderr += d; });
  const timer = setTimeout(() => child.kill(), 180_000);
  child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
});
try {
  for (const file of files) {
    const started = Date.now();
    const r = await run(file);
    const ok = r.status === 0;
    console.log(`${ok ? 'ok    ' : 'FALHOU'} ${file} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    if (!ok) { failed.push(file); console.log(((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n').slice(-15).map(l => `       ${l}`).join('\n')); }
  }
} finally {
  await server.close();
}
console.log(`\n${files.length - failed.length}/${files.length} passaram${failed.length ? `; falharam: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
