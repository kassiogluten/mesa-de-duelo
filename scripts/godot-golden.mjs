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
const TESTS = ['tests/forgeText.test.mjs', 'tests/short-instruction.test.mjs', 'tests/forge-request.test.mjs', 'tests/table-parts.test.mjs',
  'tests/phase-hud.test.mjs', 'tests/opponent-stops.test.mjs', 'tests/choice-screens.test.mjs', 'tests/wait-alert.test.mjs', 'tests/event-text.test.mjs',
  'tests/history-log.test.mjs', 'tests/board-sweep.test.mjs', 'tests/decks.test.mjs', 'tests/companion.test.mjs', 'tests/conta-merge.test.mjs', 'tests/card-counts.test.mjs'];

/** Listas coladas de verdade para o leitor de listas de Meus decks: os jeitos de exportar de cada site e alguns decks prontos. */
const DECK_LISTS = [
  'Deck\n4 Lightning Bolt (M10) 146\n20 Mountain\n\nSideboard\n2 Duress',
  'About\nName Burn\n\nDeck\n4 Monastery Swiftspear (BRO) 144\n4 Play with Fire (MID) 154\n16 Mountain (DMU) 269\n\nSideboard\n3 Roiling Vortex (ZNR) 156',
  "// Commander\n1 Atraxa, Praetors' Voice\n// Mainboard\n1 Sol Ring\n98 Forest\n// Maybeboard\n1 Mana Crypt",
  'Commander\n1 Krenko, Mob Boss (DDT) 52 *CMDR*\nDeck\n1 Goblin Guide\n98 Mountain\nTokens\n1 Goblin',
  '1 Marwyn, the Nurturer [Commander]\n1 Llanowar Elves [Ramp]\n1 Mana Crypt [Maybeboard]\n97 Forest',
  '4 Lightning Bolt\r\n20 Mountain\r\n\r\n2 Duress\r\n',
  '4x Fire // Ice\n2x Wear//Tear (DGM) 135\nSB: 1 Pithing Needle',
  '1 Sheoldred, the Apocalypse ^Have,#37d67a^\n3 Fable of the Mirror-Breaker (NEO) 141★\n10 Swamp',
  'Companion\n1 Lurrus of the Dream-Den\n\nDeck\n4 Ragavan, Nimble Pilferer\n56 Mountain',
  '# comentário\n4 Counterspell\n+2 Island\n-1 Island\n1,5 Island\nconsidering\n2 Opt',
  '',
  'Deck (60)\n60 Island\nSideboard (15):\n15 Negate',
];

/** O leitor de listas com as listas acima e alguns decks prontos exportados (um de cada formato). */
async function recordDeckLists() {
  const { parseDeckList, exportDeckList, DEFAULT_DECKS } = await import('../src/decks.ts');
  const ready = [];
  for (const deck of DEFAULT_DECKS) if (!ready.some(d => d.format === deck.format)) ready.push(deck);
  return [...DECK_LISTS, ...ready.map(exportDeckList)].map(text => ({ fn: 'parseDeckList', args: [text], out: parseDeckList(text) }));
}

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
    const states = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
    // Só as partidas gravadas (listas de estados); questions.json é dos exemplos das perguntas.
    if (!Array.isArray(states)) continue;
    for (const state of states) {
      const input = state?.input;
      if (!input?.message) continue;
      const args = [{ message: input.message, paying: input.paying, payingFor: input.payingFor, canAutoPay: input.canAutoPay, manaCost: input.manaCost, card: input.card ? { name: input.card.name } : undefined, targeting: input.targeting, selectableStacks: input.selectableStacks }];
      calls.push({ fn: 'shortInstruction', args: JSON.parse(JSON.stringify(args)), out: shortInstruction(args[0]) ?? null });
      calls.push({ fn: 'selectionRequest', args: [input.message], out: selectionRequest(input.message) ?? null });
    }
  }
  return calls;
}

/**
 * Frases de evento além das dos testes de TS: cada evento dos testes do histórico e das partidas gravadas, com e sem
 * os detalhes do histórico, pela mesma vista gravada ({ $view }) que o gancho usa.
 */
async function recordEventCorpus(calls) {
  const { eventDescription } = await import('../src/ui/eventText.ts');
  const { VIEWS } = await import('./godot-golden-record.mjs');
  const keys = VIEWS.eventDescription[0];
  const sets = calls.filter(c => c.fn === 'historyTurns')
    .map(c => ({ events: c.args[0], state: { you: 1, players: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Bruno' }] } }));
  if (existsSync(FIXTURES)) for (const name of readdirSync(FIXTURES).filter(n => n.endsWith('.json'))) {
    const states = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
    if (!Array.isArray(states)) continue;
    const events = new Map();
    for (const s of states) for (const e of s.events ?? []) events.set(e.seq, e);
    const last = states.at(-1);
    sets.push({ events: [...events.values()], state: { you: last.you, players: last.players.map(p => ({ id: p.id, name: p.name })) }, all: last });
  }
  const out = [];
  for (const { events, state, all } of sets) {
    const cards = new Map();
    for (const e of events) for (const p of e.frame?.players ?? []) for (const c of p.battlefield ?? []) cards.set(c.id, c);
    for (const p of all?.players ?? []) for (const zone of ['battlefield', 'hand', 'graveyard', 'exile']) for (const c of p[zone] ?? []) cards.set(c.id, c);
    for (const event of events) for (const detailed of [false, true]) {
      const saved = {};
      const rec = (fn, f) => (...a) => { const r = f(...a); (saved[fn] ??= {})[keys[fn](...a)] = r; return r; };
      const view = { state: rec('state', () => state), label: rec('label', c => c.name), findCard: rec('findCard', id => cards.get(id)), ptName: rec('ptName', () => undefined) };
      const text = eventDescription(view, event, detailed);
      out.push(JSON.parse(JSON.stringify({ fn: 'eventDescription', args: [{ $view: { $calls: saved } }, event, detailed], out: text })));
    }
  }
  return out;
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
  const fromTests = recordFromTests();
  const grouped = group([...fromTests, ...await recordFromMatches(), ...await recordEventCorpus(fromTests), ...await recordDeckLists()]);
  mkdirSync(GOLDEN_DIR, { recursive: true });
  for (const [fn, cases] of Object.entries(grouped)) writeFileSync(join(GOLDEN_DIR, `${fn}.json`), JSON.stringify(cases, null, 1) + '\n');
  console.log(Object.entries(grouped).map(([fn, cases]) => `${fn}: ${cases.length}`).join(', '));
}
