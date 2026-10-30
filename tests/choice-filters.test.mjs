import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const source = file => readFile(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
const cardtext = uri(await source('cardtext.ts'));
const screens = uri((await source('choiceScreens.ts')).replace("'./cardtext'", JSON.stringify(cardtext)));
const filters = await import(uri((await source('choiceFilters.ts')).replace("'./cardtext'", JSON.stringify(cardtext)).replace("'./choiceScreens'", JSON.stringify(screens))));

const card = (id, name, typeLine, manaCost = '') => ({ id, name, typeLine, manaCost, tapped: false, token: false });
// Um tutor num deck de Commander: as opções vêm na ordem do grimório.
const library = [
  card(1, 'Sol Ring', 'Artifact', '{1}'),
  card(2, 'Forest', 'Basic Land — Forest'),
  card(3, 'Llanowar Elves', 'Creature — Elf Druid', '{G}'),
  card(4, 'Lightning Greaves', 'Artifact — Equipment', '{2}'),
  card(5, 'Steel Overseer', 'Artifact Creature — Construct', '{2}'),
  card(6, 'Cultivate', 'Sorcery', '{2}{G}'),
  card(7, 'Counterspell', 'Instant', '{U}{U}'),
  card(8, 'Garruk Wildspeaker', 'Legendary Planeswalker — Garruk', '{2}{G}{G}'),
  card(9, 'Animate Dead', 'Enchantment — Aura', '{1}{B}'),
  card(10, 'Ancient Tomb', 'Land', ''),
];
const tutor = (cards = library, extra = {}) => ({ id: 30, method: 'getChoices', kind: 'choose', title: 'Escolha uma carta', min: 0, max: 1,
  options: cards.map(c => ({ kind: 'card', card: c, label: c.name })), ...extra });
const pt = { 'Llanowar Elves': 'Elfos de Llanowar', 'Counterspell': 'Anular Feitiço', 'Cultivate': 'Cultivar' };
const opts = (sort = 'type', view = filters.newChoiceView(30)) => ({ sort, view, name: c => pt[c.name] ?? c.name, typeLine: c => c.typeLine });

test('types come from the type line, front face only, and a two-type card has both', () => {
  assert.deepEqual(filters.cardTypes('Artifact Creature — Construct'), ['creature', 'artifact']);
  assert.deepEqual(filters.cardTypes('Legendary Enchantment Creature - God'), ['creature', 'enchantment']);
  assert.deepEqual(filters.cardTypes('Instant // Land'), ['instant']);
  assert.deepEqual(filters.cardTypes('Criatura — Elfo Druida'), ['creature'], 'the Portuguese line from Scryfall also works');
  assert.deepEqual(filters.cardTypes('Mágica Instantânea'), ['instant']);
  assert.deepEqual(filters.cardTypes(''), ['other']);
});

test('only large card choices where the order means nothing get filters', () => {
  assert.equal(filters.isFilterableChoice(tutor()), true);
  assert.equal(filters.isFilterableChoice(tutor(library.slice(0, 7))), false, 'a small choice stays as it was');
  assert.equal(filters.isFilterableChoice(tutor(library, { kind: 'order' })), false, 'ordering cards');
  assert.equal(filters.isFilterableChoice(tutor(library, { kind: 'order', purpose: 'triggers' })), false, 'trigger order');
  assert.equal(filters.isFilterableChoice(tutor(library, { purpose: 'library', library: 'bottom' })), false, 'scry and surveil keep the library order');
  assert.equal(filters.isFilterableChoice(tutor(library, { kind: 'reveal' })), false, 'just looking');
  assert.equal(filters.isFilterableChoice({ ...tutor(), options: [...tutor().options, 'Nenhuma'] }), false, 'options that are not cards');
  assert.equal(filters.isFilterableChoice(tutor(library.map((c, i) => i ? c : { ...c, faceDown: true }))), false, 'face-down cards');
});

test('sorting by type groups with a heading, then by cost and name, keeping the original indices', () => {
  const layout = filters.choiceLayout(tutor(), opts('type'));
  assert.deepEqual(layout.groups.map(g => [g.label, g.indices]), [
    ['Criaturas', [2, 4]],
    ['Terrenos', [9, 1]],
    ['Artefatos', [0, 3]],
    ['Encantamentos', [8]],
    ['Planeswalkers', [7]],
    ['Instantâneas', [6]],
    ['Feitiços', [5]],
  ]);
  const all = layout.groups.flatMap(g => g.indices);
  assert.deepEqual([...all].sort((a, b) => a - b), library.map((_, i) => i), 'each option shows up once');
});

test('sorting by cost or by the shown name is one list without headings', () => {
  const cost = filters.choiceLayout(tutor(), opts('cost'));
  assert.equal(cost.groups.length, 1);
  assert.equal(cost.groups[0].label, '');
  assert.deepEqual(cost.groups[0].indices, [9, 1, 2, 0, 8, 6, 3, 4, 5, 7]);
  const byName = filters.choiceLayout(tutor(), opts('name'));
  assert.deepEqual(byName.groups[0].indices.map(i => pt[library[i].name] ?? library[i].name).slice(0, 4), ['Ancient Tomb', 'Animate Dead', 'Anular Feitiço', 'Cultivar']);
});

test('filters list only the types present, with counts, a two-type card counting in both', () => {
  const layout = filters.choiceLayout(tutor(), opts());
  assert.deepEqual(layout.chips.map(c => [c.label, c.count]), [
    ['Todas', 10], ['Criaturas', 2], ['Terrenos', 2], ['Artefatos', 3], ['Encantamentos', 1], ['Planeswalkers', 1], ['Instantâneas', 1], ['Feitiços', 1],
  ]);
  const view = { ...filters.newChoiceView(30), type: 'artifact' };
  const artifacts = filters.choiceLayout(tutor(), opts('type', view));
  assert.deepEqual([...artifacts.visible].sort((a, b) => a - b), [0, 3, 4], 'Steel Overseer is a creature and an artifact');
  assert.deepEqual(artifacts.groups.map(g => g.indices.filter(i => artifacts.visible.has(i))).filter(g => g.length), [[4], [0, 3]], 'it stays under Criaturas');
  const html = filters.choiceToolsHTML(artifacts, 'type', view, []);
  assert.match(html, /data-q-filter="artifact" aria-pressed="true">Artefatos<span class="q-filter-count">3</);
  assert.match(html, /data-q-sort="type" aria-pressed="true"/);
  assert.match(html, /Mostrando 3 de 10 cartas/);
  const heading = filters.choiceGroupHTML(artifacts.groups[1], artifacts);
  assert.match(heading, / hidden>Terrenos<span>0</, 'a group the filter empties hides its heading');
});

test('search by name in Portuguese or English, without accents, only with more than 15 cards', () => {
  assert.equal(filters.choiceLayout(tutor(), opts()).search, false);
  const big = tutor([...library, ...Array.from({ length: 6 }, (_, i) => card(20 + i, `Island ${i}`, 'Basic Land — Island'))]);
  const find = query => { const l = filters.choiceLayout(big, opts('type', { ...filters.newChoiceView(30), query })); return [...l.visible].sort((a, b) => a - b); };
  assert.deepEqual(find('anular feitico'), [6]);
  assert.deepEqual(find('COUNTER'), [6]);
  assert.deepEqual(find('elf'), [2], 'English name of a translated card');
  assert.equal(find('').length, 16);
  assert.match(filters.choiceToolsHTML(filters.choiceLayout(big, opts()), 'type', filters.newChoiceView(30), []), /id="fQSearch"/);
  // Filtro e busca juntos.
  const both = filters.choiceLayout(big, opts('type', { id: 30, type: 'land', query: 'island 1' }));
  assert.deepEqual([...both.visible], [11]);
});

test('picked cards stay picked out of the filter, and the status says so', () => {
  const layout = filters.choiceLayout(tutor(), opts('type', { id: 30, type: 'land', query: '' }));
  assert.equal(filters.choiceStatus(layout, [2, 9]), 'Mostrando 2 de 10 cartas. 1 escolhida fica fora do filtro.');
  assert.equal(filters.choiceStatus(filters.choiceLayout(tutor(), opts()), [2]), '10 cartas.');
});

test('the saved sort falls back to type', () => {
  assert.equal(filters.parseChoiceSort(null), 'type');
  assert.equal(filters.parseChoiceSort('cost'), 'cost');
  assert.equal(filters.parseChoiceSort('qualquer'), 'type');
});
