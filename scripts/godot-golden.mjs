#!/usr/bin/env node
// Fixtures dourados da mesa no PC: roda os testes de TS dos textos da mesa gravando cada chamada (entrada e saída) e
// acrescenta as entradas reais das partidas gravadas em godot-table/tests/fixtures/. O resultado vai para
// godot-table/tests/golden/<função>.json, que os testes do Godot (tests/test_golden.gd) conferem contra o porte em GDScript.
//   npm run godot:golden
// tests/godot-golden.test.mjs confere que as saídas gravadas ainda são as da mesa do navegador.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const GOLDEN_DIR = join(ROOT, 'godot-table', 'tests', 'golden');
const FIXTURES = join(ROOT, 'godot-table', 'tests', 'fixtures');
const TESTS = ['tests/forgeText.test.mjs', 'tests/short-instruction.test.mjs', 'tests/forge-request.test.mjs', 'tests/table-parts.test.mjs'];

/** Grava as chamadas feitas pelos testes de TS. */
function recordFromTests() {
  const dir = mkdtempSync(join(tmpdir(), 'golden-'));
  const file = join(dir, 'calls.jsonl');
  writeFileSync(file, '');
  const run = spawnSync(process.execPath, ['--import', './tests/register.mjs', '--import', './scripts/godot-golden-record.mjs', '--test', ...TESTS],
    { cwd: ROOT, env: { ...process.env, GOLDEN_RECORD: file }, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`os testes de TS falharam:\n${run.stdout}${run.stderr}`);
  const calls = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  rmSync(dir, { recursive: true, force: true });
  return calls;
}

/** Entradas reais: o pedido de cada estado das partidas gravadas, pela frase curta e pelos pedidos de seleção. */
async function recordFromMatches() {
  const { shortInstruction } = await import('../src/ui/shortInstruction.ts');
  const { selectionRequest } = await import('../src/ui/forgeRequest.ts');
  const calls = [];
  if (!existsSync(FIXTURES)) return calls;
  for (const name of readdirSync(FIXTURES).filter(n => n.endsWith('.json'))) {
    for (const state of JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'))) {
      const input = state?.input;
      if (!input?.message) continue;
      const args = [{ message: input.message, paying: input.paying, payingFor: input.payingFor, canAutoPay: input.canAutoPay, manaCost: input.manaCost, card: input.card ? { name: input.card.name } : undefined, targeting: input.targeting, selectableStacks: input.selectableStacks }];
      calls.push({ fn: 'shortInstruction', args: JSON.parse(JSON.stringify(args)), out: shortInstruction(args[0]) ?? null });
      calls.push({ fn: 'selectionRequest', args: [input.message], out: selectionRequest(input.message) ?? null });
    }
  }
  return calls;
}

/** Junta por função, sem repetir a mesma entrada, numa ordem estável. */
export function group(calls) {
  const out = {};
  for (const call of calls) {
    const key = JSON.stringify([call.args, call.names ?? null]);
    const list = out[call.fn] ??= new Map();
    if (!list.has(key)) list.set(key, call);
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))
    .map(([fn, map]) => [fn, [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, call]) => ({ args: call.args, ...(call.names ? { names: call.names } : {}), out: call.out }))]));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const grouped = group([...recordFromTests(), ...await recordFromMatches()]);
  mkdirSync(GOLDEN_DIR, { recursive: true });
  for (const [fn, cases] of Object.entries(grouped)) writeFileSync(join(GOLDEN_DIR, `${fn}.json`), JSON.stringify(cases, null, 1) + '\n');
  console.log(Object.entries(grouped).map(([fn, cases]) => `${fn}: ${cases.length}`).join(', '));
}
