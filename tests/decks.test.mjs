import assert from 'node:assert/strict';
import { test } from 'node:test';
const decks = await import('../src/decks.ts');
const { applyDeckImport, applyDeckListEdit, deckImportSnapshot, deckListChanges } = await import('../src/ui/deckImport.ts');
const { cardCopyLimit, copiesInDeck, validateDeckLocal } = await import('../src/ui/deckRules.ts');
const { deckArt, deckCover, deckPriceHTML, deckStats, statsHTML } = await import('../src/ui/deckStats.ts');
const { legalityFresh, cachePut } = await import('../src/scryfall.ts');
function storage(initial = {}, failWrites = false) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem(key, value) { if (failWrites) throw new Error('QuotaExceededError'); data.set(key, value); } };
}
const local = storage();
globalThis.localStorage = local;
function cache(name, values = {}) {
  const card = { name, layout: 'normal', type_line: 'Instant', mana_cost: '{R}', cmc: 1, legalities: { pauper: 'legal' }, fetchedAt: Date.now(), oracle_id: name, v: 3, ...values };
  cachePut(card);
  return card;
}
const example = { id: 'personal-123', name: 'Meu deck', cards: [{ name: 'Lightning Bolt', count: 4 }], sideboard: [{ name: 'Duress', count: 2 }], format: 'pauper' };

test('v1 migration preserves IDs, unknown properties, originals, and sideboard', () => {
  const original = JSON.stringify([{ ...example, customField: 'preserve', builtin: true }]);
  const store = storage({ [decks.LEGACY_DECK_KEY]: original });
  const result = decks.readDeckLibrary(store);
  assert.equal(result.error, undefined);
  assert.equal(result.decks[0].id, example.id);
  assert.deepEqual(result.decks[0].sideboard, example.sideboard);
  assert.equal(result.decks[0].customField, 'preserve');
  assert.equal(result.decks[0].builtin, false);
  assert.equal(store.getItem(decks.LEGACY_DECK_KEY), original);
  assert.equal(store.getItem('mesa:decks:v1:backup'), original);
  assert.deepEqual(decks.readDeckLibrary(store).decks, result.decks);
});

test('migration retains malformed records and duplicate IDs for recovery', () => {
  const bad = { id: 'broken', name: 'Old deck', cards: [{ name: 'Forest', count: -1 }] };
  const duplicate = { ...example, name: 'Duplicate record' };
  const store = storage({ [decks.LEGACY_DECK_KEY]: JSON.stringify([example, bad, duplicate]) });
  const result = decks.readDeckLibrary(store);
  assert.equal(result.decks.length, 1);
  assert.deepEqual(result.recovery, [bad, duplicate]);
  assert.ok(result.error);
  assert.deepEqual(decks.readDeckLibrary(store).recovery, [bad, duplicate]);
});

test('corrupt and unknown version storage is preserved byte for byte', () => {
  for (const raw of ['{incomplete', '{"version":99,"decks":[]}']) {
    const store = storage({ [decks.DECK_STORAGE_KEY]: raw });
    const result = decks.readDeckLibrary(store);
    assert.ok(result.error);
    assert.deepEqual(result.recovery, [raw]);
    assert.equal(store.getItem(decks.DECK_STORAGE_KEY), raw);
    assert.equal(decks.writeDeckLibrary(store, [example], result.recovery).ok, true);
    assert.ok([...store.data.entries()].some(([key, value]) => key.startsWith('mesa:decks:recovery:') && value === raw));
    assert.deepEqual(decks.readDeckLibrary(store).recovery, [raw]);
  }
});

test('quota failures never claim a successful migration or save', () => {
  const original = JSON.stringify([example]);
  const store = storage({ [decks.LEGACY_DECK_KEY]: original }, true);
  const result = decks.readDeckLibrary(store);
  assert.equal(result.decks.length, 1);
  assert.ok(result.error);
  assert.equal(store.getItem(decks.LEGACY_DECK_KEY), original);
  assert.equal(store.getItem(decks.DECK_STORAGE_KEY), null);
  assert.equal(decks.writeDeckLibrary(store, [example]).ok, false);
});

test('Arena, MTGO, SB tags and set suffixes preserve main/sideboard separation', () => {
  const fixtures = [
    'Deck\n4 Lightning Bolt (M10) 146\n20 Mountain\n\nSideboard\n2 Duress',
    '4 Lightning Bolt\n20 Mountain\n\n2 Duress',
    '4x Lightning Bolt\n20 Mountain\nSB: 2 Duress',
    '4 Lightning Bolt\n20 Mountain\n2 Duress [Sideboard]',
  ];
  for (const text of fixtures) {
    const parsed = decks.parseDeckList(text);
    assert.equal(decks.countEntries(parsed.main), 24);
    assert.deepEqual(parsed.sideboard, [{ name: 'Duress', count: 2 }]);
    assert.deepEqual(parsed.skipped, []);
  }
});

test('export/import roundtrip keeps main, sideboard, split names and counts', () => {
  const deck = { ...example, cards: [...example.cards, { name: 'Fire // Ice', count: 2 }] };
  const parsed = decks.parseDeckList(decks.exportDeckList(deck));
  assert.deepEqual(parsed.main, deck.cards);
  assert.deepEqual(parsed.sideboard, deck.sideboard);
});

test('parser reports malformed counts and excluded sections rather than dropping silently', () => {
  const parsed = decks.parseDeckList('Deck\n0 Lightning Bolt\n-1 Forest\n1.5 Island\n9007199254740992 Swamp\n4 Mountain\nMaybeboard\n2 Duress\nCommander\n1 Atraxa, Praetors\' Voice');
  assert.equal(parsed.skipped.length, 4);
  assert.equal(parsed.ignored.length, 1);
  assert.deepEqual(parsed.commanders, [{ name: "Atraxa, Praetors' Voice", count: 1 }]);
  assert.deepEqual(parsed.main, [{ name: 'Mountain', count: 4 }]);
  assert.deepEqual(parsed.sideboard, []);
});

test('parser consolidates duplicates within their section without combining main and sideboard', () => {
  const parsed = decks.parseDeckList('Deck\n2 Lightning Bolt\n2 lightning bolt\nSideboard\n1 Lightning Bolt');
  assert.equal(parsed.main[0].count, 4);
  assert.equal(parsed.sideboard[0].count, 1);
});

test('Pauper counts main and sideboard separately and combines copy limits', () => {
  cache('Test Bolt');
  cache('Forest', { type_line: 'Basic Land — Forest', cmc: 0 });
  const invalid = { id: 'a', name: 'a', cards: [{ name: 'Forest', count: 56 }, { name: 'Test Bolt', count: 4 }], sideboard: [{ name: 'Test Bolt', count: 1 }], format: 'pauper' };
  assert.equal(copiesInDeck(invalid, 'Test Bolt'), 5);
  assert.ok(validateDeckLocal(invalid).issues.some(i => i.code === 'copies'));
  assert.ok(validateDeckLocal({ ...invalid, cards: [{ name: 'Forest', count: 59 }], sideboard: [{ name: 'Forest', count: 16 }] }).issues.some(i => i.code === 'main_count'));
  assert.ok(validateDeckLocal({ ...invalid, sideboard: [{ name: 'Forest', count: 16 }] }).issues.some(i => i.code === 'sideboard_count'));
  assert.equal(validateDeckLocal({ ...invalid, sideboard: [] }).status, 'valid');
});

test('canonical Oracle identity catches aliases across main and sideboard', () => {
  cache('Canonical // Back', { oracle_id: 'same-card', faceNames: ['Alias Front'] });
  const result = validateDeckLocal({ ...example, cards: [{ name: 'Forest', count: 56 }, { name: 'Alias Front', count: 4 }], sideboard: [{ name: 'Canonical // Back', count: 1 }] });
  assert.ok(result.issues.some(i => i.code === 'copies'));
});

test('basic lands and explicit Oracle copy exceptions are respected', () => {
  assert.equal(cardCopyLimit('Snow-Covered Island', null), Infinity);
  assert.equal(cardCopyLimit('Wastes', null), Infinity);
  assert.equal(cardCopyLimit('Test Rats', cache('Test Rats', { oracle_text: 'A deck can have any number of cards named Test Rats.' })), Infinity);
  assert.equal(cardCopyLimit('Test Dwarves', cache('Test Dwarves', { oracle_text: 'A deck can have up to seven cards named Test Dwarves.' })), 7);
  assert.equal(cardCopyLimit('Test Bolt'), 4);
});

test('legality never treats missing or stale metadata as legal', () => {
  cache('Stale Legal', { fetchedAt: Date.now() - 25 * 60 * 60 * 1000 });
  cache('Banned Test', { legalities: { pauper: 'banned' } });
  for (const name of ['Never Cached', 'Stale Legal']) {
    const result = validateDeckLocal({ ...example, cards: [{ name: 'Forest', count: 56 }, { name, count: 4 }], sideboard: [] });
    assert.equal(result.status, 'unknown');
  }
  assert.equal(validateDeckLocal({ ...example, cards: [{ name: 'Forest', count: 56 }, { name: 'Banned Test', count: 4 }], sideboard: [] }).status, 'invalid');
  assert.equal(legalityFresh({ legalities: { pauper: 'legal' } }), false);
});

test('free play accepts legacy deck sizes but unresolved imports remain invalid', () => {
  const free = { ...example, format: 'free', cards: [{ name: 'Forest', count: 40 }], sideboard: [] };
  assert.equal(validateDeckLocal(free).status, 'valid');
  assert.equal(validateDeckLocal({ ...free, unresolved: ['Typo Card'] }).status, 'invalid');
  assert.equal(validateDeckLocal({ ...free, cards: [] }).status, 'invalid');
});

test('shared stats use authoritative mana value, exclude lands/sideboard and disclose missing data', () => {
  cache('Hybrid Test', { mana_cost: '{2/R}', cmc: 2 });
  cache('Creature Test', { type_line: 'Creature — Human', cmc: 3 });
  const deck = { ...example, cards: [{ name: 'Forest', count: 20 }, { name: 'Hybrid Test', count: 4 }, { name: 'Creature Test', count: 2 }, { name: 'Unknown Stats', count: 1 }], sideboard: [{ name: 'Test Bolt', count: 4 }] };
  const stats = deckStats(deck);
  assert.equal(stats.total, 27);
  assert.equal(stats.sideboard, 4);
  assert.equal(stats.unknown, 1);
  assert.equal(stats.lands, 20);
  assert.equal(stats.creatures, 2);
  assert.equal(stats.average, 14 / 6);
  assert.deepEqual(stats.curve, [0, 0, 4, 2, 0, 0, 0]);
  assert.match(statsHTML(deck), /estatísticas estão incompletas/);
});

test('Pauper ready decks contain 60 main, 15 sideboard and stay separate from legacy templates', () => {
  const pauper = decks.DEFAULT_DECKS.filter(d => d.format === 'pauper');
  assert.equal(pauper.length, 12);
  for (const deck of pauper) { assert.equal(decks.deckSize(deck), 60); assert.equal(decks.countEntries(deck.sideboard), 15); assert.equal(deck.builtin, true); }
  assert.equal(decks.DEFAULT_DECKS.filter(d => d.format === 'free').length, 0, 'every 60-card ready deck names the format it was built for');
});

test('Standard ready decks have 60 main, up to 15 sideboard, and check cards against Standard', () => {
  const standard = decks.DEFAULT_DECKS.filter(d => d.format === 'standard');
  assert.equal(standard.length, 16);
  for (const deck of standard) { assert.equal(decks.deckSize(deck), 60); assert.ok(decks.countEntries(deck.sideboard) <= 15); assert.equal(deck.builtin, true); }
  assert.equal(decks.scryfallFormat('standard'), 'standard');
  assert.equal(decks.isConstructed('standard'), true);
  assert.equal(decks.FORMAT_LABEL.standard, 'Standard');
  const short = { id: 's', name: 'S', format: 'standard', cards: [{ name: 'Island', count: 59 }], sideboard: [{ name: 'Island', count: 16 }] };
  const codes = validateDeckLocal(short).issues.map(i => i.code);
  assert.ok(codes.includes('main_count') && codes.includes('sideboard_count'));
});

test('Sacola 50 ready decks have 60 main, up to 15 sideboard, and check cards against Legacy', () => {
  const sacola = decks.DEFAULT_DECKS.filter(d => d.format === 'sacola50');
  assert.equal(sacola.length, 17);
  for (const deck of sacola) { assert.equal(decks.deckSize(deck), 60); assert.ok(decks.countEntries(deck.sideboard) <= 15); assert.match(deck.id, /^sacola-/); }
  assert.equal(decks.scryfallFormat('sacola50'), 'legacy');
  assert.equal(decks.scryfallFormat('free'), undefined);
  const short = { id: 's', name: 'S', format: 'sacola50', cards: [{ name: 'Island', count: 59 }], sideboard: [{ name: 'Island', count: 16 }] };
  const codes = validateDeckLocal(short).issues.map(i => i.code);
  assert.ok(codes.includes('main_count') && codes.includes('sideboard_count'));
  assert.match(decks.SACOLA_HINT, /R\$ 50/);
});


test('import into an empty deck keeps ID, name, format and unknown metadata', () => {
  const target = { ...example, name: 'Meu rascunho', cards: [], sideboard: [], sourceTemplateId: 'old-template', custom: { favorite: true } };
  const incoming = { ...example, id: 'new-id', name: 'Other name', format: 'free', importSource: '4 Lightning Bolt' };
  const result = applyDeckImport(target, incoming, 'replace');
  assert.equal(result.id, target.id); assert.equal(result.name, target.name); assert.equal(result.format, target.format);
  assert.equal(result.sourceTemplateId, 'old-template'); assert.deepEqual(result.custom, { favorite: true });
  assert.deepEqual(result.cards, incoming.cards); assert.deepEqual(result.sideboard, incoming.sideboard);
  assert.deepEqual(target.cards, []); assert.notEqual(result.cards, incoming.cards);
});

test('merge sums canonical copies independently in main and sideboard without mutating inputs', () => {
  const target = { ...example, cards: [{ name: 'Lightning Bolt', count: 2, oracleId: 'bolt' }], unresolved: ['Unknown Card'] };
  const incoming = { ...example, cards: [{ name: 'Raio', count: 2, oracleId: 'bolt' }, { name: 'Unknown Card', count: 1 }], sideboard: [{ name: 'duress', count: 1 }, { name: 'Lightning Bolt', count: 1 }], unresolved: ['Unknown Card'] };
  const before = JSON.stringify([target, incoming]);
  const result = applyDeckImport(target, incoming, 'merge');
  assert.equal(result.cards[0].count, 4); assert.equal(result.cards.length, 2);
  assert.deepEqual(result.sideboard.map(e => e.count), [3, 1]);
  assert.deepEqual(result.unresolved, ['Unknown Card']);
  assert.equal(JSON.stringify([target, incoming]), before);
});

test('replace updates both sections and retains original import sources for recovery', () => {
  const target = { ...example, unresolved: ['Old Typo'], importSource: 'original list', importHistory: ['earlier list'] };
  const incoming = { ...example, cards: [{ name: 'Mountain', count: 20 }], sideboard: [], unresolved: [], importSource: 'replacement list' };
  const result = applyDeckImport(target, incoming, 'replace');
  assert.deepEqual(result.cards, incoming.cards); assert.deepEqual(result.sideboard, []); assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.importHistory, ['earlier list', 'original list']); assert.equal(result.importSource, 'replacement list');
  assert.equal(target.sideboard.length, 1);
});

test('empty/malformed imports and overflowing merges leave the target intact', () => {
  const target = structuredClone(example), before = JSON.stringify(target);
  const malformed = decks.parseDeckList('Deck\n0 Lightning Bolt\n-2 Mountain');
  assert.throws(() => applyDeckImport(target, { ...example, cards: malformed.main, sideboard: [] }, 'replace'));
  assert.throws(() => applyDeckImport(target, { ...example, cards: [{ name: 'Lightning Bolt', count: Number.MAX_SAFE_INTEGER }] }, 'merge'));
  assert.throws(() => applyDeckImport(target, { ...example, cards: [{ name: 'Mountain', count: -1 }] }, 'replace'));
  assert.throws(() => applyDeckImport(target, example, null));
  assert.equal(JSON.stringify(target), before);
});

test('editing as a list replaces every section but keeps the original imported list', () => {
  const target = { ...example, importSource: 'original list', importHistory: ['earlier list'], bracket: undefined };
  const incoming = { ...example, cards: [{ name: 'Lightning Bolt', count: 3 }, { name: 'Mountain', count: 20 }], sideboard: [], importSource: 'edited text' };
  const result = applyDeckListEdit(target, incoming);
  assert.equal(result.id, target.id); assert.equal(result.name, target.name);
  assert.deepEqual(result.cards, incoming.cards); assert.deepEqual(result.sideboard, []);
  assert.equal(result.importSource, 'original list'); assert.deepEqual(result.importHistory, ['earlier list']);
  assert.equal('importSource' in applyDeckListEdit(example, incoming), false, 'a deck that never imported a list does not gain one');
});

test('list changes show what enters and leaves each section, one line per printing', () => {
  const before = { ...example, cards: [{ name: 'Lightning Bolt', count: 4 }, { name: 'Shock', count: 2 }], sideboard: [{ name: 'Duress', count: 2 }] };
  const after = { ...example, cards: [{ name: 'lightning bolt', count: 3 }, { name: 'Lightning Bolt', count: 1, set: 'm10', cn: '146' }, { name: 'Shock', count: 2 }], sideboard: [{ name: 'Duress', count: 3 }] };
  assert.deepEqual(deckListChanges(before, after), [
    { section: 'cards', added: [{ name: 'Lightning Bolt', count: 1, set: 'm10', cn: '146' }], removed: [{ name: 'Lightning Bolt', count: 1 }] },
    { section: 'sideboard', added: [{ name: 'Duress', count: 1 }], removed: [] },
  ]);
  assert.deepEqual(deckListChanges(before, structuredClone(before)), []);
  const moved = deckListChanges({ ...example, cards: [{ name: 'Elf', count: 1 }], commanders: [] }, { ...example, cards: [], sideboard: example.sideboard, commanders: [{ name: 'Elf', count: 1 }] });
  assert.deepEqual(moved.map(c => c.section), ['commanders', 'cards']);
});

test('same-deck imports survive quota failures as recoverable in-memory edits', () => {
  const initial = JSON.stringify({ version: 2, decks: [example], recovery: [] });
  const store = storage({ [decks.DECK_STORAGE_KEY]: initial }, true);
  const result = applyDeckImport(example, { ...example, cards: [{ name: 'Mountain', count: 20 }], sideboard: [] }, 'replace');
  assert.equal(decks.writeDeckLibrary(store, [result]).ok, false);
  assert.equal(store.getItem(decks.DECK_STORAGE_KEY), initial);
  assert.equal(result.id, example.id); assert.equal(result.cards[0].count, 20);
});


test('fresh Create snapshots equal normalized storage; actual external changes are detected', () => {
  const fresh = { id: 'new', name: 'Novo deck', cards: [], sideboard: [], format: 'free', updatedAt: 'now' };
  const store = storage();
  assert.equal(decks.writeDeckLibrary(store, [fresh]).ok, true);
  const loaded = decks.readDeckLibrary(store).decks[0];
  assert.equal(loaded.builtin, false); assert.equal(fresh.builtin, undefined);
  assert.equal(deckImportSnapshot(fresh), deckImportSnapshot(loaded));
  assert.notEqual(deckImportSnapshot(fresh), deckImportSnapshot({ ...loaded, name: 'Changed elsewhere' }));
  assert.notEqual(deckImportSnapshot(fresh), deckImportSnapshot({ ...loaded, cards: [{ name: 'Forest', count: 1 }] }));
});


test('Commander imports, exports, merges, and storage preserve a separate command zone', () => {
  const commander = { ...example, format: 'commander', cards: [{ name: 'Forest', count: 99 }], sideboard: [], commanders: [{ name: 'Elvish Archdruid', count: 1 }] };
  const parsed = decks.parseDeckList(decks.exportDeckList(commander));
  assert.deepEqual(parsed.commanders, commander.commanders);
  assert.equal(decks.deckSize(commander), 99); assert.equal(decks.totalDeckSize(commander), 100);
  const target = { ...commander, commanders: [{ name: 'Old Commander', count: 1 }] };
  assert.deepEqual(applyDeckImport(target, commander, 'replace').commanders, commander.commanders);
  assert.equal(applyDeckImport(target, commander, 'merge').commanders.length, 2);
  assert.equal(target.commanders[0].name, 'Old Commander');
  assert.deepEqual(applyDeckImport(commander, commander, 'merge').commanders, commander.commanders, 'the same commander is not doubled when adding a list');
  const store = storage(); assert.equal(decks.writeDeckLibrary(store, [commander]).ok, true);
  assert.deepEqual(decks.readDeckLibrary(store).decks[0].commanders, commander.commanders);
});

test('Commander local rules enforce 100 total, singleton exceptions, identity including lands, and sideboard', () => {
  cache('Commander Test', { type_line: 'Legendary Creature — Elf', color_identity: ['G'], legalities: { commander: 'legal' } });
  cache('Commander Forest', { type_line: 'Basic Land — Forest', color_identity: ['G'], legalities: { commander: 'legal' } });
  cache('Commander Island', { type_line: 'Basic Land — Island', color_identity: ['U'], legalities: { commander: 'legal' } });
  cache('Commander Bolt', { color_identity: ['G'], legalities: { commander: 'legal' } });
  const d = { id: 'c', name: 'c', format: 'commander', commanders: [{ name: 'Commander Test', count: 1 }], cards: [{ name: 'Commander Forest', count: 99 }], sideboard: [] };
  assert.equal(validateDeckLocal(d).status, 'unknown'); // Partnerships/eligibility require the server.
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Commander Forest', count: 98 }] }).issues.some(i => i.code === 'total_count'));
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Commander Island', count: 99 }] }).issues.some(i => i.code === 'color_identity'));
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Commander Forest', count: 97 }, { name: 'Commander Bolt', count: 2 }] }).issues.some(i => i.code === 'copies'));
  assert.ok(validateDeckLocal({ ...d, sideboard: [{ name: 'Commander Forest', count: 1 }] }).issues.some(i => i.code === 'sideboard_count'));
  assert.equal(cardCopyLimit('Commander Bolt', undefined, 'commander'), 1);
  assert.equal(cardCopyLimit('Test Dwarves', cache('Test Dwarves', { oracle_text: 'A deck can have up to seven cards named Test Dwarves.' }), 'commander'), 7);
  for (const deck of decks.DEFAULT_DECKS.filter(d => d.format === 'commander')) assert.equal(decks.totalDeckSize(deck), 100);
  assert.equal(decks.DEFAULT_DECKS.filter(d => d.format === 'commander').length, 117);
});

test('Oathbreaker local rules: a planeswalker and a signature spell, 60 cards, singleton and identity', () => {
  cache('Oath Walker', { type_line: 'Legendary Planeswalker — Test', color_identity: ['G'], legalities: { oathbreaker: 'legal' } });
  cache('Oath Spell', { type_line: 'Instant', color_identity: ['G'], legalities: { oathbreaker: 'legal' } });
  cache('Oath Forest', { type_line: 'Basic Land — Forest', color_identity: ['G'], legalities: { oathbreaker: 'legal' } });
  cache('Oath Island', { type_line: 'Basic Land — Island', color_identity: ['U'], legalities: { oathbreaker: 'legal' } });
  cache('Oath Bolt', { color_identity: ['G'], legalities: { oathbreaker: 'legal' } });
  cache('Oath Vault', { color_identity: [], legalities: { oathbreaker: 'banned', commander: 'legal' } });
  const d = { id: 'o', name: 'o', format: 'oathbreaker', commanders: [{ name: 'Oath Walker', count: 1 }, { name: 'Oath Spell', count: 1 }], cards: [{ name: 'Oath Forest', count: 58 }], sideboard: [] };
  assert.equal(validateDeckLocal(d).status, 'unknown'); // O servidor confere o oathbreaker e a mágica de assinatura.
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Oath Forest', count: 57 }] }).issues.some(i => i.code === 'total_count'));
  assert.ok(validateDeckLocal({ ...d, commanders: d.commanders.slice(0, 1), cards: [{ name: 'Oath Forest', count: 59 }] }).issues.some(i => i.code === 'commander_count'));
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Oath Island', count: 58 }] }).issues.some(i => i.code === 'color_identity'));
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Oath Forest', count: 56 }, { name: 'Oath Bolt', count: 2 }] }).issues.some(i => i.code === 'copies'));
  assert.ok(validateDeckLocal({ ...d, cards: [{ name: 'Oath Forest', count: 57 }, { name: 'Oath Vault', count: 1 }] }).issues.some(i => i.code === 'banned'));
  assert.ok(validateDeckLocal({ ...d, sideboard: [{ name: 'Oath Forest', count: 1 }] }).issues.some(i => i.code === 'sideboard_count'));
  assert.equal(cardCopyLimit('Oath Bolt', undefined, 'oathbreaker'), 1);
  // A zona de comando fora do Commander e do Oathbreaker é um problema.
  assert.ok(validateDeckLocal(d, 'free').issues.some(i => i.code === 'commander_format'));
  const ready = decks.DEFAULT_DECKS.filter(d => d.format === 'oathbreaker');
  assert.equal(ready.length, 10);
  for (const deck of ready) { assert.equal(decks.totalDeckSize(deck), 60, deck.id); assert.equal(deck.commanders.length, 2, deck.id); assert.ok(deck.price, deck.id); }
  // Os prontos de Oathbreaker só aparecem no Oathbreaker, nem no Livre nem no Commander.
  assert.ok(ready.every(deck => decks.readyDeckFits(deck, 'oathbreaker') && !decks.readyDeckFits(deck, 'free') && !decks.readyDeckFits(deck, 'commander')));
  assert.equal(decks.scryfallFormat('oathbreaker'), 'oathbreaker');
  assert.ok(decks.hasCommandZone('oathbreaker') && decks.hasCommandZone('commander') && !decks.hasCommandZone('pauper'));
});

test('Precon lists only the 43 official precons as they came in the box, under Commander rules', () => {
  const precons = decks.DEFAULT_DECKS.filter(d => d.precon);
  assert.equal(precons.length, 43);
  assert.equal(new Set(precons.map(d => d.precon.series)).size, 10);
  for (const deck of precons) {
    assert.equal(deck.format, 'commander', deck.id);
    assert.equal(decks.totalDeckSize(deck), 100, deck.id);
    assert.ok(deck.bracket && deck.price && deck.precon.name && deck.precon.set && deck.precon.year >= 2013, deck.id);
    assert.ok(decks.readyDeckFits(deck, 'precon') && decks.readyDeckFits(deck, 'commander'), deck.id);
  }
  // Os decks prontos adaptados de um precon deram lugar ao original, com o mesmo id; os outros de Commander não são precons.
  for (const id of ['commander-bello', 'commander-caesar', 'commander-chatterfang', 'commander-cloud', 'commander-frodo-sam', 'commander-mothman', 'commander-sauron', 'commander-terra', 'commander-bumbleflower', 'commander-yshtola'])
    assert.ok(precons.some(d => d.id === id), id);
  assert.equal(decks.DEFAULT_DECKS.filter(d => decks.readyDeckFits(d, 'precon')).length, 43);
  const urza = decks.DEFAULT_DECKS.find(d => d.id === 'commander-urza');
  assert.ok(!decks.isPrecon(urza) && !decks.readyDeckFits(urza, 'precon'));
  // A cópia do jogador, com as mesmas cartas, não vale no Precon e nunca guarda o precon nem o formato.
  const mine = decks.normalizeDeck({ ...structuredClone(precons[0]), id: 'copia', format: 'precon' });
  assert.equal(mine.precon, undefined); assert.equal(mine.format, 'commander'); assert.ok(!decks.isPrecon(mine));
  assert.ok(validateDeckLocal(mine, 'precon').issues.some(i => i.code === 'precon'));
  assert.equal(validateDeckLocal(mine, 'precon').status, 'invalid');
  assert.ok(!validateDeckLocal(precons[0], 'precon').issues.some(i => i.code === 'precon'));
  assert.equal(decks.scryfallFormat('precon'), 'commander');
  assert.ok(decks.hasCommandZone('precon') && decks.commanderRules('precon') && !decks.commanderRules('oathbreaker'));
});

test('starter deck price shows only when recorded, and not on personal decks', () => {
  const urza = decks.DEFAULT_DECKS.find(d => d.id === 'commander-urza');
  assert.equal(decks.deckPriceText(urza), 'US$ 1.605,93');
  assert.match(decks.deckPriceDescription(urza), /^Quanto custam as 100 cartas em dólar, pela edição mais barata de cada uma, no Scryfall em 23\/10\/2026\./);
  assert.match(deckPriceHTML(urza, 'x', true), /tabindex="0" aria-describedby="price-tip-commander-urza">US\$ 1\.605,93<span class="deck-price-tip" id="price-tip-commander-urza" role="tooltip">/);
  assert.doesNotMatch(deckPriceHTML(urza, 'x', false), /tabindex/);
  assert.equal(deckPriceHTML({ ...urza, builtin: false }, 'x', true), '');
  assert.equal(decks.deckPriceText({ ...urza, price: undefined }), '');
  assert.equal(decks.deckPriceText({ ...urza, builtin: false }), '');
  // Todo deck pronto de Commander tem preço.
  for (const deck of decks.DEFAULT_DECKS.filter(d => d.format === 'commander')) assert.ok(deck.price, deck.id);
  for (const deck of decks.DEFAULT_DECKS.filter(d => d.price)) assert.ok(deck.price.usd > 0 && /^\d{4}-\d{2}-\d{2}$/.test(deck.price.date), deck.id);
});


test('Commander tags preserve command designation and do not infer a sideboard from blank lines', () => {
  for (const marker of ['*CMDR*', '[Commander]']) {
    for (const separator of ['\n', '\n\n']) {
      const parsed = decks.parseDeckList(`1 Marwyn, the Nurturer (DOM) 172 ${marker}${separator}99 Forest`);
      assert.deepEqual(parsed.commanders, [{ name: 'Marwyn, the Nurturer', count: 1, set: 'dom', cn: '172' }]);
      assert.deepEqual(parsed.main, [{ name: 'Forest', count: 99 }]);
      assert.deepEqual(parsed.sideboard, []);
      assert.deepEqual(parsed.skipped, []);
      assert.deepEqual(parsed.ignored, []);
    }
  }
  const explicit = decks.parseDeckList('1 Marwyn, the Nurturer [Commander]\n\n99 Forest\nSB: 1 Island');
  assert.deepEqual(explicit.sideboard, [{ name: 'Island', count: 1 }]);
});

test('each format lists only the ready decks built for it; Livre lists every 60-card one', () => {
  const count = f => decks.DEFAULT_DECKS.filter(d => decks.readyDeckFits(d, f)).length;
  assert.equal(count('standard'), 16);
  assert.equal(count('pauper'), 12);
  assert.equal(count('sacola50'), 17, 'Standard and Pauper decks are Legacy-legal but stay out of Sacola 50');
  assert.equal(count('free'), 45);
  assert.equal(count('commander'), decks.DEFAULT_DECKS.filter(d => d.format === 'commander').length);
});

test('a chosen cover card wins while it stays in the main deck, never in Commander', () => {
  cache('Cover Dragon', { type_line: 'Creature — Dragon', mana_cost: '{4}{R}{R}', cmc: 6, image_uris: { art_crop: 'dragon.jpg' } });
  cache('Cover Shock', { image_uris: { art_crop: 'shock.jpg' } });
  const deck = { id: 'c', name: 'C', format: 'free', cards: [{ name: 'Cover Dragon', count: 2 }, { name: 'Cover Shock', count: 4 }], sideboard: [] };
  assert.equal(deckArt(deck), 'dragon.jpg');
  assert.equal(deckArt({ ...deck, cover: 'Cover Shock' }), 'shock.jpg');
  assert.equal(deckCover({ ...deck, cover: 'Cover Shock' }), 'Cover Shock');
  assert.equal(deckArt({ ...deck, cover: 'Not In Deck' }), 'dragon.jpg');
  assert.equal(deckArt({ ...deck, cards: [deck.cards[0]], sideboard: [deck.cards[1]], cover: 'Cover Shock' }), 'dragon.jpg');
  assert.equal(deckArt({ ...deck, format: 'commander', cover: 'Cover Shock' }), 'dragon.jpg');
  const store = storage({ [decks.DECK_STORAGE_KEY]: JSON.stringify({ version: 2, decks: [{ ...deck, cover: 'Cover Shock' }, { ...deck, id: 'bad', cover: 3 }] }) });
  const read = decks.readDeckLibrary(store);
  assert.equal(read.decks.length, 1);
  assert.equal(read.decks[0].cover, 'Cover Shock');
});

test('the printing (set and collector number) survives import and export, one line per printing', () => {
  const parsed = decks.parseDeckList('3 Plains (DMU) 277\n2 Plains (ONE) 267\n1 Plains (DMU) 277\n1x Lightning Bolt (m10) 146 [Burn]\n1 Llanowar Elves (DOM)\n4 Shock');
  assert.deepEqual(parsed.main, [
    { name: 'Plains', count: 4, set: 'dmu', cn: '277' },
    { name: 'Plains', count: 2, set: 'one', cn: '267' },
    { name: 'Lightning Bolt', count: 1, set: 'm10', cn: '146' },
    { name: 'Llanowar Elves', count: 1, set: 'dom' },
    { name: 'Shock', count: 4 },
  ]);
  const deck = { id: 'x', name: 'Séries', cards: parsed.main };
  assert.equal(decks.exportDeckList(deck), 'Deck\n4 Plains (DMU) 277\n2 Plains (ONE) 267\n1 Lightning Bolt (M10) 146\n1 Llanowar Elves (DOM)\n4 Shock\n');
  assert.deepEqual(decks.parseDeckList(decks.exportDeckList(deck)).main, parsed.main);
  assert.equal(decks.entryKey(parsed.main[0]) === decks.entryKey(parsed.main[1]), false);
  assert.equal(decks.entryKey(parsed.main[4]), 'Shock');
});

test('promoting a legendary creature swaps it with the current commander, keeping the card total', () => {
  const { promoteToCommander } = decks;
  const deck = { id: 'p', name: 'P', format: 'commander', commanders: [{ name: 'Krenko, Mob Boss', count: 1 }], cards: [{ name: 'Goblin Guide', count: 1 }, { name: 'Zada, Hedron Grinder', count: 1, set: 'bfz', cn: '162' }, { name: 'Mountain', count: 30 }] };
  assert.equal(promoteToCommander(deck, 'Zada, Hedron Grinder|bfz|162'), true);
  assert.deepEqual(deck.commanders, [{ name: 'Zada, Hedron Grinder', count: 1, set: 'bfz', cn: '162' }]);
  assert.deepEqual(deck.cards.map(e => e.name), ['Goblin Guide', 'Mountain', 'Krenko, Mob Boss']);
  const empty = { id: 'e', name: 'E', format: 'commander', cards: [{ name: 'Krenko, Mob Boss', count: 2 }] };
  assert.equal(promoteToCommander(empty, 'Krenko, Mob Boss'), true);
  assert.deepEqual(empty.commanders, [{ name: 'Krenko, Mob Boss', count: 1 }]);
  assert.deepEqual(empty.cards, [{ name: 'Krenko, Mob Boss', count: 1 }]);
  assert.equal(promoteToCommander(empty, 'Nada'), false);
});
