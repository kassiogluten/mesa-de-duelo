// Comandos do navegador para os testes *.browser.mjs e o scripts/print-novidade.mjs (agent-browser, versão do package.json).
// Rode os testes com `npm run test:browser`, que sobe a mesa sozinho e passa o endereço em TABLE_TEST_URL.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const TABLE_URL = (process.env.TABLE_TEST_URL ?? 'http://localhost:5173').replace(/\/$/, '');
// Chamado direto pelo node, sem shell: seletores com espaço e aspas chegam inteiros também no Windows.
const CLI = fileURLToPath(new URL('../node_modules/agent-browser/bin/agent-browser.js', import.meta.url));

export function browserSession(session) {
  const args = a => [CLI, '--session', session, ...a];
  // O primeiro comando sobe o navegador em segundo plano; com a saída presa num pipe o processo travaria.
  execFileSync(process.execPath, args(['open', 'about:blank']), { stdio: 'ignore' });
  const run = (...a) => execFileSync(process.execPath, args(a), { encoding: 'utf8' }).trim();
  const evaluate = code => JSON.parse(execFileSync(process.execPath, args(['eval', '--stdin']), { input: `(async () => {${code}})()`, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim());
  return { run, evaluate };
}
