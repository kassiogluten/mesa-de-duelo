#!/usr/bin/env node
// Partidas de verdade: sobe o servidor (forge-bridge) numa porta própria, roda cada forge-bridge/scripts/test-*.mjs
// contra ele e desliga no fim.
//   npm run test:e2e              todos (uns minutos; o primeiro compila o servidor)
//   npm run test:e2e -- undo      só os que têm "undo" no nome
// Precisa do JDK 17 (JAVA_HOME) e do Forge em ~/forge (ou FORGE_DIR).
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const filter = process.argv[2] ?? '';
const dir = 'forge-bridge/scripts';
const files = readdirSync(dir).filter(f => /^test-.*\.mjs$/.test(f) && f.includes(filter)).sort();
if (!files.length) { console.error(`Nenhum ${dir}/test-*.mjs com "${filter}"`); process.exit(1); }

const port = Number(process.env.E2E_PORT ?? 7199);
const endpoint = `ws://127.0.0.1:${port}/ws`;
const windows = process.platform === 'win32';
const javaHome = process.env.JAVA_HOME ?? (windows ? 'C:/Program Files/Eclipse Adoptium/jdk-17.0.20.101-hotspot' : undefined);
const forgeDir = process.env.FORGE_DIR ?? join(homedir(), 'forge');

const log = [];
const server = spawn('mvn', ['-o', '-q', '-B', `-Dforge.dir=${forgeDir}`, 'compile', 'exec:java', `-Dexec.args=--port=${port}`], {
  cwd: 'forge-bridge', shell: windows,
  env: { ...process.env, ...(javaHome ? { JAVA_HOME: javaHome } : {}), MAVEN_OPTS: process.env.MAVEN_OPTS ?? '-Xmx2g', MESA_SLOW_MS: '4000' },
});
server.stdout.on('data', d => log.push(String(d))); server.stderr.on('data', d => log.push(String(d)));
const stop = () => {
  if (server.exitCode !== null) return;
  if (windows) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill('SIGTERM');
};
process.on('exit', stop);

/** Espera o servidor aceitar conexões (a primeira vez compila: pode levar um ou dois minutos). */
async function ready(timeoutMs = 300_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error(`o servidor saiu (código ${server.exitCode}):\n${log.join('').slice(-3000)}`);
    const ok = await new Promise(resolve => {
      const ws = new WebSocket(endpoint);
      ws.onopen = () => { ws.close(); resolve(true); };
      ws.onerror = () => resolve(false);
    });
    if (ok) return;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('o servidor não subiu a tempo');
}

const run = file => new Promise(resolve => {
  const child = spawn(process.execPath, [join(dir, file), endpoint]);
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const timer = setTimeout(() => child.kill(), 240_000);
  child.on('close', status => { clearTimeout(timer); resolve({ status, out }); });
});

const failed = [];
try {
  console.log(`subindo o servidor em ${endpoint}…`);
  await ready();
  for (const file of files) {
    const started = Date.now();
    const r = await run(file);
    const ok = r.status === 0;
    console.log(`${ok ? 'ok    ' : 'FALHOU'} ${file} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    if (!ok) { failed.push(file); console.log(r.out.trim().split('\n').slice(-40).map(l => `       ${l}`).join('\n')); }
  }
} finally {
  stop();
}
console.log(`\n${files.length - failed.length}/${files.length} passaram${failed.length ? `; falharam: ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
