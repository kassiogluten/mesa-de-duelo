import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const uri = code => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')}`;
const s = await import(uri(await readFile(new URL('../src/ui/cardSearch.ts', import.meta.url), 'utf8')));

test('function search adds otag: next to text, colors and type', () => {
  assert.equal(s.buildSearchQuery({ func: 'cantrip', type: 't:instant', colors: new Set(['U']) }), 'id<=u t:instant otag:cantrip');
  assert.equal(s.buildSearchQuery({ text: ' raio ', func: 'removal' }), 'raio otag:removal');
  assert.equal(s.buildSearchQuery({ text: 'opt' }), 'opt');
  // Só o nome de tag, sem sintaxe solta que mude a consulta.
  assert.equal(s.buildSearchQuery({ func: 'draw or t:land' }), '');
});

test('the Commander identity limits the search, except when choosing the commander', () => {
  assert.equal(s.buildSearchQuery({ func: 'ramp', identity: ['G', 'W'] }), 'otag:ramp id<=wg');
  assert.equal(s.buildSearchQuery({ func: 'ramp', identity: [] }), 'otag:ramp id:c');
  assert.equal(s.buildSearchQuery({ text: 'atraxa', identity: ['G'], commanderSlot: true }), 'atraxa (is:commander or t:background)');
});

test('every function is a plain Scryfall tag name', () => {
  for (const tag of s.FUNCTION_TAGS) assert.match(tag, /^[a-z]+(-[a-z]+)*$/);
  for (const tag of ['draw', 'removal', 'counterspell', 'ramp', 'cantrip']) assert.ok(s.FUNCTION_TAGS.includes(tag), tag);
});

test('similar cards: same colors, same type group and mana value one away', () => {
  assert.equal(s.typeGroup('Instant'), '(t:instant or t:sorcery)');
  assert.equal(s.typeGroup('Sorcery'), '(t:instant or t:sorcery)');
  assert.equal(s.typeGroup('Artifact Creature — Golem'), 't:creature');
  assert.equal(s.typeGroup('Legendary Planeswalker — Jace'), 't:planeswalker');
  assert.equal(s.typeGroup('Artifact Land'), 't:land');
  assert.equal(s.typeGroup('Enchantment — Aura // Creature'), 't:enchantment');
  assert.equal(s.similarQuery({ type_line: 'Instant', cmc: 1, colors: ['U'] }), 'c=u (t:instant or t:sorcery) mv>=0 mv<=2');
  assert.equal(s.similarQuery({ type_line: 'Creature — Elf Druid', cmc: 1, colors: ['G'] }, ['G', 'B']), 'c=g t:creature mv>=0 mv<=2 id<=bg');
  assert.equal(s.similarQuery({ type_line: 'Artifact', cmc: 2, colors: [] }), 'c=c t:artifact mv>=1 mv<=3');
  // Terrenos: pela identidade de cor, sem custo.
  assert.equal(s.similarQuery({ type_line: 'Land', cmc: 0, colors: [], color_identity: ['U', 'B'] }), 'id=ub t:land');
});
