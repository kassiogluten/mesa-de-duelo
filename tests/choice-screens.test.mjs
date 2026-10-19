import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const cardtext = uri(await readFile(new URL('../src/ui/cardtext.ts', import.meta.url), 'utf8'));
const load = async file => import(uri((await readFile(new URL(`../src/ui/${file}`, import.meta.url), 'utf8')).replace("'./cardtext'", JSON.stringify(cardtext))));
const screens = await load('choiceScreens.ts');
const bar = await load('matchBar.ts');

const warden = { id: 7, name: 'Soul Warden', tapped: false, token: false };
const triggers = { id: 1, method: 'order', kind: 'order', purpose: 'triggers', title: 'Reordenar', options: [
  { kind: 'ability', card: warden, label: 'a', ability: 'Whenever another creature enters, you gain 1 life.' },
  { kind: 'ability', card: warden, label: 'a', ability: 'Whenever another creature enters, you gain 1 life.' },
  { kind: 'ability', card: { ...warden, id: 8, name: 'Elvish Visionary' }, label: 'b', ability: 'When this enters, draw a card.' },
] };

test('tapping fixes the next position and keeps the rest in their order', () => {
  const t = screens.newTriggerOrder(3);
  assert.equal(screens.tapTrigger(t, 2), true);
  assert.deepEqual(t.order, [2, 0, 1]); assert.equal(t.placed, 1);
  assert.equal(screens.tapTrigger(t, 2), false, 'a placed trigger stays where it is');
  screens.tapTrigger(t, 1);
  assert.deepEqual(t.order, [2, 1, 0]); assert.equal(t.placed, 2);
  assert.equal(screens.undoTrigger(t), true);
  assert.deepEqual(t.order, [2, 0, 1]); assert.equal(t.placed, 1);
});

test('dragging and arrow keys move a trigger and clamp at the ends', () => {
  const t = screens.newTriggerOrder(3);
  assert.equal(screens.moveTrigger(t, 0, 2), true);
  assert.deepEqual(t.order, [1, 2, 0]);
  assert.equal(screens.moveTrigger(t, 0, -1), false);
  screens.moveTrigger(t, 2, 9);
  assert.deepEqual(t.order, [1, 2, 0]);
});

test('identical triggers are marked without being merged', () => {
  assert.deepEqual(screens.duplicateCounts(triggers), [2, 2, 1]);
  const html = screens.triggerOrderHTML(triggers, screens.newTriggerOrder(3), () => '<div class="face"></div>', c => c.name);
  assert.equal((html.match(/data-trigger="/g) ?? []).length, 3);
  assert.equal((html.match(/trigger-dup/g) ?? []).length, 2);
  assert.match(html, /Posição 1 de 3, resolve primeiro/);
  assert.match(html, /Posição 3 de 3, resolve por último/);
  assert.match(html, /data-q-keep/);
});

test('play options get Portuguese names, symbols for mana and spelled-out extra costs', () => {
  const q = { id: 2, method: 'getAbilityToPlay', kind: 'choose', purpose: 'play-mode', title: 'Qual habilidade usar?', min: 0, max: 1,
    card: { id: 3, name: 'Street Wraith', manaCost: '{3}{B}{B}', tapped: false, token: false }, options: [
      { label: 'x', mode: 'cast', spell: true, cost: '{3}{B}{B}', extra: [] },
      { label: 'y', mode: 'cycling', cost: '', extra: ['Pay 2 life', 'Discard this card'] },
      { label: 'z', mode: 'ability', cost: '{T}', extra: [], description: 'Add {B}.' },
    ] };
  const choices = screens.playChoices(q);
  assert.deepEqual(choices.map(c => c.name), ['Conjurar', 'Reciclar', 'Habilidade']);
  assert.equal(choices[0].recommended, true);
  assert.deepEqual(choices[1].extra, ['Pagar 2 de vida']);
  assert.equal(choices[2].detail, 'Add {B}.');
  const html = screens.playModeHTML(q, () => '', c => c.name);
  assert.match(html, /Como jogar Street Wraith\?/);
  assert.match(html, /class="pip/);
  assert.match(html, /data-q-none>Cancelar/);
});

test('two ways to cast the same card call the non-printed one the alternative cost', () => {
  const q = { id: 4, method: 'getAbilityToPlay', kind: 'choose', min: 0, max: 1, card: { id: 5, name: 'Fireblast', manaCost: '{4}{R}{R}' }, options: [
    { label: 'a', mode: 'cast', spell: true, cost: '{4}{R}{R}', extra: [] },
    { label: 'b', mode: 'cast', spell: true, cost: '', extra: ['sacrificar 2 Montanhas'] },
  ] };
  assert.deepEqual(screens.playChoices(q).map(c => [c.name, c.recommended]), [['Conjurar', true], ['Custo alternativo', false]]);
});

test('activated abilities of a permanent ask which ability, not how to play', () => {
  const q = { id: 6, method: 'getAbilityToPlay', kind: 'choose', min: 0, max: 1, card: { id: 9, name: 'Relic' }, options: [
    { label: 'a', mode: 'ability', cost: '{1}', extra: [], description: 'Draw a card.' },
    { label: 'b', mode: 'ability', cost: '{2}', extra: [], description: 'Scry 1.' },
  ] };
  assert.match(screens.playModeHTML(q, () => '', c => c.name), /Qual habilidade de Relic usar\?/);
  assert.deepEqual(screens.playChoices(q).map(c => c.name), ['Habilidade 1', 'Habilidade 2']);
});

test('the top bar shows format, room, series and who dropped', () => {
  const s = { config: { format: 'pauper', matchLength: 'bo3' }, match: { gameNumber: 2, wins: [1, 0] },
    room: { code: 'K7QM', seat: 0, players: [{ name: 'Ana', connected: true, seat: 0 }, { name: 'Bia', connected: false, seat: 1 }] } };
  assert.deepEqual(bar.matchChips(s).map(c => c.text), ['Pauper', 'Sala K7QM', 'Jogo 2 · 1 × 0', 'Bia desconectado']);
  assert.deepEqual(bar.matchChips({ config: { format: 'free', matchLength: 'bo1' } }).map(c => c.kind), ['format']);
  assert.match(bar.matchBarHTML(s), /<li class="match-chip room"/);
});

test('leveling up a Class says which level it reaches', () => {
  const q = { id: 7, method: 'getAbilityToPlay', kind: 'choose', min: 0, max: 1, card: { id: 11, name: 'Druid Class', classLevel: 1, classMaxLevel: 3 }, options: [
    { label: 'a', mode: 'class-level', level: 2, cost: '{2}{G}', extra: [] },
    { label: 'b', mode: 'ability', cost: '{T}', extra: [], description: 'Add {G}.' },
  ] };
  assert.equal(screens.playChoices(q)[0].name, 'Subir para o nível 2');
  assert.match(screens.playModeHTML(q, () => '', c => c.name), /Qual habilidade de Druid Class usar\?/);
});
