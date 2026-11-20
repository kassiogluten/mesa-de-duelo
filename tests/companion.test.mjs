import assert from 'node:assert/strict';
import { test } from 'node:test';
const decks = await import('../src/decks.ts');
const { validateDeckLocal } = await import('../src/ui/deckRules.ts');
const { COMPANION_FILTER, commanderSideboardExtra, deckCompanion, isCompanionCard } = await import('../src/ui/companion.ts');
const { cachePut } = await import('../src/scryfall.ts');

const card = (name, values = {}) => cachePut({ name, layout: 'normal', type_line: 'Creature', cmc: 3, legalities: { commander: 'legal' }, fetchedAt: Date.now(), oracle_id: name, v: 3, color_identity: ['W', 'B'], ...values });
card('Lurrus of the Dream-Den', { oracle_text: 'Companion — Each permanent card in your starting deck has mana value 2 or less.\nLifelink' });
card('Ayli, Eternal Pilgrim', { type_line: 'Legendary Creature — Kor Cleric' });
card('Swords to Plowshares', { oracle_text: 'Exile target creature.', color_identity: ['W'] });
card('Lutri, the Spellchaser', { oracle_text: 'Companion — Each nonland card in your starting deck has a different name.\nFlash', color_identity: ['U', 'R'] });
card('Plains', { type_line: 'Basic Land — Plains', color_identity: [] });

const commander = (sideboard) => ({ id: 'c', name: 'Lurrus', format: 'commander', commanders: [{ name: 'Ayli, Eternal Pilgrim', count: 1 }], cards: [{ name: 'Plains', count: 99 }], sideboard });

test('a carta com Companheiro é o companheiro do deck de Commander; outra carta no sideboard volta à aba Sideboard', () => {
  assert.equal(isCompanionCard('Lurrus of the Dream-Den'), true);
  assert.equal(isCompanionCard('Swords to Plowshares'), false);
  assert.equal(isCompanionCard('Carta que o Scryfall ainda não mandou'), null);
  assert.equal(deckCompanion(commander([{ name: 'Lurrus of the Dream-Den', count: 1 }]))?.name, 'Lurrus of the Dream-Den');
  assert.equal(deckCompanion(commander([{ name: 'Swords to Plowshares', count: 1 }])), null);
  assert.equal(deckCompanion({ ...commander([{ name: 'Lurrus of the Dream-Den', count: 1 }]), format: 'pauper' }), null);
  assert.equal(commanderSideboardExtra(commander([{ name: 'Lurrus of the Dream-Den', count: 1 }])), false);
  assert.equal(commanderSideboardExtra(commander([{ name: 'Lurrus of the Dream-Den', count: 1 }, { name: 'Swords to Plowshares', count: 1 }])), true);
});

test('a conferência local aceita só o companheiro fora das 100', () => {
  const codes = deck => validateDeckLocal(deck).issues.map(i => i.code);
  assert.ok(!codes(commander([{ name: 'Lurrus of the Dream-Den', count: 1 }])).includes('sideboard_count'));
  const extra = validateDeckLocal(commander([{ name: 'Swords to Plowshares', count: 1 }])).issues.find(i => i.code === 'sideboard_count');
  assert.equal(extra?.message, 'No Commander, fora das 100 cartas só cabe um companheiro.');
});

test('a seção Companion das listas entra como companheiro e sai com o mesmo título', () => {
  const parsed = decks.parseDeckList('Commander\n1 Ayli, Eternal Pilgrim\n\nDeck\n99 Plains\n\nCompanion\n1 Lurrus of the Dream-Den');
  assert.deepEqual(parsed.sideboard.map(e => e.name), ['Lurrus of the Dream-Den']);
  assert.deepEqual(parsed.ignored, []);
  const text = decks.exportDeckList(commander([{ name: 'Lurrus of the Dream-Den', count: 1 }]));
  assert.match(text, /\n\nCompanion\n1 Lurrus of the Dream-Den\n$/);
  assert.match(decks.exportDeckList({ ...commander([{ name: 'Duress', count: 1 }]), format: 'pauper' }), /\n\nSideboard\n1 Duress\n$/);
});

test('o Lutri não pode ser companheiro no Commander, e a busca da vaga não o traz', () => {
  const issue = validateDeckLocal(commander([{ name: 'Lutri, the Spellchaser', count: 1 }])).issues.find(i => i.code === 'banned_companion');
  assert.match(issue?.message ?? '', /não pode ser companheiro no Commander; vale só no deck ou como comandante/);
  assert.ok(!validateDeckLocal(commander([{ name: 'Lurrus of the Dream-Den', count: 1 }])).issues.some(i => i.code === 'banned_companion'));
  assert.equal(COMPANION_FILTER, 'keyword:companion -!"Lutri, the Spellchaser"');
});
