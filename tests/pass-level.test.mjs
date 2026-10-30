import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const load = async file => import(uri((await readFile(new URL(file, import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));
const { PassLevelPreference, PASS_LEVELS, PASS_LEVEL_KEY, LEGACY_AUTO_PASS_KEY, LEGACY_PASS_RESPONSES_KEY, PASS_LEVEL_ALWAYS, savedPassLevel, passLevelBadgeHTML, passMenuHTML } = await load('../src/ui/passLevel.ts');
const { stopMenuHTML } = await load('../src/ui/opponentStops.ts');
const { SYNCED_PREFS } = await import(uri(await readFile(new URL('../src/conta/prefs.ts', import.meta.url), 'utf8')));

function storage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function fixture(entries) {
  const store = storage(entries), sent = [];
  return { preference: new PassLevelPreference(message => sent.push(message), store), sent, data: store.data };
}
const prefs = (passLevel, extra = {}) => ({ autoPassNoActions: passLevel !== 'sempre', passLevel, opponentStops: [], ...extra });

test('four levels, from the most careful to the fastest, with "Só com ações" as the default', () => {
  assert.deepEqual(PASS_LEVELS.map(l => l.name), ['Parar sempre', 'Só com ações', 'Respostas', 'Só quando me afeta']);
  assert.equal(new PassLevelPreference(() => {}, storage()).value, 'acoes');
});

test('the old switches become the equivalent level without losing the choice', () => {
  const level = entries => savedPassLevel(storage(entries));
  assert.equal(level({}), null, 'nothing saved: the seat choice is adopted');
  assert.equal(level({ [LEGACY_AUTO_PASS_KEY]: 'true' }), 'acoes');
  assert.equal(level({ [LEGACY_AUTO_PASS_KEY]: 'false' }), 'sempre');
  assert.equal(level({ [LEGACY_PASS_RESPONSES_KEY]: 'true' }), 'respostas');
  assert.equal(level({ [LEGACY_AUTO_PASS_KEY]: 'true', [LEGACY_PASS_RESPONSES_KEY]: 'false' }), 'acoes');
  assert.equal(level({ [LEGACY_AUTO_PASS_KEY]: 'false', [LEGACY_PASS_RESPONSES_KEY]: 'true' }), 'respostas', 'the visible per-game choice wins');
  assert.equal(level({ [PASS_LEVEL_KEY]: 'afeta', [LEGACY_AUTO_PASS_KEY]: 'false' }), 'afeta', 'the level wins over the old switches');
  assert.equal(level({ [PASS_LEVEL_KEY]: 'rapido', [LEGACY_PASS_RESPONSES_KEY]: 'true' }), 'respostas', 'an invalid level falls back to the switches');
});

test('the migrated level is saved, so it follows the account like the other preferences', () => {
  const { preference, data } = fixture({ [LEGACY_PASS_RESPONSES_KEY]: 'true' });
  assert.equal(preference.value, 'respostas');
  assert.equal(data.get(PASS_LEVEL_KEY), 'respostas');
  assert.ok(SYNCED_PREFS.includes(PASS_LEVEL_KEY));
  for (const key of [LEGACY_AUTO_PASS_KEY, LEGACY_PASS_RESPONSES_KEY]) assert.ok(SYNCED_PREFS.includes(key), 'older devices keep syncing their switches');
});

test('old bridges without the level never receive it', () => {
  const { preference: p, sent } = fixture({ [PASS_LEVEL_KEY]: 'sempre' });
  p.observe({ autoPassNoActions: true, passResponses: false }, true);
  p.change('afeta');
  assert.equal(p.supported, false); assert.equal(p.value, 'sempre'); assert.deepEqual(sent, []);
});

test('a browser choice applies once; a new browser adopts the seat level', () => {
  const saved = fixture({ [LEGACY_AUTO_PASS_KEY]: 'false' });
  saved.preference.observe(prefs('acoes'), true);
  assert.deepEqual(saved.sent, [{ type: 'preferences', passLevel: 'sempre' }]);
  saved.preference.observe(prefs('acoes'), true);
  saved.preference.observe(prefs('sempre'), true);
  saved.preference.observe(prefs('sempre'), true);
  assert.equal(saved.sent.length, 1); assert.equal(saved.preference.pending, null);

  const fresh = fixture();
  fresh.preference.observe(prefs('afeta'), true);
  assert.equal(fresh.preference.value, 'afeta');
  assert.deepEqual(fresh.sent, [{ type: 'preferences', passLevel: 'afeta' }]);
});

test('quick changes keep one request in flight and save the old switches for older versions', () => {
  const { preference: p, sent, data } = fixture();
  p.observe(prefs('acoes'), true); p.observe(prefs('acoes'), true);
  p.change('respostas'); p.change('afeta');
  assert.deepEqual(sent.map(m => m.passLevel), ['acoes', 'respostas']);
  p.observe(prefs('acoes'), true);
  assert.equal(p.value, 'afeta', 'a stale echo does not undo the newest choice');
  p.observe(prefs('respostas'), true);
  assert.deepEqual(sent.at(-1), { type: 'preferences', passLevel: 'afeta' });
  p.observe(prefs('afeta'), true); assert.equal(p.pending, null);
  assert.equal(data.get(PASS_LEVEL_KEY), 'afeta');
  assert.equal(data.get(LEGACY_AUTO_PASS_KEY), 'true'); assert.equal(data.get(LEGACY_PASS_RESPONSES_KEY), 'true');
  p.change('sempre'); p.observe(prefs('sempre'), true);
  assert.equal(data.get(LEGACY_AUTO_PASS_KEY), 'false'); assert.equal(data.get(LEGACY_PASS_RESPONSES_KEY), 'false');
  p.change('rapido'); assert.equal(p.value, 'sempre');
});

test('"Passar até o fim do turno" follows the bridge: on while it runs, off when the turn ends or something affects you', () => {
  const { preference: p } = fixture();
  p.observe(prefs('acoes'), true);
  assert.equal(p.passingTurn, false);
  p.observe(prefs('acoes', { passingTurn: true }), true);
  assert.equal(p.passingTurn, true);
  assert.match(passLevelBadgeHTML(p.value, { passingTurn: true, open: false, busy: false }), /class="pass-level passing"[^>]*Passando até o fim do turno/);
  p.observe(prefs('acoes', { passingTurn: false }), true);
  assert.equal(p.passingTurn, false, 'back to the chosen level');
  p.observe(prefs('acoes', { passingTurn: true }), true); p.observe(undefined, false);
  assert.equal(p.passingTurn, false, 'a lost connection does not keep showing the shortcut');
});

test('the badge names the level and opens the quick switch', () => {
  const html = passLevelBadgeHTML('respostas', { passingTurn: false, open: true, busy: true });
  assert.match(html, /data-ui="pass-level"/);
  assert.match(html, /data-level="respostas"/);
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /aria-label="Passar automaticamente: Respostas\. Trocar nível"/);
});

test('the quick switch lists the levels, the one-time shortcut and what always stops', () => {
  const menu = passMenuHTML('afeta', 'available');
  assert.deepEqual([...menu.matchAll(/data-pass-level="(\w+)" aria-checked="(\w+)"/g)].map(m => [m[1], m[2]]),
    [['sempre', 'false'], ['acoes', 'false'], ['respostas', 'false'], ['afeta', 'true']]);
  assert.match(menu, /data-ui="pass-turn-shortcut">/);
  assert.match(menu, /volta ao nível escolhido quando o turno acaba ou quando algo afeta você/);
  assert.ok(menu.includes(PASS_LEVEL_ALWAYS));
  assert.match(PASS_LEVEL_ALWAYS, /etapas marcadas na trilha de fases o jogo sempre para/);
  assert.match(PASS_LEVEL_ALWAYS, /Ataques, bloqueios e escolhas sempre esperam você/);

  assert.match(passMenuHTML('acoes', 'mine'), /data-ui="pass-turn-shortcut" disabled>.*No seu turno, use Fim de turno/s);
  assert.match(passMenuHTML('acoes', 'off'), /data-ui="pass-turn-shortcut" disabled/);
  const on = passMenuHTML('acoes', 'on');
  assert.match(on, /data-ui="pass-turn-stop"/); assert.doesNotMatch(on, /pass-turn-shortcut"/);
});

test('the phase trail menu says marked steps stop in every level', () => {
  const hint = stopMenuHTML('end', 'Final', ['END_OF_TURN']);
  assert.match(hint, /em qualquer nível de passar automaticamente/);
  assert.doesNotMatch(hint, /Passar respostas/);
});
