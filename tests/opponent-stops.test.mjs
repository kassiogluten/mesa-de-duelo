import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const { OpponentStopsPreference, OPPONENT_STOPS_KEY, normalizeStops, stopsOptionsHTML, holdingStop } = await import(uri((await readFile(new URL('../src/ui/opponentStops.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));

function fixture(saved) {
  const data = new Map(saved === undefined ? [] : [[OPPONENT_STOPS_KEY, saved]]);
  const sent = [];
  const preference = new OpponentStopsPreference(message => sent.push(message), { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  return { preference, sent, data };
}
const prefs = opponentStops => ({ autoPassNoActions: true, opponentStops });

test('steps are validated and kept in turn order', () => {
  assert.deepEqual(normalizeStops(['END_OF_TURN', 'UPKEEP', 'UPKEEP']), ['UPKEEP', 'END_OF_TURN']);
  for (const bad of [undefined, null, 'UPKEEP', ['UNTAP'], ['CLEANUP'], [1]]) assert.equal(normalizeStops(bad), null);
});

test('old bridges without the preference never receive it', () => {
  const { preference: p, sent } = fixture();
  p.observe({ autoPassNoActions: true }, true);
  p.toggle('UPKEEP');
  assert.equal(p.supported, false); assert.deepEqual(sent, []);
});

test('a saved browser choice applies once; the seat choice is adopted otherwise', () => {
  const saved = fixture(JSON.stringify(['DRAW']));
  saved.preference.observe(prefs([]), true);
  assert.deepEqual(saved.sent, [{ type: 'preferences', opponentStops: ['DRAW'] }]);
  saved.preference.observe(prefs([]), true);
  saved.preference.observe(prefs(['DRAW']), true);
  saved.preference.observe(prefs(['DRAW']), true);
  assert.equal(saved.sent.length, 1); assert.equal(saved.preference.pending, null);

  for (const stored of [undefined, 'not json', '["UNTAP"]']) {
    const fresh = fixture(stored);
    fresh.preference.observe(prefs(['MAIN1']), true);
    assert.deepEqual(fresh.preference.value, ['MAIN1']);
    assert.deepEqual(fresh.sent, [{ type: 'preferences', opponentStops: ['MAIN1'] }]);
  }
});

test('rapid toggles keep one request in flight and stale echoes do not undo the newest choice', () => {
  const { preference: p, sent, data } = fixture();
  p.observe(prefs([]), true);
  p.observe(prefs([]), true);
  p.toggle('END_OF_TURN'); p.toggle('UPKEEP');
  assert.deepEqual(sent.at(-1), { type: 'preferences', opponentStops: ['END_OF_TURN'] });
  p.observe(prefs([]), true);
  assert.deepEqual(p.value, ['UPKEEP', 'END_OF_TURN']);
  p.observe(prefs(['END_OF_TURN']), true);
  assert.deepEqual(sent.at(-1), { type: 'preferences', opponentStops: ['UPKEEP', 'END_OF_TURN'] });
  p.observe(prefs(['UPKEEP', 'END_OF_TURN']), true);
  assert.equal(p.pending, null);
  p.toggle('UPKEEP');
  assert.deepEqual(p.value, ['END_OF_TURN']);
  assert.equal(data.get(OPPONENT_STOPS_KEY), '["END_OF_TURN"]');
  p.toggle('CLEANUP');
  assert.deepEqual(p.value, ['END_OF_TURN']);
});

test('the options buttons say which steps are marked, and holding needs an opponent turn with an empty stack', () => {
  const html = stopsOptionsHTML(['UPKEEP'], true);
  assert.equal((html.match(/data-stop=/g) ?? []).length, 10);
  assert.match(html, /data-stop="UPKEEP" aria-pressed="true">Manutenção/);
  assert.match(html, /data-stop="DRAW" aria-pressed="false">Compra/);
  assert.match(stopsOptionsHTML([], false), /disabled/);
  const s = { activePlayer: 2, you: 1, phase: 'UPKEEP', stack: [] };
  assert.equal(holdingStop(s, ['UPKEEP']), true);
  assert.equal(holdingStop({ ...s, activePlayer: 1 }, ['UPKEEP']), false);
  assert.equal(holdingStop({ ...s, stack: [{}] }, ['UPKEEP']), false);
  assert.equal(holdingStop(s, ['DRAW']), false);
});

test('the track menu lists only the steps of the chosen group', async () => {
  const { stopMenuHTML } = await import(uri((await readFile(new URL('../src/ui/opponentStops.ts', import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));
  const combat = stopMenuHTML('combat', 'Combate', ['COMBAT_END']);
  assert.equal((combat.match(/data-stop=/g) ?? []).length, 5);
  assert.match(combat, /Combate · turno do oponente/);
  assert.match(combat, /data-stop="COMBAT_END" aria-pressed="true"/);
  assert.match(combat, /todos os oponentes/);
  assert.equal((stopMenuHTML('start', 'Início', []).match(/data-stop=/g) ?? []).length, 2);
});
