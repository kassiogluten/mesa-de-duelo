import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/deckLink.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseDeckLink, deckLinkToList } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('recognizes public Moxfield and Archidekt links, with or without slug and parameters', () => {
  assert.deepEqual(parseDeckLink('https://moxfield.com/decks/AbC_12-x9'), { site: 'moxfield', id: 'AbC_12-x9' });
  assert.deepEqual(parseDeckLink('  www.moxfield.com/decks/AbC_12-x9/primer?x=1 '), { site: 'moxfield', id: 'AbC_12-x9' });
  assert.deepEqual(parseDeckLink('https://archidekt.com/decks/123456/my_deck_name'), { site: 'archidekt', id: '123456' });
  assert.deepEqual(parseDeckLink('archidekt.com/decks/42#main'), { site: 'archidekt', id: '42' });
});

test('anything else stays a pasted list', () => {
  for (const text of ['4 Lightning Bolt', 'https://example.com/decks/abc', 'https://moxfield.com/decks/abc\n4 Bolt', 'moxfield.com/users/x', '']) assert.equal(parseDeckLink(text), null);
});

test('Moxfield boards become Commander, Deck and Sideboard sections', () => {
  const body = JSON.stringify({ name: 'Elfos', boards: {
    commanders: { cards: { a: { quantity: 1, card: { name: 'Lathril, Blade of the Elves' } } } },
    mainboard: { cards: { b: { quantity: 30, card: { name: 'Forest' } }, c: { quantity: 1, card: { name: 'Delver of Secrets // Insectile Aberration' } } } },
    sideboard: { cards: { d: { quantity: 2, card: { name: 'Duress' } } } },
    maybeboard: { cards: { e: { quantity: 1, card: { name: 'Ignored' } } } },
  } });
  assert.deepEqual(deckLinkToList('moxfield', body), { name: 'Elfos',
    text: 'Commander\n1 Lathril, Blade of the Elves\n\nDeck\n30 Forest\n1 Delver of Secrets // Insectile Aberration\n\nSideboard\n2 Duress' });
});

test('Archidekt categories map to sections and Maybeboard stays out', () => {
  const body = JSON.stringify({ name: 'Burn', categories: [{ name: 'Burn', includedInDeck: true }, { name: 'Ideias', includedInDeck: false }], cards: [
    { quantity: 4, card: { oracleCard: { name: 'Lightning Bolt' } }, categories: ['Burn'] },
    { quantity: 20, card: { oracleCard: { name: 'Mountain' } }, categories: [] },
    { quantity: 2, card: { oracleCard: { name: 'Smash to Smithereens' } }, categories: ['Sideboard'] },
    { quantity: 1, card: { oracleCard: { name: 'Fireblast' } }, categories: ['Maybeboard'] },
    { quantity: 1, card: { oracleCard: { name: 'Skred' } }, categories: ['Ideias'] },
  ] });
  assert.deepEqual(deckLinkToList('archidekt', body), { name: 'Burn', text: 'Deck\n4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Smash to Smithereens' });
});

test('empty, private or broken answers give a clear error', () => {
  assert.throws(() => deckLinkToList('moxfield', '<html>'), /não é um deck/);
  assert.throws(() => deckLinkToList('archidekt', JSON.stringify({ name: 'x', cards: [] })), /vazio ou é privado/);
});
