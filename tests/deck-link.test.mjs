import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = await readFile(new URL('../src/deckLink.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseDeckLink, deckLinkToList, edhrecSlug } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

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

test('EDHREC slugs follow the site: front face, no accents or punctuation, partners joined', () => {
  assert.equal(edhrecSlug(["Atraxa, Praetors' Voice"]), 'atraxa-praetors-voice');
  assert.equal(edhrecSlug(['Lim-Dûl the Necromancer']), 'lim-dul-the-necromancer');
  assert.equal(edhrecSlug(['Ratonhnhaké:ton']), 'ratonhnhaketon');
  assert.equal(edhrecSlug(["Y'shtola, Night's Blessed"]), 'yshtola-nights-blessed');
  assert.equal(edhrecSlug(['Esika, God of the Tree // The Prismatic Bridge']), 'esika-god-of-the-tree');
  assert.equal(edhrecSlug(["Kraum, Ludevic's Opus", 'Tymna the Weaver']), 'kraum-ludevics-opus-tymna-the-weaver');
  assert.equal(edhrecSlug(['Æther Snap']), 'aether-snap');
  assert.equal(edhrecSlug(['  The Ur-Dragon ']), 'the-ur-dragon');
  assert.equal(edhrecSlug(['!!!']), '');
  assert.equal(edhrecSlug(['Atraxa', '...']), '');
});

test('EDHREC average-deck and commander links become a validated slug', () => {
  assert.deepEqual(parseDeckLink('https://edhrec.com/average-decks/atraxa-praetors-voice'), { site: 'edhrec', id: 'atraxa-praetors-voice' });
  assert.deepEqual(parseDeckLink('edhrec.com/commanders/Krenko-Mob-Boss?x=1'), { site: 'edhrec', id: 'krenko-mob-boss' });
  assert.deepEqual(parseDeckLink('https://www.edhrec.com/average-decks/atraxa-praetors-voice/budget#top'), { site: 'edhrec', id: 'atraxa-praetors-voice/budget' });
  for (const text of ['https://edhrec.com/cards/sol-ring', 'https://edhrec.com/average-decks/', 'https://edhrec.com/average-decks/a--b', 'https://edhrec.com/average-decks/%2e%2e', 'https://json.edhrec.com/pages/average-decks/x.json']) assert.equal(parseDeckLink(text), null, text);
});

test('EDHREC average deck becomes a Commander list with its origin noted', () => {
  const body = JSON.stringify({
    deck: { commander: ['Commander A', 'Partner B'], cards: {
      Creature: [['Llanowar Elves', 1], ['Commander A', 1]],
      Land: { Basics: [['Forest', 30], ['Island', 2]], Nonbasics: [['Command Tower', 1]] },
      Instant: [['Counterspell', 1], ['', 1], ['Bad', 0], 'junk'],
    } },
    savedate_counts: { '2026-10-18': 3, '2026-10-19': 1, nope: 9 },
    container: { json_dict: { card: { num_decks: 12345 } } },
  });
  const deck = deckLinkToList('edhrec', body, 'commander-a-partner-b');
  assert.equal(deck.name, 'Commander A + Partner B · deck médio');
  assert.deepEqual(deck.origin, { site: 'edhrec', label: 'Commander A + Partner B', url: 'https://edhrec.com/average-decks/commander-a-partner-b', date: '2026-10-19', decks: 12345 });
  assert.match(deck.text, /^\/\/ deck médio do EDHREC para Commander A \+ Partner B, 12\.345 decks publicados, dados até 19\/10\/2026\n\/\/ https:\/\/edhrec\.com\/average-decks\/commander-a-partner-b\n\n/);
  assert.ok(deck.text.endsWith('Commander\n1 Commander A\n1 Partner B\n\nDeck\n1 Llanowar Elves\n30 Forest\n2 Island\n1 Command Tower\n1 Counterspell'));
  assert.throws(() => deckLinkToList('edhrec', JSON.stringify({ deck: { commander: [], cards: {} } }), 'x'), /vazio/);
  assert.throws(() => deckLinkToList('edhrec', '<Error>AccessDenied</Error>', 'x'), /EDHREC/);
});
