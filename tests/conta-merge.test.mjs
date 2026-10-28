import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const { COPY_SUFFIX, applyRemote, deckFingerprint, decksToAsk, joinAccount, planFirstLogin, resolveConflict } = await import('../src/conta/merge.ts');

const deck = (id, name, cards, extra = {}) => ({ id, name, format: 'pauper', cards: cards.map(([count, n]) => ({ name: n, count })), ...extra });
const ids = () => { let n = 0; return () => `novo-${++n}`; };
const NOW = '2026-10-28T12:00:00.000Z';
const BOLT = [[4, 'Lightning Bolt'], [56, 'Mountain']];

test('the fingerprint ignores ids, dates, order, case and split entries, but not the name or the cards', () => {
  const a = deck('a', 'Burn', BOLT, { updatedAt: '2020', importHistory: ['x'] });
  const b = deck('b', 'Burn ', [[56, 'mountain'], [2, 'Lightning Bolt'], [2, 'lightning bolt']]);
  assert.equal(deckFingerprint(a), deckFingerprint(b));
  assert.notEqual(deckFingerprint(a), deckFingerprint(deck('a', 'Burn 2', BOLT)));
  assert.notEqual(deckFingerprint(a), deckFingerprint(deck('a', 'Burn', [[3, 'Lightning Bolt'], [57, 'Mountain']])));
  assert.notEqual(deckFingerprint(a), deckFingerprint(deck('a', 'Burn', BOLT, { sideboard: [{ name: 'Pyroblast', count: 1 }] })));
  assert.notEqual(deckFingerprint(a), deckFingerprint(deck('a', 'Burn', BOLT, { format: 'free' })));
});

test('first login: only decks the account lacks are asked about; identical copies with other ids are not', () => {
  const account = [deck('1', 'Burn', BOLT), deck('2', 'Elfos', [[60, 'Forest']])];
  const local = [
    deck('1', 'Burn', BOLT),                        // the same deck
    deck('x', 'Elfos', [[60, 'Forest']]),           // same content, made on another device
    deck('3', 'Fadas', [[60, 'Island']]),           // only here
    deck('2', 'Elfos', [[59, 'Forest'], [1, 'Llanowar Elves']]), // edited here and there
    deck('pronto', 'Pronto', BOLT, { builtin: true }),
  ];
  const plan = planFirstLogin(local, account);
  assert.deepEqual(plan.onlyLocal.map(d => d.id), ['3']);
  assert.deepEqual(plan.conflicts.map(c => c.local.id), ['2']);
  assert.equal(decksToAsk(plan), 2);
  assert.equal(decksToAsk(planFirstLogin([deck('1', 'Burn', BOLT)], account)), 0, 'nothing to ask');
  assert.equal(decksToAsk(planFirstLogin([], account)), 0);
});

test('joining keeps every deck: the account version takes the id, the local one becomes a marked copy', () => {
  const account = [deck('1', 'Burn', BOLT), deck('2', 'Elfos', [[60, 'Forest']]), deck('9', 'Só na conta', [[60, 'Swamp']])];
  const editedHere = deck('2', 'Elfos', [[59, 'Forest'], [1, 'Llanowar Elves']]);
  const local = [deck('3', 'Fadas', [[60, 'Island']]), editedHere, deck('x', 'Burn', BOLT)];
  const { decks, upload } = joinAccount(local, account, ids(), NOW);
  assert.deepEqual(decks.map(d => [d.id, d.name]), [
    ['3', 'Fadas'], ['2', 'Elfos'], ['novo-1', `Elfos${COPY_SUFFIX}`], ['1', 'Burn'], ['9', 'Só na conta'],
  ]);
  assert.deepEqual(decks[1].cards, account[1].cards, 'the account version keeps the id');
  assert.deepEqual(decks[2].cards, editedHere.cards, 'the local edit survives as the copy');
  assert.equal(decks[2].updatedAt, NOW);
  assert.deepEqual(upload.map(d => d.id), ['3', 'novo-1']);
  assert.equal(editedHere.name, 'Elfos', 'inputs are not mutated');
});

test('a copy of a copy is not marked twice', () => {
  const local = [deck('2', `Elfos${COPY_SUFFIX}`, [[60, 'Forest']])];
  const { decks } = joinAccount(local, [deck('2', `Elfos${COPY_SUFFIX}`, [[60, 'Island']])], ids(), NOW);
  assert.equal(decks[1].name, `Elfos${COPY_SUFFIX}`);
});

test('a conflicting local version the account already has elsewhere is not copied again', () => {
  const account = [deck('1', 'Burn', BOLT), deck('2', 'Burn', [[60, 'Mountain']])];
  const plan = planFirstLogin([deck('1', 'Burn', [[60, 'Mountain']])], account);
  assert.equal(decksToAsk(plan), 0);
});

test('push conflicts: editing beats deleting, two edits keep both, equal edits keep one', () => {
  const mine = deck('1', 'Burn', [[60, 'Mountain']]), theirs = deck('1', 'Burn', BOLT);
  assert.deepEqual(resolveConflict({ local: mine, account: null }, ids(), NOW), { keep: mine, resend: mine, copy: null });
  assert.deepEqual(resolveConflict({ local: null, account: theirs }, ids(), NOW), { keep: theirs, resend: null, copy: null });
  assert.deepEqual(resolveConflict({ local: null, account: null }, ids(), NOW), { keep: null, resend: null, copy: null });
  assert.deepEqual(resolveConflict({ local: deck('1', 'Burn', BOLT, { updatedAt: 'x' }), account: theirs }, ids(), NOW), { keep: theirs, resend: null, copy: null });
  const both = resolveConflict({ local: mine, account: theirs }, ids(), NOW);
  assert.equal(both.keep, theirs);
  assert.equal(both.copy.id, 'novo-1');
  assert.equal(both.copy.name, `Burn${COPY_SUFFIX}`);
  assert.deepEqual(both.copy.cards, mine.cards);
});

test('remote changes replace, add and delete, but never touch decks with a pending local change', () => {
  const local = [deck('1', 'A', BOLT), deck('2', 'B', BOLT), deck('3', 'C', BOLT)];
  const out = applyRemote(local, [
    { id: '1', deck: deck('1', 'A editado', BOLT) },
    { id: '2', deleted: true },
    { id: '3', deck: deck('3', 'C de lá', BOLT) },
    { id: '4', deck: deck('4', 'Novo', BOLT) },
    { id: '5', deleted: true },
  ], new Set(['3']));
  assert.deepEqual(out.map(d => [d.id, d.name]), [['4', 'Novo'], ['1', 'A editado'], ['3', 'C']]);
  assert.equal(local.length, 3, 'input untouched');
});
